package ifacemanager

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"

	"seed-visualization/traffic-observer-service/internal/dockeriface"
	"seed-visualization/traffic-observer-service/internal/event"
	"seed-visualization/traffic-observer-service/internal/probe"
)

type Manager struct {
	mu           sync.RWMutex
	dockerSocket string
	options      dockeriface.DiscoverOptions
	probe        *probe.Probe

	containerInterfaces []dockeriface.Interface
	containerIndex      dockeriface.Index
	interfaceNames      []string
}

type Snapshot struct {
	Interfaces                   string `json:"interfaces"`
	DiscoveredContainerInterface int    `json:"discoveredContainerInterfaces"`
}

func New(dockerSocket string, options dockeriface.DiscoverOptions, packetProbe *probe.Probe) *Manager {
	return &Manager{
		dockerSocket:   dockerSocket,
		options:        options,
		probe:          packetProbe,
		containerIndex: dockeriface.NewIndex(nil),
		interfaceNames: packetProbe.InterfaceNames(),
	}
}

func (m *Manager) SetExplicitInterfaces(names []string) error {
	if err := m.probe.ReplaceInterfaces(names); err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.interfaceNames = m.probe.InterfaceNames()
	return nil
}

func (m *Manager) EnsureReady(ctx context.Context) (Snapshot, error) {
	if m.AttachedInterfaceCount() > 0 {
		return m.Snapshot(), nil
	}

	snapshot, err := m.Refresh(ctx)
	if err != nil {
		return snapshot, err
	}
	if snapshot.Interfaces == "" {
		return snapshot, fmt.Errorf("no emulator container interfaces discovered")
	}
	return snapshot, nil
}

func (m *Manager) Refresh(ctx context.Context) (Snapshot, error) {
	containerInterfaces, err := dockeriface.Discover(ctx, m.dockerSocket, m.options)
	if err != nil {
		return m.Snapshot(), err
	}

	containerIndex := dockeriface.NewIndex(containerInterfaces)
	interfaceNames := containerIndex.HostInterfaceNames()
	if err := m.probe.ReplaceInterfaces(interfaceNames); err != nil {
		return m.Snapshot(), err
	}

	m.mu.Lock()
	m.containerInterfaces = append([]dockeriface.Interface(nil), containerInterfaces...)
	m.containerIndex = containerIndex
	m.interfaceNames = m.probe.InterfaceNames()
	snapshot := m.snapshotLocked()
	m.mu.Unlock()

	log.Printf("traffic interfaces refreshed: interfaces=%s discoveredContainerInterfaces=%d", snapshot.Interfaces, snapshot.DiscoveredContainerInterface)
	return snapshot, nil
}

func (m *Manager) AttachedInterfaceCount() int {
	return m.probe.InterfaceCount()
}

func (m *Manager) Snapshot() Snapshot {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.snapshotLocked()
}

func (m *Manager) EnrichPacket(packet *event.Packet, ifIndex uint32) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	containerIface, ok := m.containerIndex.ByHostIfIndex[ifIndex]
	if !ok {
		return
	}
	enrichPacket(packet, containerIface)
	enrichPacketEndpoints(packet, m.containerIndex)
	enrichPacketEndpointFromCapturedInterface(packet, containerIface)
}

func (m *Manager) snapshotLocked() Snapshot {
	return Snapshot{
		Interfaces:                   strings.Join(m.interfaceNames, ","),
		DiscoveredContainerInterface: len(m.containerInterfaces),
	}
}

func enrichPacket(packet *event.Packet, containerIface dockeriface.Interface) {
	if packet.IfName == "" {
		packet.IfName = containerIface.HostIfName
	}
	packet.ContainerID = containerIface.ContainerID
	packet.ContainerName = containerIface.ContainerName
	packet.NodeName = containerIface.NodeName
	packet.NodeLabel = containerIface.NodeLabel
	packet.NodeIP = containerIface.ContainerIPv4
	packet.NetworkID = containerIface.NetworkID
	packet.NetworkName = containerIface.NetworkName
	packet.NetworkLabel = containerIface.NetworkLabel
}

func enrichPacketEndpoints(packet *event.Packet, containerIndex dockeriface.Index) {
	if sourceIface, ok := containerIndex.ByContainerIPv4[packet.SourceIP]; ok {
		applySourceEndpoint(packet, sourceIface)
	}
	if destIface, ok := containerIndex.ByContainerIPv4[packet.DestIP]; ok {
		applyDestEndpoint(packet, destIface)
	}

	if packet.SourceContainerID == "" {
		if sourceIface, ok := containerIndex.ByContainerMAC[dockeriface.NormalizeMAC(packet.SourceMAC)]; ok {
			applySourceEndpoint(packet, sourceIface)
		}
	}

	if packet.DestContainerID == "" {
		if destIface, ok := containerIndex.ByContainerMAC[dockeriface.NormalizeMAC(packet.DestMAC)]; ok {
			applyDestEndpoint(packet, destIface)
		}
	}
}

func enrichPacketEndpointFromCapturedInterface(packet *event.Packet, containerIface dockeriface.Interface) {
	switch packet.Direction {
	case event.DirectionIngress:
		if packet.DestContainerID == "" {
			applyDestEndpoint(packet, containerIface)
		}
	case event.DirectionEgress:
		if packet.SourceContainerID == "" {
			applySourceEndpoint(packet, containerIface)
		}
	}
}

func applySourceEndpoint(packet *event.Packet, containerIface dockeriface.Interface) {
	packet.SourceContainerID = containerIface.ContainerID
	packet.SourceContainerName = containerIface.ContainerName
	packet.SourceNodeName = containerIface.NodeName
	packet.SourceNodeIP = containerIface.ContainerIPv4
}

func applyDestEndpoint(packet *event.Packet, containerIface dockeriface.Interface) {
	packet.DestContainerID = containerIface.ContainerID
	packet.DestContainerName = containerIface.ContainerName
	packet.DestNodeName = containerIface.NodeName
	packet.DestNodeIP = containerIface.ContainerIPv4
}
