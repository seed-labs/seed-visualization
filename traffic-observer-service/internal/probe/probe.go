package probe

import (
	"errors"
	"fmt"
	"maps"
	"net"
	"strings"
	"sync"

	"github.com/cilium/ebpf"
	"github.com/cilium/ebpf/link"
	"github.com/cilium/ebpf/ringbuf"
	"github.com/cilium/ebpf/rlimit"
)

type Probe struct {
	mu         sync.RWMutex
	collection *ebpf.Collection
	reader     *ringbuf.Reader
	filterMap  *ebpf.Map
	links      []link.Link
	interfaces []string
	ifIndexes  map[string]int
}

func Open(objectPath string, interfaces []string) (*Probe, error) {
	if err := rlimit.RemoveMemlock(); err != nil {
		return nil, fmt.Errorf("remove memlock rlimit: %w", err)
	}

	spec, err := ebpf.LoadCollectionSpec(objectPath)
	if err != nil {
		return nil, fmt.Errorf("load eBPF object %s: %w", objectPath, err)
	}

	collection, err := ebpf.NewCollection(spec)
	if err != nil {
		return nil, fmt.Errorf("create eBPF collection: %w", err)
	}

	filterMap, err := findFilterMap(collection)
	if err != nil {
		collection.Close()
		return nil, err
	}

	reader, err := ringbuf.NewReader(collection.Maps["events"])
	if err != nil {
		collection.Close()
		return nil, fmt.Errorf("open ring buffer: %w", err)
	}

	probe := &Probe{
		collection: collection,
		reader:     reader,
		filterMap:  filterMap,
	}
	targets, err := ResolveInterfaceNames(interfaces)
	if err == nil {
		err = probe.ReplaceInterfaces(targets)
	}
	if err != nil {
		probe.Close()
		return nil, err
	}

	return probe, nil
}

func (p *Probe) Reader() *ringbuf.Reader {
	return p.reader
}

func (p *Probe) FilterMap() *ebpf.Map {
	return p.filterMap
}

func (p *Probe) Close() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	var closeErr error
	if p.reader != nil {
		closeErr = errors.Join(closeErr, p.reader.Close())
	}
	closeErr = errors.Join(closeErr, closeLinks(p.links))
	if p.collection != nil {
		p.collection.Close()
	}
	return closeErr
}

func (p *Probe) ReplaceInterfaces(targets map[string]int) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if maps.Equal(p.ifIndexes, targets) {
		return nil
	}

	closeErr := closeLinks(p.links)
	p.links = nil
	p.interfaces = nil
	p.ifIndexes = nil

	links, err := attachPrograms(p.collection, targets)
	if err != nil {
		closeLinks(links)
		return err
	}

	p.links = links
	p.ifIndexes = maps.Clone(targets)
	for name := range targets {
		p.interfaces = append(p.interfaces, name)
	}
	return closeErr
}

func (p *Probe) InterfaceCount() int {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return len(p.interfaces)
}

func (p *Probe) InterfaceNames() []string {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return append([]string(nil), p.interfaces...)
}

func IsReaderClosed(err error) bool {
	return errors.Is(err, ringbuf.ErrClosed)
}

func findFilterMap(collection *ebpf.Collection) (*ebpf.Map, error) {
	candidates := []string{
		"filter_cfg",
		"filter_config_map",
		"filter_config_",
	}

	for _, name := range candidates {
		if m := collection.Maps[name]; m != nil {
			return m, nil
		}
	}

	available := make([]string, 0, len(collection.Maps))
	for name := range collection.Maps {
		available = append(available, name)
	}

	return nil, fmt.Errorf("filter map not found; tried=%s available_maps=%s; recompile EBPF_OBJECT after changing packet_trace.bpf.c", strings.Join(candidates, ","), strings.Join(available, ","))
}

func attachPrograms(collection *ebpf.Collection, targets map[string]int) ([]link.Link, error) {
	ingress := collection.Programs["trace_ingress"]
	if ingress == nil {
		return nil, fmt.Errorf("trace_ingress program not found")
	}

	attached := make([]link.Link, 0, len(targets))
	for name, index := range targets {
		in, err := link.AttachTCX(link.TCXOptions{
			Program:   ingress,
			Interface: index,
			Attach:    ebpf.AttachTCXIngress,
		})
		if err != nil {
			closeLinks(attached)
			return nil, fmt.Errorf("attach ingress to %s: %w", name, err)
		}
		attached = append(attached, in)
	}

	return attached, nil
}

func uniqueInterfaceNames(names []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(names))
	for _, name := range names {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		out = append(out, name)
	}
	return out
}

func ResolveInterfaceNames(names []string) (map[string]int, error) {
	names = uniqueInterfaceNames(names)
	if len(names) == 0 {
		return nil, nil
	}
	interfaces, err := net.Interfaces()
	if err != nil {
		return nil, fmt.Errorf("list host interfaces: %w", err)
	}
	byName := make(map[string]int, len(interfaces))
	for _, iface := range interfaces {
		byName[iface.Name] = iface.Index
	}
	targets := make(map[string]int, len(names))
	for _, name := range names {
		index, ok := byName[name]
		if !ok {
			return nil, fmt.Errorf("host interface %q not found", name)
		}
		targets[name] = index
	}
	return targets, nil
}

func closeLinks(links []link.Link) error {
	var closeErr error
	for _, l := range links {
		closeErr = errors.Join(closeErr, l.Close())
	}
	return closeErr
}
