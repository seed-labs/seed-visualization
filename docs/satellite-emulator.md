# satellite-emulator

`satellite-emulator` 现在只负责 Satellite 前端和 Nginx 代理。

## 职责

- 构建并托管 Satellite 3D 前端。
- 通过 Nginx 代理：
  - `/api/v1` 到 `satellite-emulator-service:9091`
  - `/emulator/` 到 `emulator-service:7071`
  - `/traffic-observer/` 到 `host.docker.internal:19092`

## 组件拓扑

```mermaid
%%{init: {"flowchart": {"useMaxWidth": true, "htmlLabels": true}} }%%
flowchart TB
  Dashboard["StarlinkDashboard.vue"]
  Globe["CesiumGlobe.vue"]
  Dock["StarlinkRightDock.vue"]
  Timeline["TimelineEvents.vue"]
  SatDetail["SatelliteDetailPanel.vue"]
  GroundDetail["GroundStationDetailPanel.vue"]
  TrafficDetail["TrafficContainerDetailPanel.vue"]

  Dashboard --> Globe
  Dashboard --> Dock
  Dashboard --> Timeline
  Dashboard --> SatDetail
  Dashboard --> GroundDetail
  Dashboard --> TrafficDetail

  Dock --> Shell["StarlinkShellLegend.vue"]
  Dock --> List["SatelliteList.vue"]
  Dock --> Replay["TrafficReplayPanel.vue"]
```

## Service / API 调用

```mermaid
%%{init: {"flowchart": {"useMaxWidth": true, "htmlLabels": true}} }%%
flowchart LR
  Dashboard["StarlinkDashboard.vue"]
  Globe["CesiumGlobe.vue"]
  Scene["cesiumScene.ts"]

  SatDS["<div style='min-width:240px;white-space:nowrap'>satelliteDataSource.ts</div>"]
  ContainerSvc["<div style='min-width:280px;white-space:nowrap'>emulatorContainerService.ts</div>"]
  TrafficSvc["<div style='min-width:260px;white-space:nowrap'>trafficObserverService.ts</div>"]
  SatAPI["satellite-emulator-service"]
  Emulator["emulator-service"]
  Traffic["traffic-observer-service"]

  Dashboard --> SatDS
  Dashboard --> ContainerSvc
  Dashboard --> TrafficSvc
  Globe --> Scene
  SatDS -->|"WS link-updates"| SatAPI
  ContainerSvc -->|"GET /container"| Emulator
  TrafficSvc -->|"GET/PUT /filter<br/>WS /ws/packets"| Traffic
```
