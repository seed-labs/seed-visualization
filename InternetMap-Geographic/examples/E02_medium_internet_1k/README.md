# E02_medium_internet_1k Test Guide

This example tests Internet Map loading, interaction, and traffic visualization with approximately 1,000 container nodes. General page behavior, Flow animation, packet recording, Interval/Timeline replay, mixed-operation stress, and recovery tests are identical to the 500-node example. See [E02_medium_internet_500/README.md](../E02_medium_internet_500/README.md) for those procedures. This document covers only the 1k-specific differences and scripts.

## Differences from the 500-node Example

- This topology has no Host nodes. Traffic endpoints are `Router`, `BorderRouter`, or `Route Server` containers.
- This topology has no geographic labels, so it cannot test city coordinates, IX-star placement, or geographic distance distribution.
- Routers usually connect to several networks, but the connectivity and stress scripts use only the first nonempty IPv4 address returned by Docker as the primary IP.
- The stress script selects endpoints only from pairs previously verified by `find_pingable_pairs.sh`.
- Approximately 1,000 containers may exceed the default Linux ARP neighbor-table capacity. Adjust the host kernel parameters before startup.

## Generate and Start the Topology

Run in this directory:

```bash
python3 medium_internet_1k.py 1078
cd output_1078_exportAll
DOCKER_BUILDKIT=0 docker compose build
docker compose up -d
```

The generator uses `real_topology_1078.txt` and `assignment.pkl`. To specify the input and output paths:

```bash
python3 medium_internet_1k.py 1078 \
  --topology-file real_topology_1078.txt \
  --output-dir output_1078_exportAll
```

Wait for all containers to start and for routing protocols to converge before checking connectivity.

## Host Settings for Large Container Counts

The default Linux neighbor-table limit is often 1,024. With approximately 1,000 containers, the kernel may log:

```text
neighbour: arp_cache: neighbor table overflow!
```

In this state, services inside containers may work while the host cannot reach container addresses or published ports. Recommended settings:

```bash
sudo tee /etc/sysctl.d/99-seedemu-scale.conf >/dev/null <<'EOF'
net.ipv4.neigh.default.gc_thresh1 = 4096
net.ipv4.neigh.default.gc_thresh2 = 8192
net.ipv4.neigh.default.gc_thresh3 = 16384
net.ipv6.neigh.default.gc_thresh1 = 4096
net.ipv6.neigh.default.gc_thresh2 = 8192
net.ipv6.neigh.default.gc_thresh3 = 16384
EOF

sudo sysctl --system
```

If failed neighbor entries already exist:

```bash
sudo ip neigh flush nud failed
sudo ip neigh flush nud incomplete
```

## Step 1: Find Reachable Node Pairs

Make the scripts executable:

```bash
chmod +x scripts/find_pingable_pairs.sh scripts/traffic_stress.sh
```

Request a target number of reachable pairs, for example 32:

```bash
./scripts/find_pingable_pairs.sh 32
```

The named option is equivalent:

```bash
./scripts/find_pingable_pairs.sh --count 32
```

The script first groups nodes by the Docker network of their primary IP. It chooses one representative from each subnet and prioritizes connectivity tests between representatives in different subnets. For example, if `a` and `b` share one subnet while `c` and `d` share another, a successful `a c` test means `b c`, `a d`, and `b d` are skipped during the representative phase. Other nodes are considered only if this phase finds fewer pairs than requested.

After testing `a b`, the script does not test `b a`. Only the primary target IP is pinged, and same-subnet pairs are ignored. Reachable pairs are written to:

```text
scripts/pingable_pairs.txt
```

File format:

```text
source_container target_container
```

Monitor progress and the number of results:

```bash
tail -f scripts/pingable_pairs.txt
wc -l scripts/pingable_pairs.txt
```

Passing `0` searches for all reachable pairs that satisfy the rules. A 1,000-node topology can still require many tests in the worst case. Adjust the number of targets probed in one batch with `--batch-size`:

```bash
./scripts/find_pingable_pairs.sh --batch-size 512
```

## Step 2: Generate Traffic from Verified Pairs

`traffic_stress.sh` reads `scripts/pingable_pairs.txt` by default. If the file is missing, empty, or contains no pair whose containers are running, the script stops and asks you to run the connectivity check first.

Single ICMP flow:

```bash
./scripts/traffic_stress.sh run \
  --protocol icmp \
  --concurrency 1 \
  --duration 10 \
  --interval-ms 1000
```

Each ICMP flow starts one continuous `ping` process. `--interval-ms` maps to `ping -i`, and `--duration` maps to `ping -w`. The script records the real ping PID, so `./scripts/traffic_stress.sh stop` can still terminate it early.

Mixed concurrent traffic:

```bash
./scripts/traffic_stress.sh run \
  --protocol mixed \
  --concurrency 32 \
  --duration 300 \
  --interval-ms 50 \
  --payload-bytes 1024
```

The script first uses verified records with the same source node and then uses other pairs from the file when necessary. If requested concurrency exceeds the number of available records, it runs at the available maximum.

When explicitly selecting endpoints, that direction must exist in `pingable_pairs.txt`:

```bash
./scripts/traffic_stress.sh run \
  --source <source_container> \
  --target <target_container> \
  --protocol icmp \
  --concurrency 1 \
  --duration 10
```

Use a different results file with:

```bash
./scripts/traffic_stress.sh run \
  --pairs-file /path/to/pingable_pairs.txt \
  --protocol udp \
  --concurrency 32 \
  --duration 300
```

Inspect or stop traffic:

```bash
./scripts/traffic_stress.sh status
./scripts/traffic_stress.sh stop
```

For TCP, UDP, mixed traffic, page filters, animation, recording, and replay procedures, continue with the 500-node example documentation.
