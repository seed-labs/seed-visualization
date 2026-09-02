package dockeriface

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	dockerapi "seed-visualization/shared/go/docker-api"
)

const seedMetaPrefix = "org.seedsecuritylabs.seedemu.meta."

type SeedNodeMeta struct {
	Name        string
	Role        string
	ASN         int
	DisplayName string
	Description string
	Custom      string
	Longitude   string
	Latitude    string
}

type SeedNetMeta struct {
	Name        string
	Scope       string
	Type        string
	Prefix      string
	DisplayName string
	Description string
	Longitude   string
	Latitude    string
}

type seedContainerInfo struct {
	ID     string
	Names  []string
	Labels map[string]string
	Meta   SeedNodeMeta
}

type seedNetworkInfo struct {
	ID     string
	Name   string
	Labels map[string]string
	Meta   SeedNetMeta
}

type Interface struct {
	ContainerID      string            `json:"containerId"`
	ContainerName    string            `json:"containerName"`
	ContainerPID     int               `json:"containerPid"`
	NodeID           string            `json:"nodeId,omitempty"`
	NodeName         string            `json:"nodeName,omitempty"`
	NodeLabel        string            `json:"nodeLabel,omitempty"`
	NodeType         string            `json:"nodeType,omitempty"`
	Labels           map[string]string `json:"labels,omitempty"`
	NetworkID        string            `json:"networkId,omitempty"`
	NetworkName      string            `json:"networkName,omitempty"`
	NetworkLabel     string            `json:"networkLabel,omitempty"`
	ContainerIfName  string            `json:"containerIfName"`
	ContainerIfIndex int               `json:"containerIfIndex"`
	ContainerIfLink  int               `json:"containerIfLink"`
	ContainerMAC     string            `json:"containerMac,omitempty"`
	ContainerIPv4    string            `json:"containerIpv4,omitempty"`
	HostIfName       string            `json:"hostIfName"`
	HostIfIndex      int               `json:"hostIfIndex"`
}

type Index struct {
	ByHostIfIndex   map[uint32]Interface
	ByHostIfName    map[string]Interface
	ByContainerMAC  map[string]Interface
	ByContainerIPv4 map[string]Interface
}

type DiscoverOptions struct {
	OnlySeedContainers bool
	MaxConcurrency     int
}

func NewIndex(interfaces []Interface) Index {
	index := Index{
		ByHostIfIndex:   map[uint32]Interface{},
		ByHostIfName:    map[string]Interface{},
		ByContainerMAC:  map[string]Interface{},
		ByContainerIPv4: map[string]Interface{},
	}
	for _, item := range interfaces {
		index.ByHostIfIndex[uint32(item.HostIfIndex)] = item
		index.ByHostIfName[item.HostIfName] = item
		if item.ContainerMAC != "" {
			index.ByContainerMAC[NormalizeMAC(item.ContainerMAC)] = item
		}
		if item.ContainerIPv4 != "" {
			index.ByContainerIPv4[item.ContainerIPv4] = item
		}
	}
	return index
}

func NormalizeMAC(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func (i Index) HostInterfaceNames() []string {
	seen := map[string]struct{}{}
	names := make([]string, 0, len(i.ByHostIfName))
	for name := range i.ByHostIfName {
		if name == "" {
			continue
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		names = append(names, name)
	}
	return names
}

func Discover(ctx context.Context, socketPath string, opts DiscoverOptions) ([]Interface, error) {
	client := dockerapi.New(socketPath)
	containers, err := client.ListContainers(ctx)
	if err != nil {
		return nil, err
	}
	seedContainers := getContainers(containers, opts.OnlySeedContainers)
	seedNetworks := []seedNetworkInfo{}
	if networks, err := client.ListNetworks(ctx); err == nil {
		seedNetworks = getNetworks(networks)
	}
	networkIndex := newNetworkIndex(seedNetworks)

	hostInterfaces, err := hostInterfacesByIndex()
	if err != nil {
		return nil, err
	}

	maxConcurrency := opts.MaxConcurrency
	if maxConcurrency <= 0 {
		maxConcurrency = 32
	}

	var (
		mu       sync.Mutex
		wg       sync.WaitGroup
		firstErr error
		result   []Interface
	)
	sem := make(chan struct{}, maxConcurrency)

	for _, container := range seedContainers {
		container := container
		wg.Add(1)
		go func() {
			defer wg.Done()

			select {
			case sem <- struct{}{}:
				defer func() { <-sem }()
			case <-ctx.Done():
				mu.Lock()
				if firstErr == nil {
					firstErr = ctx.Err()
				}
				mu.Unlock()
				return
			}

			items, err := discoverContainerInterfaces(ctx, client, container, hostInterfaces, networkIndex)
			mu.Lock()
			defer mu.Unlock()
			if err != nil && firstErr == nil {
				firstErr = err
				return
			}
			result = append(result, items...)
		}()
	}
	wg.Wait()
	if firstErr != nil {
		return nil, firstErr
	}

	return result, nil
}

func discoverContainerInterfaces(
	ctx context.Context,
	client *dockerapi.Client,
	container seedContainerInfo,
	hostInterfaces map[int]hostInterface,
	networkIndex map[string]seedNetworkInfo,
) ([]Interface, error) {
	inspect, err := client.InspectContainer(ctx, container.ID)
	if err != nil {
		return nil, err
	}
	if inspect.State.Pid <= 0 {
		return nil, nil
	}
	if isUnsupportedNetworkMode(inspect.HostConfig.NetworkMode) {
		return nil, nil
	}

	containerIfaces, err := containerInterfaces(ctx, inspect.State.Pid)
	if err != nil {
		return nil, fmt.Errorf("discover container %s interfaces: %w", dockerapi.ShortID(inspect.ID), err)
	}

	result := make([]Interface, 0, len(containerIfaces))
	for _, containerIface := range containerIfaces {
		if containerIface.IfLink == containerIface.IfIndex {
			continue
		}

		hostIface, ok := hostInterfaces[containerIface.IfLink]
		if !ok {
			continue
		}

		networkEndpoint := matchDockerNetwork(containerIface.MAC, inspect.NetworkSettings.Networks)
		network := networkIndex[networkEndpoint.NetworkID]
		result = append(result, Interface{
			ContainerID:      inspect.ID,
			ContainerName:    cleanContainerName(inspect.Name, container.Names),
			ContainerPID:     inspect.State.Pid,
			NodeID:           container.Meta.Name,
			NodeName:         nodeDisplayName(container.Meta),
			NodeLabel:        nodeLabel(container.Meta),
			NodeType:         container.Meta.Role,
			Labels:           container.Labels,
			NetworkID:        networkEndpoint.NetworkID,
			NetworkName:      networkEndpoint.Name,
			NetworkLabel:     networkLabel(network, networkEndpoint.Name),
			ContainerIfName:  containerIface.Name,
			ContainerIfIndex: containerIface.IfIndex,
			ContainerIfLink:  containerIface.IfLink,
			ContainerMAC:     containerIface.MAC,
			ContainerIPv4:    networkEndpoint.IPv4,
			HostIfName:       hostIface.Name,
			HostIfIndex:      hostIface.IfIndex,
		})
	}

	return result, nil
}

func nodeDisplayName(meta SeedNodeMeta) string {
	if strings.TrimSpace(meta.DisplayName) != "" {
		return strings.TrimSpace(meta.DisplayName)
	}
	return strings.TrimSpace(meta.Name)
}

func nodeLabel(meta SeedNodeMeta) string {
	if strings.TrimSpace(meta.DisplayName) != "" {
		return strings.TrimSpace(meta.DisplayName)
	}
	if meta.ASN != 0 && strings.TrimSpace(meta.Name) != "" {
		return fmt.Sprintf("%d/%s", meta.ASN, strings.TrimSpace(meta.Name))
	}
	return strings.TrimSpace(meta.Name)
}

func networkLabel(network seedNetworkInfo, fallbackName string) string {
	if strings.TrimSpace(network.Meta.DisplayName) != "" {
		return strings.TrimSpace(network.Meta.DisplayName)
	}
	if strings.TrimSpace(network.Meta.Scope) != "" && strings.TrimSpace(network.Meta.Name) != "" {
		return strings.TrimSpace(network.Meta.Scope) + "/" + strings.TrimSpace(network.Meta.Name)
	}
	return strings.TrimSpace(fallbackName)
}

func isUnsupportedNetworkMode(mode string) bool {
	mode = strings.TrimSpace(mode)
	return mode == "" ||
		mode == "host" ||
		mode == "none" ||
		strings.HasPrefix(mode, "container:")
}

func getContainers(containers []dockerapi.ContainerListItem, onlySeedContainers bool) []seedContainerInfo {
	result := make([]seedContainerInfo, 0, len(containers))
	for _, container := range containers {
		withMeta := toSeedContainerInfo(container)
		if onlySeedContainers && withMeta.Meta.Name == "" {
			continue
		}
		result = append(result, withMeta)
	}
	return result
}

func getNetworks(networks []dockerapi.NetworkListItem) []seedNetworkInfo {
	result := make([]seedNetworkInfo, 0, len(networks))
	for _, network := range networks {
		labels := network.Labels
		if labels == nil {
			labels = map[string]string{}
		}

		withMeta := seedNetworkInfo{
			ID:     network.ID,
			Name:   network.Name,
			Labels: labels,
			Meta:   parseSeedNetMeta(labels),
		}
		if withMeta.Meta.Name == "" {
			continue
		}
		result = append(result, withMeta)
	}
	return result
}

func newNetworkIndex(networks []seedNetworkInfo) map[string]seedNetworkInfo {
	index := map[string]seedNetworkInfo{}
	for _, network := range networks {
		if network.ID != "" {
			index[network.ID] = network
		}
		if network.Name != "" {
			index[network.Name] = network
		}
	}
	return index
}

func toSeedContainerInfo(container dockerapi.ContainerListItem) seedContainerInfo {
	labels := container.Labels
	if labels == nil {
		labels = map[string]string{}
	}

	return seedContainerInfo{
		ID:     container.ID,
		Names:  container.Names,
		Labels: labels,
		Meta:   parseSeedNodeMeta(labels),
	}
}

func parseSeedNodeMeta(labels map[string]string) SeedNodeMeta {
	var node SeedNodeMeta
	for label, value := range labels {
		if !strings.HasPrefix(label, seedMetaPrefix) {
			continue
		}

		key := strings.TrimPrefix(label, seedMetaPrefix)
		switch key {
		case "asn":
			asn, err := strconv.Atoi(value)
			if err == nil {
				node.ASN = asn
			}
		case "nodename":
			node.Name = value
		case "role":
			node.Role = value
		case "displayname":
			node.DisplayName = value
		case "description":
			node.Description = value
		case "custom":
			node.Custom = value
		case "geo.lon":
			node.Longitude = value
		case "geo.lat":
			node.Latitude = value
		}
	}
	return node
}

func parseSeedNetMeta(labels map[string]string) SeedNetMeta {
	var network SeedNetMeta
	for label, value := range labels {
		if !strings.HasPrefix(label, seedMetaPrefix) {
			continue
		}

		key := strings.TrimPrefix(label, seedMetaPrefix)
		switch key {
		case "name":
			network.Name = value
		case "scope":
			network.Scope = value
		case "type":
			network.Type = value
		case "prefix":
			network.Prefix = value
		case "displayname":
			network.DisplayName = value
		case "description":
			network.Description = value
		case "geo.lon":
			network.Longitude = value
		case "geo.lat":
			network.Latitude = value
		}
	}
	return network
}

type hostInterface struct {
	Name    string
	IfIndex int
}

func hostInterfacesByIndex() (map[int]hostInterface, error) {
	entries, err := os.ReadDir("/sys/class/net")
	if err != nil {
		return nil, err
	}

	result := map[int]hostInterface{}
	for _, entry := range entries {
		name := entry.Name()
		ifIndex, err := readIntFile(filepath.Join("/sys/class/net", name, "ifindex"))
		if err != nil {
			continue
		}
		result[ifIndex] = hostInterface{Name: name, IfIndex: ifIndex}
	}
	return result, nil
}

type containerInterface struct {
	Name    string
	IfIndex int
	IfLink  int
	MAC     string
}

type ipLinkInfo struct {
	IfIndex   int    `json:"ifindex"`
	IfName    string `json:"ifname"`
	LinkIndex int    `json:"link_index"`
	Address   string `json:"address"`
}

func containerInterfaces(ctx context.Context, pid int) ([]containerInterface, error) {
	out, err := nsenterOutput(ctx, pid, "ip", "-j", "link")
	if err != nil {
		return nil, err
	}

	var links []ipLinkInfo
	if err := json.Unmarshal([]byte(out), &links); err != nil {
		return nil, err
	}

	result := make([]containerInterface, 0, len(links))
	for _, link := range links {
		if link.IfName == "lo" {
			continue
		}
		if link.LinkIndex == 0 {
			continue
		}
		result = append(result, containerInterface{
			Name:    link.IfName,
			IfIndex: link.IfIndex,
			IfLink:  link.LinkIndex,
			MAC:     strings.ToLower(strings.TrimSpace(link.Address)),
		})
	}
	return result, nil
}

func nsenterInt(ctx context.Context, pid int, path string) (int, error) {
	out, err := nsenterOutput(ctx, pid, "cat", path)
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(strings.TrimSpace(out))
}

func nsenterOutput(ctx context.Context, pid int, args ...string) (string, error) {
	fullArgs := append([]string{"-t", strconv.Itoa(pid), "-n"}, args...)
	cmd := exec.CommandContext(ctx, "nsenter", fullArgs...)
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func readIntFile(path string) (int, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(strings.TrimSpace(string(data)))
}

type dockerNetworkEndpoint struct {
	Name      string
	NetworkID string
	IPv4      string
}

func matchDockerNetwork(mac string, networks map[string]dockerapi.EndpointSettings) dockerNetworkEndpoint {
	if mac == "" {
		return dockerNetworkEndpoint{}
	}
	for name, endpoint := range networks {
		if strings.EqualFold(endpoint.MacAddress, mac) {
			return dockerNetworkEndpoint{
				Name:      name,
				NetworkID: endpoint.NetworkID,
				IPv4:      endpoint.IPAddress,
			}
		}
	}
	return dockerNetworkEndpoint{}
}

func cleanContainerName(inspectName string, names []string) string {
	if inspectName != "" {
		return strings.TrimPrefix(inspectName, "/")
	}
	if len(names) > 0 {
		return strings.TrimPrefix(names[0], "/")
	}
	return ""
}
