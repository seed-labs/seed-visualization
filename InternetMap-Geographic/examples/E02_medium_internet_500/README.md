# E02_medium_internet_500 流量与混合操作压力测试

## 测试目的

本示例使用固定的 500 容器地理拓扑，验证 InternetMap-Geographic 在持续收包时的流量处理能力、页面混合操作响应、ICMP/TCP/UDP 协议兼容性，以及长时间运行后的断线恢复和再次启动能力。

主要测试内容：

- 纯流量压力：逐步增加包速率、活跃流数和新流创建速率，覆盖单流、并发流和混合协议。
- 混合操作压力：收包期间缩放和旋转地图、筛选 AS/IX、切换面板、暂停、跳转和恢复回放。
- 耐久与恢复：持续运行后模拟采集断线和服务重启，停止发包、清空记录，再次开始采集和发包。

本目录提供以下辅助脚本：

| 文件 | 用途 |
| --- | --- |
| `medium_internet_500.py` | 生成 500 容器拓扑和地理坐标 |
| `scripts/traffic_stress.sh` | 启动或停止 ICMP/TCP/UDP/混合并发流量 |
| `scripts/run_pressure_suite.sh` | 顺序执行五个递增压力阶段 |

## 1. 环境要求

建议使用独立 Linux 仿真主机：

| 资源 | 最低要求 | 建议配置 |
| --- | ---: | ---: |
| 内存 | 64 GiB | 96 GiB 或以上 |
| CPU | 16 个逻辑 CPU | 24 个逻辑 CPU或以上 |
| 可用磁盘 | 80 GiB | SSD，120 GiB 或以上 |
| Docker | Docker Engine + Compose v2 | 使用较新的稳定版本 |
| Python | 3.10 或以上 | 与 SEED Emulator 环境一致 |

实时抓包还要求主机支持 eBPF、挂载 debugfs/BPF 文件系统，并允许 `seedmu_traffic_observer_service` 以特权和 host 网络模式运行。

辅助脚本依赖 Bash、Docker CLI，以及节点基础镜像中自带的 `ping`、`nc`、`dd`。脚本不向容器安装额外软件。

## 2. 生成并启动拓扑

从仓库根目录执行：

```bash
cd InternetMap-Geographic/examples/E02_medium_internet_500
python3 -m pip install -r requirements.txt
python3 medium_internet_500.py
```

默认参数为 500 个节点、AMD64、随机种子 42，输出到 `output/`。ARM64 主机使用：

```bash
python3 medium_internet_500.py --platform arm
```

生成器会验证以下条件：

- 恰好生成 500 个容器，其中包括 20 个 IX route-server、420 个 transit router、20 个 stub router 和 40 个 stub host。
- 包含 20 个 IX 网络。
- 节点坐标位于经过陆地检查的城市，不重复且避开沙漠核心和极区。
- IX star 使用城市锚点，真实 IX 容器使用附近的独立显示坐标。

启动拓扑：

```bash
cd output
DOCKER_BUILDKIT=0 docker compose build
docker compose up -d
docker compose ps
```

等待所有容器进入运行状态和路由协议收敛后再开始压力测试。首次构建和启动 500 个容器耗时较长，不应把构建时间计入流量测试结果。

另开终端，在仓库根目录启动可视化、Docker API 和流量采集服务：

```bash
docker compose up -d --build \
  seedemu_emulator_service \
  seedemu_internet_map_geographic \
  seedmu_traffic_observer_service
```

访问地址：

- 3D：`http://<主机IP>:8090/pro/map/3d`
- 2D：`http://<主机IP>:8090/pro/map/2d`

## 3. 测试前基线

修改脚本为可执行文件

```bash
chmod +x scripts/traffic_stress.sh scripts/run_pressure_suite.sh
```

在页面记录加载完成时间、节点/连线数量、浏览器进程内存、采集事件速率和空闲时 CPU。先选择两台跨区域容器验证连通性：

```bash
# 测试 ICMP
./scripts/traffic_stress.sh run --protocol icmp --concurrency 1 --duration 10 --interval-ms 1000
在页面右下角的 `Traffic Replay` 中提交 filter `icmp and src host <srcIP> and dst host <dstIP>`
观察在10s内，有10个数据包发送（闪烁10次）

# 测试 tcp、udp 更换协议即可
```

脚本只会使用 Compose 标签 `org.seedsecuritylabs.seedemu.meta.role=Host` 的容器发包。默认选择第一个运行中的 Host 作为源端，并选择位于不同 Docker 网络的另一个 Host 作为目标端，然后自动读取目标 Host 的第一个 IPv4 地址。不会使用 Router 或 IX route-server 发包。若自动选择的 Host 不是期望测试路径，应明确传入：

```bash
./scripts/traffic_stress.sh run \
  --source <源容器> \
  --target <目标容器> \
  --target-ip <目标可达IP> \
  --protocol icmp --concurrency 1 --duration 10
```

确认 ping 和页面流量均正常后，执行：

```bash
./scripts/traffic_stress.sh stop
```

## 4. 通用流量脚本

基本格式：

```bash
./scripts/traffic_stress.sh run \
  --protocol <icmp|tcp|udp|mixed> \
  --concurrency <不同跨网段Host对的流数量> \
  --duration <秒> \
  --interval-ms <每条流的发送间隔> \
  --payload-bytes <TCP或UDP负载字节数>
```

协议行为：

| 协议 | 生成方式 | 主要压力维度 |
| --- | --- | --- |
| ICMP | 每条流运行一个持续 `ping`，使用 `-i` 控制间隔、`-w` 控制时长 | 包速率、并发端点事件 |
| TCP | 每次发送新建一次 `nc` 连接 | 新流速率、连接并发、路径动画 |
| UDP | 每次通过 `nc -u` 发送一个负载 | 包速率、无连接流量处理 |
| mixed | 工作进程按 ICMP/TCP/UDP 轮换 | 协议混合与页面综合处理 |

`--concurrency` 表示同时运行的不同跨网段 Host 对数量。脚本优先固定同一个源 Host；可用目标不足时再换源，并保证生成 `A → B` 后不再生成 `B → A`。启动时会显示最大可用流数，请求值超过最大值时自动按最大值运行。Router、IX 节点和同网段 Host 对都会被拒绝。

查看或停止脚本产生的进程：

```bash
./scripts/traffic_stress.sh status
./scripts/traffic_stress.sh stop
```

## 5. 纯流量压力

**测试时请设置对应的filter**

每个阶段开始前清空页面记录，使用固定过滤器，运行后保留至少 30 秒恢复观察时间。建议从低到高逐级执行，不要直接从最高压力开始。

| 阶段 | 示例命令 | 验证重点 |
| --- | --- | --- |
| 单流基线 | `./scripts/traffic_stress.sh run --protocol icmp --concurrency 1 --duration 180 --interval-ms 1000` | 端点、方向、路径和事件计数是否正确 |
| ICMP 包速率 | `./scripts/traffic_stress.sh run --protocol icmp --concurrency 32 --duration 300 --interval-ms 20` | 高频小包下采集和动画是否持续 |
| TCP 新流 | `./scripts/traffic_stress.sh run --protocol tcp --concurrency 64 --duration 300 --interval-ms 25 --payload-bytes 4096` | 频繁连接建立时是否丢失响应 |
| UDP 包速率 | `./scripts/traffic_stress.sh run --protocol udp --concurrency 64 --duration 300 --interval-ms 10 --payload-bytes 1400` | 高频 UDP 下事件队列和内存增长 |
| 混合协议 | `./scripts/traffic_stress.sh run --protocol mixed --concurrency 96 --duration 600 --interval-ms 20 --payload-bytes 2048` | 三种协议同时存在时的吞吐和交互 |

也可以运行预设套件：

```bash
STAGE_DURATION=180 REST_SECONDS=30 ./scripts/run_pressure_suite.sh
```

指定固定端点：

```bash
SOURCE_CONTAINER=<源容器> \
TARGET_CONTAINER=<目标容器> \
TARGET_IP=<目标IP> \
STAGE_DURATION=300 \
./scripts/run_pressure_suite.sh
```

每次只改变一个压力变量，并记录：发送配置、测试时长、页面接收事件数、丢弃数、CPU、内存、最长交互延迟及错误日志。出现持续积压、浏览器失去响应、采集服务重启或内存不断增长时停止升压。

## 6. 混合操作压力

在 `mixed` 流量持续发送至少 10 分钟期间，循环执行下列操作。3D 和 2D 页面分别测试：

1. 连续缩放、平移；3D 模式旋转地球并切换观察区域。
2. 打开 AS 和 IX 选择框，连续选择多个项目，确认选择期间不重绘；点击 Apply 后确认选择框先关闭，再显示 Loading 和筛选结果。
3. 清空筛选，等待完整拓扑恢复；重复选择不同 AS/IX。
4. 切换 Overview、Settings、Traffic Replay 面板，每个面板停留 5–10 秒。
5. 切换 Host、Router、Network、IX 和标签显示，确认类型开关只隐藏/显示图元。
6. 开始录制，运行 2 分钟后停止；以 Interval 和 Timeline 模式分别回放。
7. 回放期间执行暂停、继续、向前/向后跳转和拖动进度。
8. 搜索已知源/目标节点并定位，随后清空搜索。

通过标准：操作仍能得到反馈，不出现持续空白、控件失效或错误拓扑；停止流量后事件队列能够下降，页面和服务资源占用逐步回落。

## 7. 耐久与恢复

建议耐久测试持续 1 小时

```bash
./scripts/traffic_stress.sh run \
  --protocol mixed \
  --concurrency 48 \
  --duration 3600 \
  --interval-ms 50 \
  --payload-bytes 1024
```

按顺序验证恢复场景：

1. **WebSocket/采集重连**：重启 `seedmu_traffic_observer_service`，确认页面显示断线并能重新建立连接。
2. **Docker API 恢复**：重启 `seedemu_emulator_service`，确认实时拓扑刷新后恢复。
3. **前端恢复**：刷新页面或重启 `seedemu_internet_map_geographic`，确认可重新加载相同拓扑。
4. **停止发包**：执行 `./scripts/traffic_stress.sh stop`，确认新事件停止增长。
5. **清空状态**：停止采集和回放，清空录制，确认队列、进度和动画复位。
6. **再次启动**：重新运行单流基线，再运行一个混合协议阶段，确认无需重建拓扑即可恢复测试。

恢复通过标准：服务重连后无需手工修改内部状态；旧事件不会混入新一轮记录；节点、链路和筛选保持正确；CPU 和内存在停止流量后回落到可接受区间。

## 8. run_pressure_suite.sh


STAGE_DURATION=180 REST_SECONDS=30 ./scripts/run_pressure_suite.sh

通过设置阶段持续时间（`STAGE_DURATION`）和阶段间隔（`REST_SECONDS`），依次执行


```bash
traffic_stress.sh run --protocol icmp concurrency=1 interval=1000 payload=64
traffic_stress.sh run --protocol icmp concurrency=32 interval=20 payload=64
traffic_stress.sh run --protocol tcp concurrency=64 interval=25 payload=4096
traffic_stress.sh run --protocol udp concurrency=64 interval=10 payload=1400
traffic_stress.sh run --protocol mixed concurrency=96 interval=20 payload=2048

```

## 9. 测试步骤

0. 构建并启动仿真器
  参考步骤2. 生成并启动拓扑
  访问：
  - 3D：`http://<主机IP>:8090/pro/map/3d`
  - 2D：`http://<主机IP>:8090/pro/map/2d`

1. 基本功能验证
    1. 观察拓扑显示、拖动缩放等是否正常，
    2. OverView 面板
      点击AS或IX，可选择对应的选项，确认提交后，拓扑会发生变化，只显示对应的AS或IX及其相关的节点
    3. Settings 面板
      - 根据关键词搜索节点
      - 选择要显示的节点类型，取消”Network“的同时，连线会隐藏
      - 拖动轴，会改变节点的大小和连线的宽度
      - ”Node Labels“ 控制节点的`Label`显示
      - ”Node details“ 控制鼠标悬浮在节点上时显示节点详情
    4. Traffic Replay 面板
        1. 测试ICMP 
          1. 在右下角的 Traffic Replay 面板中设置 filter 为 `icmp`
          2. 执行命令
            ```bash
            ./scripts/traffic_stress.sh run --protocol icmp --concurrency 1 --duration 10 --interval-ms 1000
            ```
          3. 观察闪烁的节点，闪烁的频率和次数（1秒闪烁依次，共10次）
          4. 勾选 ”Packet path links only“，再执行`2`中的命令，观察显示的路径是否正确
          5. 取消 ”Packet path links only“，勾选 ”Flow animation“，再执行`2`中的命令，观察动画（方向、路径）
          6. 同时勾选以上两个选项，再执行`2`中的命令，观察动画（方向、路径）
          7. 录制。点击`Record`，开始记录抓到的数据包（数量上限10w，达到上限会自动停止）
          8. 回放。点击`Play replay`，开始回放，支持上一步、下一步、暂停、停止、清空，回放有 `Interval、Timeline`两种模式，也支持 ”Packet path links only“ 和 ”Flow animation“
        2. tcp、udp 方法类同

2. 并发流量
    1. 步骤参考上述的`1. 测试ICMP `，执行的命令和设置的filter略有不同
    2. 如下:
    ```bash
      # 三条流 filter: icmp
      ./scripts/traffic_stress.sh run --protocol icmp --concurrency 3 --duration 3600 --interval-ms 10
      # 760条 filter: icmp
      ./scripts/traffic_stress.sh run --protocol icmp --concurrency 760 --duration 3600 --interval-ms 10 --payload-bytes 1400
      # 760条 filter: icmp or udp
      ./scripts/traffic_stress.sh run --protocol mixed --concurrency 760 --duration 3600 --interval-ms 10 --payload-bytes 1400
      # 760条 filter: icmp or udp or tcp，由于仿真器本就有tcp的数据包在传输，tcp 抓包可能会存在与脚本不符的情况
      ./scripts/traffic_stress.sh run --protocol mixed --concurrency 760 --duration 3600 --interval-ms 10 --payload-bytes 1400
    ```
3. 压力测试
  在 `2. 并发流量` 测试时，记录10w数据包，收包期间缩放、筛选、切换面板、暂停和跳转回放。
  记录的数据包过多时，如果已勾选 `Flow animation` 再开始播放，播放按钮会显示 loading，Packet 轴下方会以红色粗体提示正在计算流向，计算完成后开始播放。回放过程中勾选 `Flow animation` 时，会暂停在当前位置并显示相同提示，计算完成后继续播放。空闲状态下仅勾选该选项不会立即计算。

  Timeline 的正数时间窗口会预先把录制报文分批；同一批按同一时刻显示，Packet 轴按该批实际报文数量推进。当前批与下一批的等待时间使用“当前批最后一包到下一批第一包”的时间差，并除以 Timeline speed。

4. 耐久与恢复
  持续运行后断线重连、停止发包、清空记录，再次开始。如 重启 seedmu_traffic_observer_service 容器等
  

## 10. 清理

先停止脚本产生的进程：

```bash
./scripts/traffic_stress.sh stop
```

再关闭本例拓扑：

```bash
cd output
docker compose down
```

需要关闭仓库级服务时，在仓库根目录另行执行：

```bash
docker compose stop \
  seedmu_traffic_observer_service \
  seedemu_internet_map_geographic \
  seedemu_emulator_service
```
