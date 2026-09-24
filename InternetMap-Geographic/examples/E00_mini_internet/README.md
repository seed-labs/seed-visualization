# E00_mini_internet Basic Function Test

## Purpose and Scope

This example verifies basic page behavior with a fixed topology and low traffic, establishing a correctness baseline for later scale and traffic stress tests. It covers 3D/2D, live/upload modes, search and filtering, recording and replay, consoles, and panel layout.

The procedures below describe operations and expected results; they do not claim that a test run has already been completed. Test performance limits, long-term stability, and large worm propagation with other examples.

The example uses [mini_internet.py](./mini_internet.py). Its default topology contains 17 ASes (5 transit and 12 stub), 6 IXes, 27 routers, and 25 hosts (2 per stub AS plus `host_new` in AS154), for a total of 58 emulated node containers including 6 IX route-server containers. Supporting visualization services are not included in this count.

The map **star represents an IX peering network, not a container**. Each star has a corresponding real IX route-server container. They use separate coordinates so they remain distinguishable. Routers and hosts use nearby city coordinates for demonstration and do not represent the physical deployment of a real AS.

## 1. Environment and Startup

Run on a Linux emulation host with the SEED Emulator Python package, Docker Engine, and Docker Compose v2. The first build must be able to retrieve base images and packages. Live capture also requires the Linux kernel and privileged-container configuration described by `traffic-observer-service`.

### 1.1 Generate the topology

From the repository root:

```bash
cd InternetMap-Geographic/examples/E00_mini_internet
python mini_internet.py
```

The default platform is AMD64. Use `python mini_internet.py --platform arm` on ARM64. Output is written to `output/` and includes `docker-compose.yml`. The generator overwrites the output directory by default, so preserve existing experiment files first; use `--no-override` to forbid replacement.

Keep the default `--hosts-per-as 2` for the basic test. Use `--output <directory>` to change the output path. `--dumpfile` only saves the emulator object and does not generate Compose output; this procedure requires a complete render and must not use `--skip-render`.

### 1.2 Build and start the emulation containers

```bash
cd output
DOCKER_BUILDKIT=0 docker compose build
docker compose up -d
docker compose ps
```

Expected result: experiment host and router containers are running. Wait for routing convergence before testing communication. Resolve image, SEED Emulator version, or base-service errors before continuing if the build fails.

### 1.3 Start visualization and capture services

In another terminal, return to the repository root:

```bash
docker compose up -d --build seedemu_emulator_service seedemu_internet_map_geographic seedemu_traffic_observer_service
```

The live-topology Docker API and packet-capture service must observe the same emulation containers. The default Compose deployment uses the local Docker socket, so run it on the same Linux host. These tests use port 8090. Avoid a port conflict if the installed SEED Emulator version also generates a built-in map service.

| Mode | URL |
| --- | --- |
| Live 3D | `http://<ip>:8090/pro/map/3d` |
| Live 2D | `http://<ip>:8090/pro/map/2d` |
| Upload 3D | `http://<ip>:8090/pro/upload/3d` |
| Upload 2D | `http://<ip>:8090/pro/upload/2d` |

`<ip>` is the visualization host. If the browser runs on another computer, copy `output/docker-compose.yml` to that computer before testing upload mode.

## 2. Fixed Validation Data

1. Select two running hosts in different ASes on the live page and call them A and B.
2. Record A's container name, the A/B addresses, their ASes, and the expected routers or IXes on the path.
3. Select one real IX and one router for filter and detail checks.
4. Restore the initial state: no selected AS/IX and an empty search. Record node-type visibility, label settings, and node/link counts.

AS150 and AS171 hosts are good A/B candidates because their traffic crosses an IX. Do not hard-code host addresses. Use `docker compose ps` in `output`, page details, or commands inside containers to obtain actual values.

### 2.1 Geographic baseline

Networks and containers provide six-decimal coordinates through `org.seedsecuritylabs.seedemu.meta.geo.lat` and `org.seedsecuritylabs.seedemu.meta.geo.lon`.

| IX | Star city | IX container display city | Approximate distance |
| --- | --- | --- | ---: |
| 100 | New York | Philadelphia | 130 km |
| 101 | San Jose | Santa Rosa | 142 km |
| 102 | Chicago | Rockford | 129 km |
| 103 | Miami | West Palm Beach | 107 km |
| 104 | Boston | Worcester | 62 km |
| 105 | Houston | Huntsville, Texas | 108 km |

Routers are approximately 78–976 km from their star, and hosts are approximately 67–270 km from their router. Coordinates use non-desert land cities and avoid oceans and polar regions. The six stars and 58 default container coordinates do not overlap; icons can still overlap on screen depending on zoom and icon size.

Each stub AS defines three host cities and reuses coordinates after those are exhausted. AS154's `host_new` also occupies one position. Therefore configurations with a larger `--hosts-per-as` value are not required to keep all host coordinates unique.

After changing coordinates, regenerate Compose and update the live containers or parse the new file again in upload mode.

## 3. Topology and Page Functions

Run these cases in live 3D and live 2D. After parsing the file on upload pages, repeat the static-topology, search, filtering, and layout checks.

| ID | Purpose | Procedure | Expected result / pass criteria |
| --- | --- | --- | --- |
| B01 | Live topology load | Open the live page, wait for loading, inspect Overview, and refresh | Map, nodes, links, and panel appear; loading mask disappears; A/B are searchable; refresh does not duplicate nodes |
| B02 | 3D/2D consistency | Open both modes with identical filters and visibility settings | Both work; node identity and topology relationships match for the same snapshot; layouts may differ |
| B03 | Map interaction | Zoom and drag; rotate in 3D; click and hover over nodes | Map responds, details match the target, and panel controls remain usable |
| B04 | Upload topology | Select the generated Compose file, click **Parse file**, and check 3D/2D | Topology appears; known A/B, AS, and IX objects are recognized; offline details do not offer real-container operations |
| B05 | Search | Search by A's name, IP, and AS; select a suggestion or submit; clear afterward | Matching node is selected/highlighted; a unique result can be located; unrelated nodes remain unselected; clearing restores state |
| B06 | AS/IX filter | Test single selection, multiple selection, and clearing in Overview | Matching nodes and relationships appear; clearing restores the topology; clear the other filter before testing one in isolation |
| B07 | Types and labels | Toggle Host, Router, Network, IX, labels, and Hover details; adjust scales | Visibility and details follow settings; disabling Router constrains Network; disabling Network hides links; restoring shows them again |
| B08 | Panel layout | Switch Overview, Settings, and Traffic Replay; minimize/expand; test several viewport sizes | Active content is correct, controls remain clickable, edges are not clipped, and long content is scrollable |
| B22 | Star and IX distinction | Inspect every star and matching IX container | Star represents the IX network; IX container has a separate identity and coordinate; topology remains connected correctly |
| B23 | Geographic grouping | Inspect IXes, routers, hosts, and AS154 `host_new` at regional/city zoom | Nodes are on configured land cities; routers group around stars and hosts around routers; default coordinates do not overlap |
| B24 | Live/upload coordinate consistency | Compare the same objects from one generated and deployed Compose file | Identical objects use identical coordinates; IX-container offset applies to both sources; refresh/reparse does not randomize placement |

Live pages read running containers while upload pages read Compose definitions. Differences caused by services that are not running or visibility settings must be explained by node identity and input data instead of treating any count difference as a failure.

## 4. Live Traffic and Recording

### 4.1 Generate verifiable low-rate ICMP traffic

Submit this filter in Traffic Replay after replacing `<B_IP>`:

```text
icmp and host <B_IP>
```

Enable recording and run:

```bash
docker exec <A_CONTAINER> ping -c 20 -i 1 <B_IP>
```

Expected result: ping receives replies, the page receives matching traffic events, and relevant nodes flash or display flow animation. If ping itself fails, diagnose the emulated network before treating it as a page failure.

| ID | Purpose | Procedure | Expected result / pass criteria |
| --- | --- | --- | --- |
| B09 | Traffic filtering | Send with the filter above, then repeat with `icmp and dst host <B_IP>` | Only matching traffic is processed; the second filter excludes B's reply direction; path matches known endpoints |
| B10 | Animation | Toggle Flow animation and Packet path links only while sending | Display follows the toggles; path-only mode hides unrelated links; unresolved paths remain absent instead of inventing links |
| B11 | Start/stop recording | Send one batch while recording, stop recording, then send another | Events accumulate only while recording; live animation may continue while capture remains enabled |
| B12 | Stop capture | Submit an empty filter and send a few packets | Capture stops; after in-flight work completes, no new event or animation continues indefinitely |

One ping produces a request and reply, and one packet can be observed at several nodes. Do not equate 20 ping requests with 20 recorded events. Record sent packets, filter, recorded count, endpoints, and directions.

## 5. Replay Validation

Stop sending and recording while keeping the small recorded set. Run these tests independently in live 3D and live 2D.

| ID | Purpose | Procedure | Expected result / pass criteria |
| --- | --- | --- | --- |
| B13 | Interval replay | Choose Interval, set Event interval to 1000 ms, and play | Events advance in recorded order, endpoints are correct, and progress continues |
| B14 | Timeline replay | Play the same record at 1× and 2× | Event timing relationships are retained; 2× advances faster overall |
| B15 | Pause/resume | Pause during playback, observe progress, then resume | Progress stops while paused and resumes from the same position; already-started animations may finish |
| B16 | Seek/boundaries | Seek backward/forward and move to the beginning and end | Selected event matches position; stale queued animation is cleared; ending state is correct |
| B17 | Clear and record again | Stop, clear, enable capture/recording, and send again | Event list and progress reset; new replay contains no old events |

Upload-mode offline replay needs collector JSON matching this topology; matching PCAP is optional. This example does not bundle either file. If files are available, import them and repeat applicable B13–B17 checks. Mark the case “not run” when files are unavailable.

## 6. Console and Taskbar Layout

Test only on live pages. Enable Hover details and start a console from node A's Actions.

| ID | Procedure | Expected result / pass criteria |
| --- | --- | --- |
| B18 | Run `hostname` and `ip addr` | Commands respond and container identity matches the selected node |
| B19 | Drag, resize, minimize, restore, and open B's console | Windows remain usable, taskbar selects the correct container, and sessions do not mix |
| B20 | Keep taskbar visible, switch all panel tabs, and shrink the viewport | Panel bottom edge and actions are not covered by `globe-console-taskbar`; minimize/expand still works |
| B21 | Close all consoles | Taskbar hides and other page interactions remain usable |

## 7. Cleanup

Stop capture and replay and close consoles. Then run:

```bash
cd InternetMap-Geographic/examples/E00_mini_internet/output
docker compose down
```

This removes this example's containers and networks but does not stop repository-level visualization services. Save test records before any additional cleanup.

Additional documentation: [Panel and replay](../../docs/topology-dock.md), [Upload topology](../../docs/upload-topology.md), and [Deployment](../../docs/deployment.md).
