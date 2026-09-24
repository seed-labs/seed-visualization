package ifacemanager

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"seed-visualization/traffic-observer-service/internal/dockeriface"
)

type fakeAttacher struct {
	names []string
	err   error
	calls int
}

func (f *fakeAttacher) ReplaceInterfaces(names []string) error {
	f.calls++
	if f.err != nil {
		return f.err
	}
	f.names = append([]string(nil), names...)
	return nil
}
func (f *fakeAttacher) InterfaceNames() []string { return append([]string(nil), f.names...) }
func (f *fakeAttacher) InterfaceCount() int      { return len(f.names) }

func TestRefreshPublishesOnlySuccessfulDiscoveryAndAttachment(t *testing.T) {
	attacher := &fakeAttacher{names: []string{"veth-old"}}
	manager := &Manager{
		attach:              attacher,
		containerInterfaces: []dockeriface.Interface{{ContainerID: "old", HostIfName: "veth-old", HostIfIndex: 11}},
		containerIndex:      dockeriface.NewIndex([]dockeriface.Interface{{ContainerID: "old", HostIfName: "veth-old", HostIfIndex: 11}}),
		interfaceNames:      []string{"veth-old"},
	}
	newInterfaces := []dockeriface.Interface{{ContainerID: "new", HostIfName: "veth-new", HostIfIndex: 22}}
	manager.discover = func(context.Context, string, dockeriface.DiscoverOptions) ([]dockeriface.Interface, error) {
		return nil, errors.New("docker unavailable")
	}
	if _, err := manager.Refresh(context.Background()); err == nil || attacher.calls != 0 {
		t.Fatalf("discovery failure must not attach: err=%v calls=%d", err, attacher.calls)
	}
	assertOldMapping(t, manager)

	manager.discover = func(context.Context, string, dockeriface.DiscoverOptions) ([]dockeriface.Interface, error) {
		return newInterfaces, nil
	}
	attacher.err = errors.New("attach failed")
	if _, err := manager.Refresh(context.Background()); err == nil || attacher.calls != 1 {
		t.Fatalf("attachment failure should be returned: err=%v calls=%d", err, attacher.calls)
	}
	assertOldMapping(t, manager)

	attacher.err = nil
	snapshot, err := manager.Refresh(context.Background())
	if err != nil || snapshot.Interfaces != "veth-new" || snapshot.DiscoveredContainerInterface != 1 {
		t.Fatalf("successful refresh: snapshot=%+v err=%v", snapshot, err)
	}
	if got := manager.containerIndex.ByHostIfIndex[22].ContainerID; got != "new" {
		t.Fatalf("new mapping was not published: %q", got)
	}
}

func assertOldMapping(t *testing.T, manager *Manager) {
	t.Helper()
	if got := manager.Snapshot(); got.Interfaces != "veth-old" || got.DiscoveredContainerInterface != 1 {
		t.Fatalf("old snapshot was changed: %+v", got)
	}
	if got := manager.containerIndex.ByHostIfIndex[11].ContainerID; got != "old" {
		t.Fatalf("old mapping was changed: %q", got)
	}
}

func TestInterfacesControlReportsRefreshFailureWithoutLosingSnapshot(t *testing.T) {
	manager := &Manager{
		attach:              &fakeAttacher{names: []string{"veth-old"}},
		interfaceNames:      []string{"veth-old"},
		containerInterfaces: []dockeriface.Interface{{HostIfName: "veth-old"}},
	}
	manager.discover = func(context.Context, string, dockeriface.DiscoverOptions) ([]dockeriface.Interface, error) {
		return nil, errors.New("docker unavailable")
	}
	control := NewControl(manager)
	put := httptest.NewRecorder()
	control.ServeHTTP(put, httptest.NewRequest(http.MethodPut, "/interfaces", nil))
	if put.Code != http.StatusInternalServerError || !strings.Contains(put.Body.String(), "docker unavailable") {
		t.Fatalf("unexpected refresh failure: status=%d body=%q", put.Code, put.Body.String())
	}
	get := httptest.NewRecorder()
	control.ServeHTTP(get, httptest.NewRequest(http.MethodGet, "/interfaces", nil))
	if get.Code != http.StatusOK || !strings.Contains(get.Body.String(), `"interfaces":"veth-old"`) {
		t.Fatalf("previous snapshot is unavailable: status=%d body=%q", get.Code, get.Body.String())
	}
}
