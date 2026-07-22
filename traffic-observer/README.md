# Traffic Observer

Host-level packet observer for the container-based SEED visualization/emulation stack.

This is a reference implementation for the eBPF + Collector plan:

- eBPF runs at TC ingress and extracts packet metadata.
- Collector runs in the same privileged container, loads the eBPF program, discovers container-to-veth mappings, applies a tcpdump-like filter, and emits packet-flow events.
- Packet payload is intentionally not collected.

## Captured metadata

Each packet event contains:

- timestamp
- host interface index/name
- container id/name and SEED node metadata when the host interface maps to a container veth
- direction: `ingress`
- packet length
- Ethernet protocol
- source/destination MAC
- IPv4 source/destination
- IP protocol
- TCP/UDP source/destination ports
- TCP flags

IPv4 packets include IP/transport metadata. Non-IPv4 packets are still emitted when they match the filter, but only Ethernet-level metadata is available. IPv6 parsing can be added later.

## Filter syntax

`TRAFFIC_FILTER` accepts a practical tcpdump-like subset. Empty means capture is disabled; explicit `all` means capture all packets.

```bash
all
tcp
udp
icmp
host 10.0.0.2
src host 10.0.0.2
dst host 10.0.0.3
port 80
src port 12345
dst port 443
tcp and port 80
udp and dst port 53
```

The filter is pushed into an eBPF map, so non-matching packets are dropped in-kernel before ring-buffer delivery.

## Docker Compose

The root `docker-compose.yml` adds this service under the `observer` profile:

```bash
docker compose --profile observer up traffic-observer
```

Useful environment overrides:

```bash
TRAFFIC_INTERFACES=docker0,br-seed
TRAFFIC_FALLBACK_INTERFACES=docker0
TRAFFIC_ONLY_SEED_CONTAINERS=true
TRAFFIC_FILTER=""
TRAFFIC_CONTROL_ADDR=":19092"
EMULATOR_SERVICE_TRAFFIC_URL="ws://127.0.0.1:7071/api/v1/traffic/stream"
```

If `TRAFFIC_INTERFACES` is empty, the collector tries to discover container interfaces automatically:

```text
Docker API -> container PID -> container netns ethX iflink -> host /sys/class/net/*/ifindex -> host veth
```

If no container veth is discovered, `TRAFFIC_FALLBACK_INTERFACES` is used.

If `EMULATOR_SERVICE_TRAFFIC_URL` is empty, the collector prints JSON lines to stdout.

## Runtime filter updates

`TRAFFIC_FILTER` is only the initial filter. It is empty by default, so the observer starts with capture disabled. For UI-driven changes, update the collector at runtime:

```bash
curl -X PUT http://127.0.0.1:19092/filter \
  -H "Content-Type: application/json" \
  -d '{"filter":"tcp and port 80"}'
```

Get the current filter:

```bash
curl http://127.0.0.1:19092/filter
```

Disable capture again:

```bash
curl -X PUT http://127.0.0.1:19092/filter \
  -H "Content-Type: application/json" \
  -d '{"filter":""}'
```

Recommended production flow:

```text
frontend -> emulator-service -> traffic-observer /filter -> eBPF map
```

The frontend should not talk directly to the privileged observer container.

## Notes

- The container is privileged because it loads eBPF programs and attaches to host interfaces.
- `network_mode: host` is used so the collector observes host network interfaces directly.
- The collector currently uses TCX attach through `github.com/cilium/ebpf/link`. On older kernels, replace the attach layer with a classic `tc clsact` attach fallback.
- The BPF program is compiled from Linux UAPI headers inside the container and does not require runtime `bpftool btf dump` / `vmlinux.h` generation.
