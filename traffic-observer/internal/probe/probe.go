package probe

import (
	"errors"
	"fmt"
	"net"
	"strings"

	"github.com/cilium/ebpf"
	"github.com/cilium/ebpf/link"
	"github.com/cilium/ebpf/ringbuf"
	"github.com/cilium/ebpf/rlimit"
)

type Probe struct {
	collection *ebpf.Collection
	reader     *ringbuf.Reader
	filterMap  *ebpf.Map
	links      []link.Link
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

	links, err := attachPrograms(collection, interfaces)
	if err != nil {
		collection.Close()
		return nil, err
	}

	reader, err := ringbuf.NewReader(collection.Maps["events"])
	if err != nil {
		closeLinks(links)
		collection.Close()
		return nil, fmt.Errorf("open ring buffer: %w", err)
	}

	return &Probe{
		collection: collection,
		reader:     reader,
		filterMap:  filterMap,
		links:      links,
	}, nil
}

func (p *Probe) Reader() *ringbuf.Reader {
	return p.reader
}

func (p *Probe) FilterMap() *ebpf.Map {
	return p.filterMap
}

func (p *Probe) Close() error {
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

func attachPrograms(collection *ebpf.Collection, names []string) ([]link.Link, error) {
	ingress := collection.Programs["trace_ingress"]
	if ingress == nil {
		return nil, fmt.Errorf("trace_ingress program not found")
	}

	var attached []link.Link
	for _, name := range names {
		iface, err := net.InterfaceByName(name)
		if err != nil {
			closeLinks(attached)
			return nil, fmt.Errorf("find interface %q: %w", name, err)
		}

		in, err := link.AttachTCX(link.TCXOptions{
			Program:   ingress,
			Interface: iface.Index,
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

func closeLinks(links []link.Link) error {
	var closeErr error
	for _, l := range links {
		closeErr = errors.Join(closeErr, l.Close())
	}
	return closeErr
}
