# E02_medium_internet_500 Traffic and Mixed-operation Stress Test

## Test Purpose

This example uses a fixed geographic topology of 500 containers to test InternetMap-Geographic under sustained packet reception. It covers traffic processing, page interaction under load, ICMP/TCP/UDP compatibility, long-duration operation, disconnect recovery, and restart behavior.

Main test areas:

- **Pure traffic pressure:** progressively increase packet rate, active-flow count, and new-flow rate across single-flow, concurrent, and mixed-protocol traffic.
- **Mixed-operation pressure:** zoom, filter, switch panels, pause, and seek during packet reception and replay.
- **Endurance and recovery:** reconnect after long operation, stop traffic, clear recordings, and start again.

| File | Purpose |
| --- | --- |
| `medium_internet_500.py` | Generates the 500-container topology and geographic coordinates |
| `scripts/traffic_stress.sh` | Starts or stops concurrent ICMP/TCP/UDP/mixed traffic |
| `scripts/run_pressure_suite.sh` | Runs five increasing pressure stages in sequence |

## 1. Environment Requirements

A dedicated Linux emulation host is recommended:

| Resource | Minimum | Recommended |
| --- | ---: | ---: |
| Memory | 64 GiB | 96 GiB or more |
| CPU | 16 logical CPUs | 24 logical CPUs or more |
| Free disk space | 80 GiB | SSD with 120 GiB or more |
| Docker | Docker Engine + Compose v2 | Recent stable version |
| Python | 3.10 or later | Match the SEED Emulator environment |

Live capture requires eBPF support, mounted debugfs/BPF file systems, and permission to run `seedemu_traffic_observer_service` in privileged and host-network modes.

The scripts require Bash, Docker CLI, and the `ping`, `nc`, and `dd` tools already present in node images. They do not install software in containers.

## 2. Generate and Start the Topology

From the repository root:

```bash
cd InternetMap-Geographic/examples/E02_medium_internet_500
python3 -m pip install -r requirements.txt
python3 medium_internet_500.py
```

Defaults are 500 nodes, AMD64, random seed `42`, and output in `output/`. On ARM64:

```bash
python3 medium_internet_500.py --platform arm
```

The generator verifies that:

- exactly 500 containers are generated: 20 IX route servers, 420 transit routers, 20 stub routers, and 40 stub hosts;
- 20 IX networks exist;
- coordinates use land-checked cities, do not overlap, and avoid desert cores and polar regions;
- IX stars use city anchors while real IX containers use nearby, separate display coordinates.

Start the topology:

```bash
cd output
DOCKER_BUILDKIT=0 docker compose build
docker compose up -d
docker compose ps
```

Wait for all containers to run and for routing to converge before stress testing. Do not include first-build or startup time in traffic-test measurements.

In another terminal, start the supporting services from the repository root:

```bash
docker compose up -d --build \
  seedemu_emulator_service \
  seedemu_internet_map_geographic \
  seedemu_traffic_observer_service
```

Open:

- 3D: `http://<host-ip>:8090/pro/map/3d`
- 2D: `http://<host-ip>:8090/pro/map/2d`

## 3. Pre-test Baseline

```bash
chmod +x scripts/traffic_stress.sh scripts/run_pressure_suite.sh
```

Record topology load time, node/link counts, browser memory, event rate, and idle CPU. Begin with one cross-network flow:

```bash
./scripts/traffic_stress.sh run \
  --protocol icmp \
  --concurrency 1 \
  --duration 10 \
  --interval-ms 1000
```

Submit `icmp and src host <srcIP> and dst host <dstIP>` in Traffic Replay. Over 10 seconds, expect ten request packets from the selected flow. Use `tcp` or `udp` to repeat with another protocol.

The script sends only from containers labeled `org.seedsecuritylabs.seedemu.meta.role=Host`. It selects a running Host and another Host on a different Docker network, then reads the target's first IPv4 address. Routers and IX route servers are excluded. To select endpoints explicitly:

```bash
./scripts/traffic_stress.sh run \
  --source <source-container> \
  --target <target-container> \
  --target-ip <reachable-target-ip> \
  --protocol icmp \
  --concurrency 1 \
  --duration 10
```

After confirming connectivity and page events:

```bash
./scripts/traffic_stress.sh stop
```

## 4. Traffic Script

General syntax:

```bash
./scripts/traffic_stress.sh run \
  --protocol <icmp|tcp|udp|mixed> \
  --concurrency <number-of-distinct-cross-network-host-pairs> \
  --duration <seconds> \
  --interval-ms <send-interval-per-flow> \
  --payload-bytes <tcp-or-udp-payload-size>
```

| Protocol | Generation method | Main pressure dimension |
| --- | --- | --- |
| ICMP | One continuous `ping` per flow; `-i` controls interval and `-w` controls duration | Packet rate and concurrent endpoint events |
| TCP | A new `nc` connection for each send | New-flow rate, connection concurrency, and path animation |
| UDP | One payload per `nc -u` invocation | Packet rate and connectionless processing |
| mixed | Workers rotate through ICMP/TCP/UDP | Mixed protocols and overall page processing |

`--concurrency` is the number of distinct cross-network Host pairs running at once. The script prefers one fixed source Host, switches sources when targets are exhausted, and never emits both `A → B` and `B → A`. Startup displays the maximum available flow count; requests above that number use the maximum. Router, IX, and same-network pairs are rejected.

```bash
./scripts/traffic_stress.sh status
./scripts/traffic_stress.sh stop
```

## 5. Pure Traffic Pressure

Set a matching filter for each test. Clear page recordings before every stage and leave at least 30 seconds for recovery afterward. Increase load gradually.

| Stage | Example | Verify |
| --- | --- | --- |
| Single-flow baseline | `./scripts/traffic_stress.sh run --protocol icmp --concurrency 1 --duration 180 --interval-ms 1000` | Correct endpoints, direction, path, and event count |
| ICMP packet rate | `./scripts/traffic_stress.sh run --protocol icmp --concurrency 32 --duration 300 --interval-ms 20` | Capture and animation remain continuous with frequent small packets |
| TCP new-flow rate | `./scripts/traffic_stress.sh run --protocol tcp --concurrency 64 --duration 300 --interval-ms 25 --payload-bytes 4096` | Page remains responsive during frequent connection establishment |
| UDP packet rate | `./scripts/traffic_stress.sh run --protocol udp --concurrency 64 --duration 300 --interval-ms 10 --payload-bytes 1400` | Event queue and memory remain controlled |
| Mixed protocols | `./scripts/traffic_stress.sh run --protocol mixed --concurrency 96 --duration 600 --interval-ms 20 --payload-bytes 2048` | Throughput and interaction with all protocols active |

Run the preset suite with:

```bash
STAGE_DURATION=180 REST_SECONDS=30 ./scripts/run_pressure_suite.sh
```

Optional fixed endpoints:

```bash
SOURCE_CONTAINER=<source-container> \
TARGET_CONTAINER=<target-container> \
TARGET_IP=<target-ip> \
STAGE_DURATION=300 \
./scripts/run_pressure_suite.sh
```

Change one pressure variable at a time. Record send configuration, duration, received and dropped events, CPU, memory, longest interaction delay, and errors. Stop increasing load if queues grow continuously, the browser stops responding, services restart, or memory does not stabilize.

## 6. Mixed-operation Pressure

While mixed traffic runs for at least 10 minutes, repeat these operations in both 3D and 2D:

1. Zoom and pan continuously; rotate the globe and change regions in 3D.
2. Open AS/IX selectors and select several entries. Selection must not redraw immediately; **Apply** closes the selector before loading and showing results.
3. Clear filters, wait for the complete topology, and select different ASes/IXes.
4. Switch Overview, Settings, and Traffic Replay, remaining on each for 5–10 seconds.
5. Toggle Host, Router, Network, IX, and labels. These controls should only hide/show existing primitives.
6. Record for two minutes and replay in Interval and Timeline modes.
7. Pause, resume, step, seek, and drag replay progress.
8. Search for known source and destination nodes, locate them, and clear search.

Pass when controls continue to respond, topology remains correct, and event queues and resource use decrease after traffic stops.

## 7. Endurance and Recovery

Recommended endurance run:

```bash
./scripts/traffic_stress.sh run \
  --protocol mixed \
  --concurrency 48 \
  --duration 3600 \
  --interval-ms 50 \
  --payload-bytes 1024
```

Verify these recovery scenarios in order:

1. Restart `seedemu_traffic_observer_service` and confirm WebSocket/capture reconnection.
2. Restart `seedemu_emulator_service` and confirm live topology recovery.
3. Refresh the page or restart `seedemu_internet_map_geographic` and reload the same topology.
4. Run `./scripts/traffic_stress.sh stop` and confirm new events stop.
5. Stop capture/replay, clear the recording, and confirm queues, progress, and animation reset.
6. Run the single-flow baseline and another mixed stage without rebuilding the topology.

Recovery passes when no internal state needs manual repair, old events do not enter a new recording, topology and filters remain correct, and CPU/memory return to an acceptable range.

## 8. Page Function Checklist

1. Verify topology rendering, dragging, and zooming.
2. In Overview, select ASes or IXes and confirm that **Apply** shows only matching objects and relationships.
3. In Settings:
   - search by keyword;
   - toggle node types and confirm Network also controls link visibility;
   - adjust node size and link width;
   - toggle Node Labels and Node details.
4. In Traffic Replay:
   - use `icmp`, `tcp`, `udp`, or expressions such as `icmp or udp`;
   - verify flashing frequency and endpoints;
   - test Packet path links only and Flow animation separately and together;
   - record packets up to the 100,000-packet limit;
   - replay with Interval and Timeline, including pause, stop, clear, step, and seek.

When Flow animation is enabled before replay of a large recording, the play button shows loading and a bold red message while flow paths are calculated. Enabling it during replay pauses at the current position, displays the same message, and resumes after calculation. Enabling it while idle does not start calculation immediately.

Timeline groups recorded packets into time windows. Packets in one group display simultaneously, and the Packet axis advances by the group's actual packet count. Waiting between groups uses the difference from the current group's last packet to the next group's first packet, divided by Timeline speed.

## 9. Concurrent Traffic Examples

```bash
# Three ICMP flows; filter: icmp
./scripts/traffic_stress.sh run --protocol icmp --concurrency 3 --duration 3600 --interval-ms 10

# Up to 760 ICMP flows; filter: icmp
./scripts/traffic_stress.sh run --protocol icmp --concurrency 760 --duration 3600 --interval-ms 10 --payload-bytes 1400

# Up to 760 mixed flows; filter: icmp or udp or tcp
./scripts/traffic_stress.sh run --protocol mixed --concurrency 760 --duration 3600 --interval-ms 10 --payload-bytes 1400
```

The emulation itself may generate TCP packets, so a broad TCP filter can capture traffic unrelated to this script.

## 10. Cleanup

Stop generated traffic:

```bash
./scripts/traffic_stress.sh stop
```

Stop this topology:

```bash
cd output
docker compose down
```

Stop repository services separately from the repository root when required.
