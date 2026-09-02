# Internet Map Globe

`internet-map-globe` is a Cesium-based topology visualization frontend for SEED Emulator. It renders emulator containers, IX networks, regular networks, routers, hosts, and topology links on either a 3D globe or a 2D projected map. It also supports live packet-capture replay, offline collector JSON / PCAP replay, node search, node-type filtering, AS filtering, and IX filtering.

## Feature overview

- Live topology: loads current Docker containers and networks from `emulator-service`.
- Uploaded topology: imports a SEED Emulator generated `docker-compose.yml` and builds the topology offline.
- 3D globe: displays the global topology with Cesium 3D Globe.
- 2D projected map: displays the expanded world map with Cesium 2D mode.
- Shared dock: provides Overview, Settings, and Traffic Replay panels in the bottom-right corner.
- Traffic replay: supports live WebSocket packet replay and offline collector JSON / PCAP replay.
- Large-topology helpers: hide regular Network nodes, hide labels, filter by AS / IX, and show packet-path links only.

## Recommended reading order

1. [Live topology pages](docs/live-topology.md)
2. [Uploaded topology pages](docs/upload-topology.md)
3. [Dock, settings, and replay controls](docs/topology-dock.md)
4. [Console and basic pages](docs/basic-pages.md)
5. [Deployment and environment variables](docs/deployment.md)

## Page quick reference

The default production URL prefix is `/pro`; the default development URL prefix is `/dev`.

| Page | Production URL | Data source | Main purpose |
| --- | --- | --- | --- |
| Live Emulator Topology 3D | `http://localhost:8090/pro/map/3d` | Docker API | View the currently running emulator topology in 3D and replay live captured traffic. |
| Live Emulator Topology 2D | `http://localhost:8090/pro/map/2d` | Docker API | View the currently running emulator topology on a 2D projected map. |
| Emulator Topology 3D | `http://localhost:8090/pro/upload/3d` | Uploaded `docker-compose.yml` | Inspect an offline topology and replay imported JSON / PCAP captures. |
| Emulator Topology 2D | `http://localhost:8090/pro/upload/2d` | Uploaded `docker-compose.yml` | Inspect an offline topology and packet paths on a 2D projected map. |
| Console | `http://localhost:8090/pro/console` | emulator-service | Open a container terminal. |

## Live data vs uploaded data

| Type | Pages | Requires running Docker containers | Supports live capture filter | Supports uploaded JSON / PCAP |
| --- | --- | --- | --- | --- |
| Live topology | `/map/3d`, `/map/2d` | Yes | Yes | No |
| Uploaded topology | `/upload/3d`, `/upload/2d` | No | No | Yes |

Live topology is intended for observing a running experiment. Uploaded topology is intended for offline analysis of emulator output files and historical capture records.

## Quick start

Start the basic services from the repository root:

```bash
docker compose up --build seedemu_emulator_service seedemu_internet_map_globe
```

To enable live traffic replay, also start the traffic observer:

```bash
docker compose up --build seedemu_emulator_service seedemu_internet_map_globe seedmu_traffic_observer_service
```

Open:

```text
http://localhost:8090/pro/map/3d
```

## Local development

```bash
cd internet-map-globe/frontend
pnpm install
pnpm dev
```

Common scripts:

```bash
pnpm run lint
pnpm run build
pnpm run test:unit
pnpm run test:e2e
```

## Environment variables

Environment files are located under `frontend/env`.

| Variable | Purpose |
| --- | --- |
| `VITE_FRONTEND_URL_PREFIX` | Frontend route prefix, for example `/pro` or `/dev`. |
| `VITE_SERVER_EMULATOR_URL_PREFIX` | API prefix for `emulator-service`. |
| `VITE_TRAFFIC_OBSERVER_URL_PREFIX` | Proxy prefix for `traffic-observer-service`. |
| `VITE_TRAFFIC_OBSERVER_ADDRESS` | Development proxy target for the traffic observer. |
| `VITE_SATELLITE_TILES_URL` | Cesium imagery tile URL. |

## Documentation

- [Live topology pages](docs/live-topology.md)
- [Uploaded topology pages](docs/upload-topology.md)
- [Dock, settings, and replay controls](docs/topology-dock.md)
- [Console and basic pages](docs/basic-pages.md)
- [Deployment and environment variables](docs/deployment.md)

Code architecture, component topology, module call flow, and service/API call relationships are maintained in the repository-level [docs/internet-map-globe.md](../docs/internet-map-globe.md).

## Security notes

The Console and live capture features depend on Docker and host-network permissions. Use them only in trusted, controlled lab environments. Do not expose them directly to the public internet.
