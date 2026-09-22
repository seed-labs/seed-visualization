//go:build linux

package dockeriface

import (
	"context"
	"fmt"
	"strings"

	"github.com/vishvananda/netlink"
	"github.com/vishvananda/netns"
)

func containerInterfaces(ctx context.Context, pid int) ([]containerInterface, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	ns, err := netns.GetFromPid(pid)
	if err != nil {
		return nil, fmt.Errorf("open network namespace for pid %d: %w", pid, err)
	}
	defer ns.Close()

	handle, err := netlink.NewHandleAt(ns)
	if err != nil {
		return nil, fmt.Errorf("open netlink handle for pid %d: %w", pid, err)
	}
	defer handle.Close()

	links, err := handle.LinkList()
	if err != nil {
		return nil, fmt.Errorf("list links for pid %d: %w", pid, err)
	}
	result := make([]containerInterface, 0, len(links))
	for _, link := range links {
		attrs := link.Attrs()
		if attrs == nil || attrs.Name == "lo" || attrs.ParentIndex == 0 {
			continue
		}
		result = append(result, containerInterface{
			Name:    attrs.Name,
			IfIndex: attrs.Index,
			IfLink:  attrs.ParentIndex,
			MAC:     strings.ToLower(strings.TrimSpace(attrs.HardwareAddr.String())),
		})
	}
	return result, ctx.Err()
}
