# Dock, settings, and replay controls

All 3D / 2D and live / uploaded topology pages in `internet-map-globe` share the bottom-right dock. The main component is:

```text
view/map/shared/components/EmulatorTopologyDock.vue
```

The dock contains three tabs:

- Overview
- Settings
- Traffic Replay

## Collapse and refresh

The dock header contains two buttons:

- Refresh: reloads data for the current page.
- Minimize: collapses the dock into a small button; click the small button to expand it again.

On live pages, Refresh requests Docker API data again. On uploaded pages, Refresh re-renders from the currently uploaded data.

## Overview

Overview shows statistics for the currently rendered topology:

- AS
- IX
- Networks
- Routers
- Hosts

### AS filtering

Click the AS count card to open the AS selector.

Supported behavior:

- Multiple selection
- Search
- Clear selection
- Show router details for an AS

After AS values are selected, the map shows only the related AS nodes and links.

### IX filtering

Click the IX count card to open the IX selector.

After IX values are selected, the map shows only the related IX networks and their connections.

### Legend

The legend under Overview explains node types:

- IX network
- Network
- Router
- Host

Different node types are displayed with different shapes and colors on the map.

## Settings

Settings controls search, visibility, scale, labels, and hover details.

### Search

Search matches:

- Node ID
- Node label
- Container or network fields stored in the node object
- IP addresses
- AS number
- Node role
- Container name
- Network name

Workflow:

1. Enter a keyword.
2. Suggestions appear automatically.
3. Clicking a suggestion, pressing Enter, or clicking the Search button has the same effect.
4. Matching nodes are highlighted on the map.
5. If exactly one node matches, the page tries to rotate or move the view so that node becomes visible.

### Node visibility

The following node types can be toggled independently:

- IX
- Network
- Router
- Host

Regular Network visibility depends on Router visibility. When Router is hidden, the regular Network switch is disabled.

When regular Network is hidden, all topology links are also hidden. This helps reduce visual noise in large topologies.

### Node / link scale

Controls the visual size of nodes and links.

For large topologies, reduce the scale to avoid excessive overlap between nodes and labels.

### Node labels

Controls whether node labels are shown.

When labels are hidden, nodes are still present and can still be found through search or hover details.

### Hover details

Controls whether a details card appears when hovering over a node.

The details card usually shows:

- Node or network type
- ID
- ASN / group
- Name / label
- IP or interface information

On live topology pages, container-node details also provide runtime controls:

- Host / Router nodes show `Actions`: launch a console terminal window inside the current page, disconnect or re-connect the container network, and refresh runtime information.
- Router / BorderRouter / Route Server nodes show `BGP sessions`: peer state and per-peer Enable / Disable actions.
- Uploaded topology pages use offline `docker-compose.yml` data. They do not represent live containers, so they only show static details and do not execute runtime controls.

## Traffic Replay

Traffic Replay uses the same control concepts on live and uploaded pages, but the data source is different.

### Live pages

Applies to:

- `/map/3d`
- `/map/2d`

Features:

- Set a filter to start live packet capture.
- Submit an empty filter to stop capture.
- Show live animations when packet events arrive through WebSocket.
- Add incoming packets to the replay list when recording is enabled.

### Uploaded pages

Applies to:

- `/upload/3d`
- `/upload/2d`

Features:

- Import collector JSON.
- Optionally import a matching PCAP.
- Apply an offline filter when JSON + PCAP are both available.
- Replay imported packet events.

## Playback timing

Playback modes are mutually exclusive:

| Mode | Description |
| --- | --- |
| Interval | Replays packets one by one with a fixed interval. |
| Timeline | Replays packets according to their real timestamps, scaled by Timeline speed. |

### Interval

`Event interval (ms)` is the fixed delay between packets.

Example:

```text
Event interval = 1200
```

This means the next packet is replayed every 1200 ms.

### Timeline

Timeline mode calculates delays from packet timestamps.

```text
visible delay = real packet time gap / Timeline speed
```

For example, if two packets are 1000 ms apart:

- `Timeline speed = 1`: wait about 1000 ms.
- `Timeline speed = 2`: wait about 500 ms.
- `Timeline speed = 0.5`: wait about 2000 ms.

### Time window

`Time window (ms)` groups packets into scheduling windows.

- `Time window = 0`: no windowing; replay strictly follows real packet timestamps.
- `Time window > 0`: packets inside the window can be scheduled by their relative timestamp offsets, which is better for observing concurrent multi-flow animations.

## Packet path links only

When enabled, only packet-path-related links are shown.

This is useful when:

- The topology has many nodes.
- The topology has many links.
- You only want to focus on the path taken by current traffic.

If no packet path has been inferred yet, no additional packet-path links are shown.
