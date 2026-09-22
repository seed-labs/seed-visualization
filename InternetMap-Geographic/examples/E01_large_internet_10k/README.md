# InternetMap-Geographic Large-scale Static Topology Stress Test

## Test Purpose

This example uses `docker-compose-10k-with-geo.yml` to test parsing, layout, and rendering of a large static topology in upload mode. It also verifies that the map, lower-right panel, tabs, and settings remain responsive after loading.

This is a topology-only stress test. The YAML containers do not need to be built or started, and the test generates no network traffic. Use other examples for packet generation, recording, replay, and worm-propagation tests so that traffic processing does not affect the topology-only results.

Current input size:

| Item | Count |
| --- | ---: |
| File size | Approximately 15.4 MiB |
| Compose services | 9,957 |
| Compose networks | 9,343 |
| Service-to-network attachments | 27,097 |
| Current page expectation | Approximately 19,298 nodes / 27,097 links |

Page counts depend on parsing and node-mapping rules. If those rules change, explain the difference before updating this table and the automated assertions.

## 1. Test Environment

Current test environment:

| Item | Configuration |
| --- | --- |
| Operating system | Ubuntu 24.04.3 LTS (Noble Numbat) |
| Kernel | Linux 7.0.0-31-generic, x86_64, PREEMPT_DYNAMIC |
| Virtualization | Fully virtualized VMware guest |
| CPU model | Intel(R) Core(TM) Ultra 9 275HX |
| CPUs available to the VM | 4 online logical CPUs (0–3) |
| Python environment | `seedpy310` |
| Memory | 16 GiB |

## 2. Start the Visualization

For the repository Docker Compose deployment, run from the repository root:

```bash
docker compose up -d --build seedemu_internet_map_geographic
```

Alternatively, start the frontend development server from `InternetMap-Geographic/frontend`:

```bash
pnpm install
pnpm dev
```

Open the upload page for the selected deployment:

| Mode | Docker deployment | Frontend development server |
| --- | --- | --- |
| 3D | `http://<ip>:8090/pro/upload/3d` | `http://localhost:5174/dev/upload/3d` |
| 2D | `http://<ip>:8090/pro/upload/2d` | `http://localhost:5174/dev/upload/2d` |

`<ip>` is the address of the visualization host.

## 3. Cold-load Test

1. Open the 3D upload page in a new browser tab.
2. Optionally open the browser Performance and Memory tools. Developer tools add overhead, so record runs with and without them separately.
3. Select `docker-compose-10k-with-geo.yml` from this directory.
4. Click **Parse file** and start timing.
5. Stop timing after the loading mask disappears and the globe, nodes, links, and lower-right panel are visible.
6. Verify the node and link counts in Overview. Check for parsing errors, a blank page, or a browser crash.
7. Leave the page idle for 30 seconds. Record stable memory use and any sustained abnormal CPU/GPU use.
8. Close and reopen the tab and repeat three times. Record the first run separately from the next two.
9. Repeat the procedure on the 2D upload page.

Record at least these milestones:

- clicking **Parse file** to appearance of the loading mask;
- completion of YAML parsing;
- first visible nodes and links;
- disappearance of the loading mask and availability of page controls.

Total time is useful for basic comparison, but it cannot separate YAML parsing, graph layout, and Cesium first-frame rendering costs.

## 4. Map Interaction Stress

After loading completes, leave the page idle for 10 seconds. Then perform each operation for about 10 seconds in this order:

| ID | Operation | Observe | Pass criteria |
| --- | --- | --- | --- |
| T01 | Continuously drag and rotate the 3D globe | Drag responsiveness and continuous link display | No freeze or crash; interaction resumes immediately after release |
| T02 | Repeatedly zoom in and out | Frame rate and icon/link clarity | No obvious blur, disappearance, or displacement |
| T03 | Click different nodes repeatedly | Click response, selection highlight, and details | Correct target is selected without a long loss of response |
| T04 | Enable Hover details and move the pointer | Hover card and pointer response | Card matches the target; disabling the option removes the extra picking cost |
| T05 | Search for a known node and clear the query | Input, suggestions, highlight, and location | Input remains responsive, result is correct, and clearing restores the state |

Use the browser Performance panel when possible. Record main-thread long tasks, interaction latency, frame intervals, and GPU activity. Visual observations should include the triggering operation and longest pause instead of only saying “smooth” or “slow.”

## 5. Lower-right Panel and Control Stress

Run these steps after map loading so first-frame construction is not counted as tab latency:

1. Switch through `Overview → Settings → Traffic Replay → Overview` for 10 rounds.
2. Confirm the active-tab style and content after every switch.
3. Minimize and expand the panel 10 times.
4. Open and close the AS and IX selectors in Overview; select one item and then clear it.
5. Disable and restore Host, Router, Network, and IX in Settings.
6. Confirm that related links hide with a hidden type and return with the nodes.
7. Move Node/link scale to the minimum, midpoint, and maximum.
8. Toggle Node labels and Hover details.
9. Repeat one round while dragging or zooming the map.

Type visibility uses the `show` property of existing primitive groups. Toggling a type must not reparse YAML, recalculate curves, or clear and rebuild the topology. If a toggle causes a long pause, record the type, active tab, and pause duration.

Pass criteria:

- every click produces exactly one state change, with no dropped or duplicate toggles;
- tabs, checkboxes, sliders, selectors, and the minimize button remain usable;
- the page does not crash or turn blank, and queued work does not grow without recovery;
- panel content and its lower edge are not covered by other overlays;
- switching tabs while the map is idle does not rebuild topology geometry;
- restored node and link counts match their values before hiding.
