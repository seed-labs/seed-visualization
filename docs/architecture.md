# seed-visualization 架构与模块调用关系

本文档基于当前仓库代码、`docker-compose.yml`、Nginx 配置和前后端服务入口整理，用 Mermaid.js 描述 `seed-visualization` 的整体架构与主要调用关系。

## 1. 项目模块总览

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontSize": "18px", "fontFamily": "Arial, Microsoft YaHei, sans-serif"}, "flowchart": {"htmlLabels": true, "nodeSpacing": 90, "rankSpacing": 110, "curve": "basis"}} }%%
flowchart TB
  Repo["seed-visualization"]

  Repo --> Satellite["satellite-emulator"]
  Repo --> InternetMap["internet-map"]
  Repo --> EmulatorService["emulator-service"]
  Repo --> TrafficObserver["traffic-observer"]
  Repo --> Shared["shared"]

  Satellite --> SatFrontend["frontend"]
  Satellite --> SatBackend["backend"]
  Satellite --> SatTmp["tmp"]
  Satellite --> SatNginx["nginx.conf"]

  InternetMap --> MapFrontend["frontend"]
  InternetMap --> MapNginx["nginx.conf"]

  EmulatorService --> EmuApi["api/v1"]
  EmulatorService --> EmuUtils["utils"]

  TrafficObserver --> BPF["bpf"]
  TrafficObserver --> Collector["collector"]
  TrafficObserver --> ObserverInternal["internal"]

  Shared --> SharedGo["go/docker-api"]
  Shared --> SharedTS["ts"]
  Shared --> SharedPy["python"]
```

模块说明：

- `satellite-emulator/frontend`：Vue + Cesium + Element Plus，负责 3D 卫星/基站/容器节点可视化。
- `satellite-emulator/backend`：Express + WebSocket，负责卫星链路、网络路径事件广播。
- `emulator-service`：共享仿真器 API，负责 Docker 容器、网络、console、sniffer、BGP 等控制。
- `traffic-observer`：eBPF + Go Collector，负责宿主机网卡抓包、filter 控制、packet metadata 广播。
- `shared`：按语言组织共享库，目前包含 Go Docker API 封装。

## 2. Docker Compose 运行时架构

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontSize": "18px", "fontFamily": "Arial, Microsoft YaHei, sans-serif"}, "flowchart": {"htmlLabels": true, "nodeSpacing": 95, "rankSpacing": 120, "curve": "basis"}} }%%
flowchart LR
  Browser["Browser"]

  subgraph Compose["docker-compose.yml"]
    subgraph Net["internet-map bridge network"]
      InternetMapC["internet-map"]
      SatelliteNginx["satellite nginx"]
      SatelliteBackend["satellite backend"]
      EmulatorC["emulator-service"]
    end

    TrafficC["traffic-observer"]
  end

  DockerAPI["Docker API<br/>/var/run/docker.sock"]
  HostNet["Host NICs"]
  Kernel["Linux Kernel"]

  Browser -->|"8080"| InternetMapC
  Browser -->|"9090"| SatelliteNginx

  InternetMapC -->|"proxy /api/v1"| EmulatorC
  SatelliteNginx -->|"local /api/v1"| SatelliteBackend
  SatelliteNginx -->|"proxy /emulator"| EmulatorC
  SatelliteNginx -->|"proxy /traffic-observer"| TrafficC

  EmulatorC --> DockerAPI
  TrafficC --> DockerAPI
  TrafficC --> HostNet
  TrafficC --> Kernel
```

说明：

- `emulator-service` 是多个前端共享的仿真器控制 API。
- `satellite-emulator` 容器内的 Nginx 同时代理：
  - `/api/v1` 到卫星后端 `127.0.0.1:9091`
  - `/emulator/` 到 `emulator-service:7071`
  - `/traffic-observer/` 到 `traffic-observer:19092`
- `traffic-observer` 使用特权容器、host network 和 host PID，用于加载 eBPF 并 attach 到宿主机网卡。

## 3. Satellite Emulator 前端调用关系

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontSize": "18px", "fontFamily": "Arial, Microsoft YaHei, sans-serif"}, "flowchart": {"htmlLabels": true, "nodeSpacing": 90, "rankSpacing": 115, "curve": "basis"}} }%%
flowchart TB
  Dashboard["StarlinkDashboard"]
  Globe["CesiumGlobe"]
  Scene["cesiumScene"]
  SatList["SatelliteList"]
  Panels["Detail Panels"]

  Dashboard --> Globe
  Globe --> Scene
  Dashboard --> SatList
  Dashboard --> Panels

  subgraph DataServices["frontend services"]
    SatDS["satelliteDataSource"]
    GroundSvc["groundStationService"]
    NetworkNodeSvc["networkNodeService"]
    ContainerSvc["emulatorContainerService"]
    TrafficSvc["trafficObserverService"]
    ShellStyle["satelliteShellStyle"]
    OrbitSvc["orbitService"]
    TleSvc["tleService"]
  end

  Dashboard --> SatDS
  Dashboard --> GroundSvc
  Dashboard --> NetworkNodeSvc
  Dashboard --> ContainerSvc
  Dashboard --> TrafficSvc
  Dashboard --> ShellStyle
  Dashboard --> OrbitSvc
  Dashboard --> TleSvc

  SatDS -->|"WS link-updates"| SatBackend["satellite backend"]
  NetworkNodeSvc -->|"GET network-nodes"| SatBackend
  ContainerSvc -->|"GET container"| EmulatorService["emulator-service"]
  TrafficSvc -->|"GET/PUT filter"| TrafficObserver["traffic-observer"]
  TrafficSvc -->|"WS packets"| TrafficObserver
```

服务说明：

- `satelliteDataSource`：订阅卫星链路 WebSocket，并按仿真时钟推进卫星位置。
- `trafficObserverService`：访问 `/traffic-observer/filter` 和 `/traffic-observer/ws/packets`。
- `emulatorContainerService`：访问 emulator-service 的 `/container`，用于把容器节点叠加到 Cesium 地球。

## 4. Satellite Backend 调用与广播关系

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontSize": "18px", "fontFamily": "Arial, Microsoft YaHei, sans-serif"}, "flowchart": {"htmlLabels": true, "nodeSpacing": 90, "rankSpacing": 110, "curve": "basis"}} }%%
flowchart LR
  Client["Satellite Frontend"]
  SatApi["Satellite API"]
  TmpFiles["tmp JSON"]
  Subscribers["WS subscribers"]

  Client -->|"GET network-nodes"| SatApi
  Client -->|"WS link-updates"| SatApi
  External["外部脚本/用户"] -->|"POST links"| SatApi

  SatApi -->|"read JSON"| TmpFiles
  SatApi -->|"broadcast links"| Subscribers
  Subscribers -->|"link frames"| Client
```

核心接口：

- `GET /api/v1/satellite/network-nodes`
- `POST /api/v1/satellite/links`
- `WS /api/v1/satellite/link-updates`

## 5. emulator-service 调用关系

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontSize": "18px", "fontFamily": "Arial, Microsoft YaHei, sans-serif"}, "flowchart": {"htmlLabels": true, "nodeSpacing": 90, "rankSpacing": 110, "curve": "basis"}} }%%
flowchart TB
  Frontends["Frontends"]
  Api["emulator-service API"]

  DockerRuntime["Docker runtime"]
  DockerAPI["Docker API socket"]
  SocketHandler["socket-handler"]
  Controller["controller"]
  Sniffer["sniffer"]
  PluginManager["plugin-manager"]

  Frontends -->|"container/network"| Api
  Frontends -->|"net/BGP control"| Api
  Frontends -->|"sniff/packet WS"| Api
  Frontends -->|"console WS"| Api
  Frontends -->|"vis WS"| Api

  Api --> DockerRuntime
  DockerRuntime --> DockerAPI
  Api --> SocketHandler
  Api --> Controller
  Api --> Sniffer
  Api --> PluginManager
```

`emulator-service` 会通过 Docker API 读取 SEED 容器，并根据容器 labels 解析 `Emulator.ParseNodeMeta()` / `Emulator.ParseNetMeta()`，只向前端返回属于当前 SEED 仿真系统的节点和网络。

## 6. traffic-observer 抓包链路

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontSize": "18px", "fontFamily": "Arial, Microsoft YaHei, sans-serif"}, "flowchart": {"htmlLabels": true, "nodeSpacing": 100, "rankSpacing": 120, "curve": "basis"}} }%%
flowchart TB
  Frontend["Traffic Replay UI"]
  Control["Control Server"]
  Collector["Go Collector"]

  subgraph Internal["traffic-observer/internal"]
    Config["config"]
    DockerIface["dockeriface"]
    Probe["probe"]
    Filter["filter"]
    Event["event"]
    Realtime["realtime"]
    Sink["sink"]
  end

  subgraph KernelPath["Kernel / Host Network"]
    TC["TC hooks"]
    BPF["eBPF program"]
    RingBuf["ringbuf"]
    FilterMap["filter_cfg map"]
  end

  DockerAPI["Docker API<br/>/var/run/docker.sock"]
  Containers["SEED containers"]

  Frontend -->|"PUT filter"| Control
  Frontend -->|"GET filter"| Control
  Frontend -->|"WS packets"| Control

  Control --> Collector
  Collector --> Config
  Collector --> DockerIface
  DockerIface --> DockerAPI
  DockerIface --> Containers

  Collector --> Filter
  Filter --> FilterMap
  Collector --> Probe
  Probe --> TC
  TC --> BPF
  BPF --> RingBuf
  RingBuf --> Collector
  Collector --> Event
  Collector --> Sink
  Collector --> Realtime
  Realtime --> Control
  Control --> Frontend
```

模块说明：

- `dockeriface`：通过 Docker API 和宿主机 `/sys/class/net` 建立 container 与 host veth 的映射。
- `probe`：加载 eBPF object，并把 ingress/egress 程序 attach 到目标网卡。
- `filter`：解析 tcpdump-like filter，并写入 `filter_cfg` BPF map。
- `event`：把 ringbuf 的 raw packet event 转换成前端使用的 JSON packet metadata。
- `realtime`：维护 `/ws/packets` 订阅者并广播 packet。

关键行为：

- 空 filter 表示关闭抓包。
- 非空 filter 会写入 eBPF map，非匹配包在内核侧被丢弃，不进入 ringbuf。
- Collector 会把包事件补充容器信息，例如 containerId、nodeName、nodeIp、source/dest container 信息。
- 前端 `Traffic Replay` 的 Apply 只控制后端 filter；是否记录到回放列表由前端 Record 按钮单独控制。

## 7. Traffic Replay 前端数据流

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontSize": "18px", "fontFamily": "Arial, Microsoft YaHei, sans-serif"}, "sequence": {"actorFontSize": 18, "messageFontSize": 16, "noteFontSize": 16}} }%%
sequenceDiagram
  participant User as User
  participant UI as StarlinkDashboard Traffic Replay
  participant TO as traffic-observer
  participant EBPF as eBPF filter/map
  participant WS as /ws/packets

  User->>UI: 输入 filter 并点击 Apply
  UI->>TO: PUT /traffic-observer/filter {filter}
  TO->>EBPF: 更新 filter_cfg map
  TO-->>UI: {filter}

  UI->>TO: GET /traffic-observer/filter
  TO-->>UI: 当前 filter

  TO->>WS: broadcast packet metadata
  WS-->>UI: packet event
  UI->>UI: 若 Record 开启，则追加到 packetEvents[]
  UI->>UI: 若非 Playback，则闪烁对应容器节点

  User->>UI: Play
  UI->>UI: 按 timestampNs/timestamp 排序
  loop Event interval
    UI->>UI: 一个 packet 一个 packet 回放/闪烁
    UI->>UI: 按配置周期更新卫星位置
  end
```

## 8. Internet Map 前端调用关系

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontSize": "18px", "fontFamily": "Arial, Microsoft YaHei, sans-serif"}, "flowchart": {"htmlLabels": true, "nodeSpacing": 90, "rankSpacing": 110, "curve": "basis"}} }%%
flowchart TB
  MapApp["internet-map frontend"]
  BaseMap["BaseMap"]
  MapUI["map-ui"]
  DataSource["map-datasource"]
  Tools["tools"]
  Request["request"]

  MapApp --> BaseMap
  BaseMap --> MapUI
  BaseMap --> DataSource
  DataSource --> Request
  DataSource --> Tools

  Request -->|"container"| EmulatorService["emulator-service"]
  Request -->|"net control"| EmulatorService
  Request -->|"BGP control"| EmulatorService
  Tools -->|"host WS"| EmulatorService
  DataSource -->|"sniff WS"| EmulatorService
  DataSource -->|"vis WS"| EmulatorService
```

模块说明：

- `map-datasource`：加载 `/container` 数据，订阅 sniff 与可视化更新 WebSocket。
- `map-ui`：维护节点/边样式、闪烁、回放等地图交互。
- `request`：Axios API client。

## 9. 主要调用路径汇总

| 场景 | 发起方 | 路径 | 接收方 | 作用 |
| --- | --- | --- | --- | --- |
| 卫星/基站/网络链路更新 | 外部脚本/用户 | `POST /api/v1/satellite/links` | satellite backend | 读取 tmp JSON 并广播 |
| 卫星链路订阅 | satellite frontend | `WS /api/v1/satellite/link-updates` | satellite backend | 接收 ground/satellite/network links |
| 网络节点元数据 | satellite frontend | `GET /api/v1/satellite/network-nodes` | satellite backend | 加载 host/router 位置 |
| SEED 容器列表 | satellite/internet-map frontend | `GET /emulator/api/v1/container` 或 `/api/v1/container` | emulator-service | 获取 Docker 容器和 SEED metadata |
| Internet Map 控制网络 | internet-map frontend | `POST /api/v1/container/:id/net` | emulator-service | 开关容器网络 |
| BGP 控制 | internet-map frontend | `POST /api/v1/container/:id/bgp/:peer` | emulator-service | 控制 BGP peer 状态 |
| 抓包 filter | satellite frontend | `GET/PUT /traffic-observer/filter` | traffic-observer | 获取/更新 eBPF 抓包过滤器 |
| 抓包事件订阅 | satellite frontend | `WS /traffic-observer/ws/packets` | traffic-observer | 实时接收 packet metadata |

## 10. 设计边界

- `emulator-service` 负责仿真系统容器级控制，不直接处理 Cesium 卫星渲染。
- `satellite-emulator/backend` 负责卫星链路/网络路径事件，不直接控制 Docker。
- `traffic-observer` 负责 host 网络抓包和 packet metadata，不保存 payload。
- `satellite-emulator/frontend` 负责三维可视化、Traffic Replay 录制/播放、节点闪烁与 UI 状态编排。
- `shared/` 按语言划分共享库，当前已有 Go Docker API 封装，后续可继续扩展 TS/Python 版本。
