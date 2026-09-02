package config

import (
	"reflect"
	"testing"
)

func clearEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{
		"EBPF_OBJECT",
		"TRAFFIC_FILTER",
		"TRAFFIC_CONTROL_ADDR",
		"DOCKER_SOCKET_PATH",
		"TRAFFIC_ONLY_SEED_CONTAINERS",
		"TRAFFIC_DISCOVERY_CONCURRENCY",
		"TRAFFIC_INTERFACES",
		"EMULATOR_SERVICE_TRAFFIC_URL",
	} {
		t.Setenv(key, "")
	}
}

func TestLoadDefaults(t *testing.T) {
	clearEnv(t)

	cfg := Load()

	if cfg.ObjectPath != "/tmp/packet_trace.bpf.o" {
		t.Fatalf("unexpected object path: %q", cfg.ObjectPath)
	}
	if cfg.FilterExpr != "" {
		t.Fatalf("expected empty default filter, got %q", cfg.FilterExpr)
	}
	if cfg.ControlAddr != ":10011" {
		t.Fatalf("unexpected control address: %q", cfg.ControlAddr)
	}
	if cfg.DockerSocket != "/var/run/docker.sock" {
		t.Fatalf("unexpected Docker socket: %q", cfg.DockerSocket)
	}
	if !cfg.OnlySeedContainers {
		t.Fatal("expected seed-container filtering to be enabled by default")
	}
	if cfg.DiscoveryConcurrency != 32 {
		t.Fatalf("unexpected discovery concurrency: %d", cfg.DiscoveryConcurrency)
	}
	if len(cfg.Interfaces) != 0 {
		t.Fatalf("expected no explicit interfaces by default, got %#v", cfg.Interfaces)
	}
}

func TestLoadOverrides(t *testing.T) {
	clearEnv(t)
	t.Setenv("EBPF_OBJECT", " /tmp/custom.o ")
	t.Setenv("TRAFFIC_FILTER", " icmp ")
	t.Setenv("TRAFFIC_CONTROL_ADDR", ":19092")
	t.Setenv("DOCKER_SOCKET_PATH", "/tmp/docker.sock")
	t.Setenv("TRAFFIC_ONLY_SEED_CONTAINERS", "false")
	t.Setenv("TRAFFIC_DISCOVERY_CONCURRENCY", "4")
	t.Setenv("TRAFFIC_INTERFACES", " veth0, veth1,, ")
	t.Setenv("EMULATOR_SERVICE_TRAFFIC_URL", " ws://frontend/ws ")

	cfg := Load()

	if cfg.ObjectPath != "/tmp/custom.o" {
		t.Fatalf("unexpected object path override: %q", cfg.ObjectPath)
	}
	if cfg.FilterExpr != "icmp" {
		t.Fatalf("unexpected filter override: %q", cfg.FilterExpr)
	}
	if cfg.ControlAddr != ":19092" || cfg.DockerSocket != "/tmp/docker.sock" {
		t.Fatalf("unexpected endpoint overrides: %#v", cfg)
	}
	if cfg.OnlySeedContainers {
		t.Fatal("expected seed-container filtering override to disable filtering")
	}
	if cfg.DiscoveryConcurrency != 4 {
		t.Fatalf("unexpected discovery concurrency override: %d", cfg.DiscoveryConcurrency)
	}
	if !reflect.DeepEqual(cfg.Interfaces, []string{"veth0", "veth1"}) {
		t.Fatalf("unexpected explicit interfaces: %#v", cfg.Interfaces)
	}
	if cfg.WebSocketSinkURL != "ws://frontend/ws" {
		t.Fatalf("unexpected websocket sink URL: %q", cfg.WebSocketSinkURL)
	}
}

func TestLoadFallsBackForInvalidDiscoveryConcurrency(t *testing.T) {
	clearEnv(t)
	t.Setenv("TRAFFIC_DISCOVERY_CONCURRENCY", "0")

	cfg := Load()

	if cfg.DiscoveryConcurrency != 32 {
		t.Fatalf("expected invalid concurrency to use fallback, got %d", cfg.DiscoveryConcurrency)
	}
}
