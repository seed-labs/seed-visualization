# Traffic Observer

Host-level packet observer for the container-based SEED visualization/emulation stack.

This is a reference implementation for the eBPF + Collector plan:

- eBPF runs at TC ingress and extracts packet metadata.
- Collector runs in the same privileged container, loads the eBPF program, discovers container-to-veth mappings, applies a tcpdump-like filter, and emits packet-flow events.
- When recording is enabled, matched packet bytes are saved to pcap files and frontend WebSocket messages are saved to per-session JSON files in the same event order.

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

## Optional packet file recording

Packet file recording is controlled independently from the eBPF filter:

- `/filter` decides which packets reach userspace.
- `/filter` also defines the current recording batch. Submitting a different non-empty filter starts a new batch. Submitting the same filter keeps the current batch. Submitting an empty filter ends the current batch.
- `/pcap` decides whether matched packets and frontend events in the current batch are written to files.

The BPF event includes packet bytes from the Ethernet frame start. The current per-packet capture limit is `65535` bytes. Packets larger than this limit are not submitted to the ring buffer, so recorded pcap packets are not silently truncated.

Enable recording:

```bash
curl -X PUT http://127.0.0.1:19092/pcap \
  -H "Content-Type: application/json" \
  -d '{"enabled":true}'
```

Check recording state:

```bash
curl http://127.0.0.1:19092/pcap
```

Disable recording:

```bash
curl -X PUT http://127.0.0.1:19092/pcap \
  -H "Content-Type: application/json" \
  -d '{"enabled":false}'
```

Recording output:

- pcap file: `<filter>_yyyymmddHHMMSS.pcap`
- frontend event batch: `<filter>_yyyymmddHHMMSS.json`

The filter part is sanitized for filesystem safety. For example, `tcp and port 80` becomes `tcp-and-port-80_20260811143022.pcap`.

Recording only writes packets observed after `/pcap` is enabled. Filter updates still control batch boundaries: a new non-empty filter creates a new batch, while repeatedly submitting the same filter keeps writing to the same batch.

Within a recording batch, the first pcap packet corresponds to the first JSON item, the second pcap packet corresponds to the second JSON item, and so on.

Packet JSON messages use stable container names instead of Docker runtime IDs:

- `containerName`
- `sourceContainerName`
- `destContainerName`

The collector still uses Docker IDs internally for discovery and indexing, but those IDs are not emitted in packet JSON messages.

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
docker compose --profile observer up traffic-observer-service
```

Useful environment overrides:

```bash
TRAFFIC_INTERFACES=
TRAFFIC_ONLY_SEED_CONTAINERS=true
TRAFFIC_FILTER=""
TRAFFIC_CONTROL_ADDR=":19092"
EMULATOR_SERVICE_TRAFFIC_URL="ws://127.0.0.1:7071/api/v1/traffic/stream"
TRAFFIC_PCAP_ENABLED=false
TRAFFIC_PCAP_OUTPUT_DIR=/data/pcap
TRAFFIC_LOG_TIMEZONE=Asia/Shanghai
```

If `TRAFFIC_INTERFACES` is empty, the collector tries to discover container interfaces automatically:

```text
Docker API -> container PID -> container netns ethX iflink -> host /sys/class/net/*/ifindex -> host veth
```

If no container veth is discovered at startup, the observer still starts the control server, WebSocket endpoint, pcap control, and ring-buffer reader without attaching to any host interface. It does not fall back to `docker0`. A non-empty `/filter` update will retry interface discovery before enabling capture. If discovery still finds no interfaces, the filter request returns an error.

Use `TRAFFIC_INTERFACES` only when you intentionally want to attach to explicit host interfaces. When it is empty, capture is limited to discovered SEED emulator container veth interfaces.

If `EMULATOR_SERVICE_TRAFFIC_URL` is empty, the collector prints JSON lines to stdout.

## Runtime filter updates

`TRAFFIC_FILTER` is only the initial filter. It is empty by default, so the observer starts with capture disabled. For UI-driven changes, update the collector at runtime:

```bash
curl -X PUT http://127.0.0.1:19092/filter \
  -H "Content-Type: application/json" \
  -d '{"filter":"tcp and port 80"}'
```

When the filter value is non-empty, the observer first checks whether it has attached interfaces. If the current interface set is empty, it performs one Docker-based interface refresh, updates the eBPF attach points, and then applies the filter. If no interfaces are found after that refresh, the request fails with `503 Service Unavailable`.

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
frontend -> emulator-service -> traffic-observer-service /filter -> eBPF map
```

The frontend should not talk directly to the privileged observer container.

## Runtime interface discovery

Get the currently known interface mapping:

```bash
curl http://127.0.0.1:19092/interfaces
```

Force a Docker-based interface refresh and reattach eBPF programs:

```bash
curl -X PUT http://127.0.0.1:19092/interfaces
```

or:

```bash
curl -X POST http://127.0.0.1:19092/interfaces
```

Example response:

```json
{
  "interfaces": "veth1234abc,veth5678def",
  "discoveredContainerInterfaces": 2
}
```

This refresh endpoint always performs discovery, even when the current attached interface count is already non-zero. The observer does not run a background polling loop for interface discovery.

Every successful refresh writes a log line with the same summary:

```text
traffic interfaces refreshed: interfaces=veth1234abc,veth5678def discoveredContainerInterfaces=2
```

Refresh failures are also logged with the last known interface summary and the error.

### When Docker topology changes

The interface mapping is a snapshot of the Docker/emulator topology at the time discovery runs. If the emulator containers are started later, recreated, removed, or their Docker networks change, the old host veth mapping may become stale.

In that situation, refresh the observer in one of these ways:

1. Restart `traffic-observer-service`.
2. Preferably, keep the service running and call the runtime refresh API:

   ```bash
   curl -X PUT http://127.0.0.1:19092/interfaces
   ```

   `POST /interfaces` is also accepted.

The refresh API performs Docker-based discovery again, updates the container-to-veth mapping, and reattaches the eBPF program to the refreshed host interfaces.

Important behavior:

- Startup discovery runs once.
- The observer does not continuously poll Docker API in the background.
- A non-empty `/filter` request retries discovery only when the current attached interface set is empty.
- If Docker API data changes while the observer already has non-empty interface data, call `/interfaces` or restart the service; do not rely on `/filter` to refresh a stale non-empty mapping.

Recommended operational flow when emulator topology changes:

```text
start/recreate emulator containers
  -> call PUT /interfaces
  -> set or re-apply PUT /filter
  -> observe packets over WebSocket / pcap recording
```

## Runtime pcap / JSON recording

Get recording status:

```bash
curl http://127.0.0.1:19092/pcap
```

Example response:

```json
{
  "enabled": true,
  "captureActive": true,
  "filter": "icmp",
  "outputDir": "/data/pcap",
  "currentPcapFile": "/data/pcap/icmp_20260811143022.pcap",
  "currentJsonFile": "/data/pcap/icmp_20260811143022.json",
  "packetCount": 10,
  "byteCount": 980,
  "messageCount": 10
}
```

The root `docker-compose.yml` mounts the output directory by default:

```text
./traffic-observer-service/pcap:/data/pcap
```

## Logging timezone

The collector sets the Go standard logger timezone at startup.

Default:

```bash
TRAFFIC_LOG_TIMEZONE=Asia/Shanghai
```

This avoids UTC timestamps in container logs when running in China Standard Time.

## Notes

- The container is privileged because it loads eBPF programs and attaches to host interfaces.
- `network_mode: host` is used so the collector observes host network interfaces directly.
- The collector currently uses TCX attach through `github.com/cilium/ebpf/link`. On older kernels, replace the attach layer with a classic `tc clsact` attach fallback.
- The BPF program is compiled from Linux UAPI headers inside the container and does not require runtime `bpftool btf dump` / `vmlinux.h` generation.
- Recording full jumbo packets beyond the current per-event limit should use chunked BPF events instead of a larger single ring-buffer event.
