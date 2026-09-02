# Live topology pages

Live topology pages load the current Docker containers and networks from `emulator-service`. They are intended for observing an emulator that is already running.

## Page entries

| Page | Route | Description |
| --- | --- | --- |
| Live Emulator Topology 3D | `/map/3d` | 3D globe view. |
| Live Emulator Topology 2D | `/map/2d` | 2D projected map view. |

Production examples:

- `http://localhost:8090/pro/map/3d`
- `http://localhost:8090/pro/map/2d`

## Rendered topology

The live pages convert Docker API data into the following topology nodes:

- IX: a Docker network whose `netInfo.type == 'global'`.
- Regular Network: a Docker network whose type is not `global`.
- Router: a container node whose `nodeInfo.role` is `Router` or `BorderRouter`.
- Host: a container node whose role is not `Router` or `BorderRouter`.

Links are derived from the Docker networks attached to each container. Conceptually, each topology edge is:

```text
container node <-> network node
```

## Basic workflow

1. Start the emulator containers.
2. Start `seedemu_emulator_service`.
3. Open `/map/3d` or `/map/2d`.
4. The page automatically loads containers and networks.
5. If the topology is stale, click the refresh button in the dock header.

## Live packet capture replay

The live page Traffic Replay panel connects to `traffic-observer-service`.

Workflow:

1. Open the `Traffic Replay` tab in the bottom-right dock.
2. Enter a tcpdump-like filter, for example:

   ```text
   icmp
   ```

3. Click `Apply`.
4. The frontend submits the filter. The backend starts capture and pushes packet events through WebSocket.
5. The page highlights container and network nodes and shows packet-flow animations on inferable paths.
6. Submit an empty filter to stop capture.

## Recording and replay

Live capture and local recording are separate actions:

- Setting a filter controls whether the backend captures packets.
- Enabling recording controls whether the frontend stores incoming packet events in the local replay list.

Only packets received while recording is enabled are counted in the Packet total and become available for replay.

## Node details, Actions, and BGP sessions

When `Hover details` is enabled, hovering over a node displays a details card.

Container node details include:

- Basic information: ID, ASN, Name, and Role.
- IP addresses: attached network interfaces and addresses.
- Actions: launch a console terminal window inside the current page, disconnect / re-connect the container network, and refresh runtime information.
- BGP sessions: Router / BorderRouter / Route Server nodes show BGP peers, peer states, and Enable / Disable actions.

These runtime actions depend on the container-control endpoints provided by `emulator-service`. They are enabled only on `/map/3d` and `/map/2d`. Uploaded topology pages show static details only.

## 2D vs 3D

| View | Best for |
| --- | --- |
| 3D | Global spatial distribution and curved globe links. |
| 2D | A projected overview of large topologies. |

The 2D pages show a limited number of projected map copies only when needed to make links across the longitude boundary look continuous. They do not render an infinite repeated map.

## Troubleshooting

### No nodes are shown

Check:

1. Whether the emulator containers are running.
2. Whether `seedemu_emulator_service` is running.
3. Whether the frontend emulator-service API prefix is correct.

### No animation after applying a filter

Check:

1. Whether `seedmu_traffic_observer_service` is running.
2. Whether the filter matches real traffic.
3. Whether the traffic observer has discovered container veth interfaces.
4. Whether container names and IP addresses in packet JSON can be matched to the current topology.

### Stale links remain when Packet path links only is enabled

After capture stops, the page should clear live packet-path links. If stale links remain, the likely cause is uncleared frontend live-packet queues or stale filter state.
