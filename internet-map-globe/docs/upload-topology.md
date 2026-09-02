# Uploaded topology pages

Uploaded topology pages are used for offline inspection of a SEED Emulator generated `docker-compose.yml`. The corresponding containers do not need to be running.

## Page entries

| Page | Route | Description |
| --- | --- | --- |
| Emulator Topology 3D | `/upload/3d` | Upload `docker-compose.yml` and render it on a 3D globe. |
| Emulator Topology 2D | `/upload/2d` | Upload `docker-compose.yml` and render it on a 2D projected map. |

Production examples:

- `http://localhost:8090/pro/upload/3d`
- `http://localhost:8090/pro/upload/2d`

## Uploading docker-compose.yml

Workflow:

1. Open `/upload/3d` or `/upload/2d`.
2. Drag and drop, or select, a SEED Emulator generated `docker-compose.yml`.
3. Click the parse/import button.
4. The page reads SEED Emulator metadata labels under `services` and `networks`.
5. After parsing succeeds, the topology is rendered.

## Node construction rules

Uploaded pages build nodes from `docker-compose.yml`:

- A service becomes an emulator container node.
- A network becomes an emulator network node.
- A network whose `netInfo.type == 'global'` is displayed as an IX.
- Other networks are displayed as regular Network nodes.
- A service whose `nodeInfo.role` is `Router` or `BorderRouter` is displayed as a Router.
- Other services are displayed as Hosts.

Typical node label rules:

```text
nodeInfo.displayname || `${nodeInfo.asn}/${nodeInfo.name}`
netInfo.displayname || `${netInfo.scope}/${netInfo.name}`
```

## Geolocation

If a service or network label contains the following fields, the page uses those coordinates first:

```yaml
org.seedsecuritylabs.seedemu.meta.geo.lat: "17.416226"
org.seedsecuritylabs.seedemu.meta.geo.lon: "-6.188696"
```

Regular Network nodes often do not have explicit coordinates. The page tries to place them near the midpoint of their connected endpoints so the topology links look more natural.

## Offline packet file import

Uploaded pages support collector packet files:

- JSON only.
- JSON together with a matching PCAP.

### JSON only

When only JSON is imported:

- The page directly uses the packet events in the JSON file.
- The filter input is disabled.
- Replay is sorted by packet timestamps and rendered as packet-flow animations.

### JSON + PCAP

When JSON and PCAP are imported together:

- JSON provides semantic information such as nodes, containers, networks, IP addresses, and protocol.
- PCAP provides the raw packet bytes.
- The page can apply a tcpdump-like filter to the uploaded PCAP.
- After filtering, matched PCAP indexes are mapped back to the corresponding JSON events.

This requires a strict one-to-one ordering:

```text
PCAP packet N <-> JSON item N
```

In other words, the PCAP and JSON files must remain aligned in packet order.

## Offline filter

The uploaded-page filter applies only to the uploaded PCAP. It does not connect to `traffic-observer-service`.

Examples:

```text
icmp
tcp
udp
host 10.150.0.71
src host 10.150.0.71
dst host 10.151.0.71
```

Invalid tcpdump-like expressions should produce a syntax error instead of being guessed or loosely interpreted by the frontend.

## Replay controls

Traffic Replay supports:

- Play / pause
- Stop
- Step forward one packet
- Step backward one packet
- Dragging the Packet progress slider
- Clearing imported data
- `Packet path links only`
- Mutually exclusive Interval and Timeline playback modes

During replay, the page tries to infer paths from the topology links and packet source/destination information. Packet movement is shown as animated points moving along topology links.

## Large-file recommendations

For larger JSON / PCAP files, the page uses a Web Worker to parse data in the background and avoid blocking the UI thread. Still, it is recommended to:

1. Prefer importing pre-filtered captures.
2. Keep JSON and PCAP packet order strictly aligned.
3. Avoid importing captures with unnecessarily long time ranges.
