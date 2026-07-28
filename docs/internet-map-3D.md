# internet-map-3D

`internet-map-3D` 表示 Internet Map 的 3D 展示方向。当前项目中没有单独的 `internet-map-3D` 容器，文档中将其作为前端能力模块描述。

## 和其它服务的关系

```mermaid
%%{init: {"flowchart": {"useMaxWidth": true, "htmlLabels": true}} }%%
flowchart TB
  IM3D["Internet Map 3D 前端能力"]
  Emulator["emulator-service"]
  Traffic["traffic-observer-service"]
  Packets["packet metadata"]

  IM3D -->|"容器及操作"| Emulator
  Traffic -->|"WS"| Packets
  Packets --> IM3D
```

## 说明

- 容器操作和节点信息仍由 `emulator-service` 提供。
- 如果展示实时 packet 流动，则订阅 `traffic-observer-service` 的 packet WebSocket。
