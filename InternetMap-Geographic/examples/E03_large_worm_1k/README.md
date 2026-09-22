# E03_large_worm_1k Worm Propagation Test

## Test Purpose

This example uses a fixed geographic topology of 1,000 containers to demonstrate worm propagation and control in InternetMap-Geographic. It also tests repeated packet capture, replay, and animation during propagation.

This directory provides the following helper scripts:

| File | Purpose |
| --- | --- |
| `emulator/large_worm_1k.py` | Generates the 1,000-container topology and geographic coordinates |
| `worm/setup.sh` | Configures the environment after the emulator starts |
| `worm/first_attack.py` | Starts the attack |
| `worm/worm.py` | Worm program |
| `worm/control_worm.sh` | Controls the worm |

## 1. Environment Requirements

A dedicated Linux emulation host is recommended:

| Resource | Minimum | Recommended |
| --- | ---: | ---: |
| Memory | 64 GiB | 96 GiB or more |
| CPU | 16 logical CPUs | 24 logical CPUs or more |
| Free disk space | 80 GiB | SSD with 120 GiB or more |
| Docker | Docker Engine + Compose v2 | A recent stable release |
| Python | 3.10 or later | Match the SEED Emulator environment |

Live capture also requires eBPF support, mounted debugfs/BPF file systems, and permission to run `seedmu_traffic_observer_service` in privileged and host-network modes.

The helper scripts require Bash, Docker CLI, and the `ping`, `nc`, and `dd` utilities included in the base node image. They do not install additional software in containers.

## 2. Generate and Start the Topology

Run from the repository root:

```bash
cd InternetMap-Geographic/examples/E03_large_worm_1k
python3 -m pip install -r requirements.txt
python3 emulator/large_worm_1k.py
```

The default configuration generates 1,000 nodes and writes the result to `emulator/output/`.

The generator verifies that:

- exactly 1,000 containers are generated, including 20 IX route servers and 19 transit routers;
- the topology contains 20 IX networks;
- node coordinates use land-checked cities, do not overlap, and avoid desert cores and polar regions;
- every IX star uses its city anchor while the real IX container uses a nearby, separate display coordinate.

Build and start the topology:

```bash
cd emulator/output
chmod +x z_build.sh z_start.sh
./z_build.sh
./z_start.sh
docker compose ps
```

Wait for all containers to enter the running state and for routing protocols to converge before testing. Building and starting 1,000 containers takes time and should not be included in traffic-test measurements.

In another terminal, start the visualization, Docker API, and traffic capture services from the repository root:

```bash
docker compose up -d --build \
  seedemu_emulator_service \
  seedemu_internet_map_geographic \
  seedmu_traffic_observer_service
```

Open:

- 3D: `http://<host-ip>:8090/pro/map/3d`
- 2D: `http://<host-ip>:8090/pro/map/2d`

## 3. Pre-test Baseline

Make the scripts executable:

```bash
chmod +x worm/setup.sh worm/control_worm.sh
```

Configure the environment:

```bash
cd worm
./setup.sh
```

## 4. Test Procedure

1. Open the 3D or 2D visualization page.
2. Set the filter to `icmp and dst host 1.2.3.4` when the fallback ICMP visualization is used.
3. Start the first attack:

   ```bash
   cd worm
   python3 first_attack.py
   ```

4. Control the worm as described in [worm/README.md](worm/README.md):

   ```bash
   # Propagate the worm. Flashing nodes should continue to increase until
   # nearly all eligible nodes are flashing.
   ./control_worm.sh run

   # Packet recording and animation can be enabled during propagation to
   # evaluate page responsiveness.
   ./control_worm.sh pause

   # Finish the test.
   ./control_worm.sh stop
   ```

To run another attack and propagation cycle, restart from step 3.

## 5. Cleanup

Stop processes created by the worm scripts:

```bash
cd worm
./control_worm.sh stop
```

Stop this example topology:

```bash
cd ../emulator/output
docker compose down
```

To stop the repository-level services, run from the repository root:

```bash
docker compose stop \
  seedemu_emulator_service \
  seedemu_internet_map_geographic \
  seedmu_traffic_observer_service
```
