package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	ObjectPath           string
	FilterExpr           string
	ControlAddr          string
	DockerSocket         string
	OnlySeedContainers   bool
	DiscoveryConcurrency int
	Interfaces           []string
	FallbackInterfaces   []string
	WebSocketSinkURL     string
}

func Load() Config {
	return Config{
		ObjectPath:           env("EBPF_OBJECT", "/tmp/packet_trace.bpf.o"),
		FilterExpr:           env("TRAFFIC_FILTER", ""),
		ControlAddr:          env("TRAFFIC_CONTROL_ADDR", ":10011"),
		DockerSocket:         env("DOCKER_SOCKET_PATH", "/var/run/docker.sock"),
		OnlySeedContainers:   envBool("TRAFFIC_ONLY_SEED_CONTAINERS", true),
		DiscoveryConcurrency: envInt("TRAFFIC_DISCOVERY_CONCURRENCY", 32),
		Interfaces:           splitCSV(env("TRAFFIC_INTERFACES", "")),
		FallbackInterfaces:   splitCSV(env("TRAFFIC_FALLBACK_INTERFACES", "docker0")),
		WebSocketSinkURL:     strings.TrimSpace(os.Getenv("EMULATOR_SERVICE_TRAFFIC_URL")),
	}
}

func env(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func envBool(key string, fallback bool) bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if value == "" {
		return fallback
	}
	return value == "1" || value == "true" || value == "yes" || value == "on"
}

func envInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}
