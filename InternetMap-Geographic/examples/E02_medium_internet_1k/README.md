# E02_medium_internet_1k 测试说明

本示例用于测试约 1000 个容器节点的 Internet Map 加载、交互和流量展示能力。通用的页面功能、Flow animation、抓包录制、Interval/Timeline 回放、混合操作压力及恢复测试方法与 500 节点示例一致，请直接参考 [E02_medium_internet_500/README.md](../E02_medium_internet_500/README.md)。本文只说明 1k 示例的差异和专用脚本。

## 与 500 节点示例的差异

- 本拓扑没有 Host 节点，流量端点使用 `Router`、`BorderRouter` 或 `Route Server` 容器。
- 本拓扑没有地理位置标签，不能用于验证城市坐标、IX 星形节点位置以及地理距离分布。
- 路由器通常连接多个网络，但连通性检测和压力脚本只使用 Docker 返回的第一个非空 IPv4 作为主 IP。
- 压力脚本不会从全部节点中直接选择端点，只使用 `find_pingable_pairs.sh` 已验证的节点对。
- 1000 个容器可能超过 Linux 默认 ARP 邻居表容量，启动前需要调整宿主机内核参数。

## 生成和启动拓扑

在本目录运行：

```bash
python3 medium_internet_1k.py 1078
cd output_1078_exportAll
DOCKER_BUILDKIT=0 docker compose build
docker compose up -d
```

生成器使用 `real_topology_1078.txt` 和 `assignment.pkl`。如需指定输入和输出目录：

```bash
python3 medium_internet_1k.py 1078 \
  --topology-file real_topology_1078.txt \
  --output-dir output_1078_exportAll
```

等待容器全部启动且路由协议收敛后再检测连通性。

## 大规模容器宿主机参数

Linux 默认邻居表上限通常为 1024。约 1000 个容器运行时可能出现以下日志：

```text
neighbour: arp_cache: neighbor table overflow!
```

表现为容器内部服务正常，但宿主机无法访问容器 IP或映射端口。建议写入：

```bash
sudo tee /etc/sysctl.d/99-seedemu-scale.conf >/dev/null <<'EOF'
net.ipv4.neigh.default.gc_thresh1 = 4096
net.ipv4.neigh.default.gc_thresh2 = 8192
net.ipv4.neigh.default.gc_thresh3 = 16384
net.ipv6.neigh.default.gc_thresh1 = 4096
net.ipv6.neigh.default.gc_thresh2 = 8192
net.ipv6.neigh.default.gc_thresh3 = 16384
EOF

sudo sysctl --system
```

若已经产生失败的邻居项，可执行：

```bash
sudo ip neigh flush nud failed
sudo ip neigh flush nud incomplete
```

## 第一步：检测可达节点对

赋予脚本执行权限：

```bash
chmod +x scripts/find_pingable_pairs.sh scripts/traffic_stress.sh
```

传入需要找到的可达节点对数量，例如查找 32 对：

```bash
./scripts/find_pingable_pairs.sh 32
```

也可以使用具名参数：

```bash
./scripts/find_pingable_pairs.sh --count 32
```

脚本首先按主 IP 所属的 Docker 网络分组，每个网段只选一个代表节点，优先检测不同网段代表之间的连通性。在这一阶段，例如 `a`、`b` 同网段而 `c`、`d` 同网段，`a c` 成功后不会继续检测 `b c`、`a d` 或 `b d`。只有代表节点阶段找到的数量少于请求数量时，才进入补充阶段，使用各网段的其他节点组合继续查找。

`a b` 检测后不会再检测 `b a`；每个目标只 ping 主 IP。同一网段的节点对直接忽略。可达节点对写入：

```text
scripts/pingable_pairs.txt
```

文件格式：

```text
source_container target_container
```

查看进度结果和数量：

```bash
tail -f scripts/pingable_pairs.txt
wc -l scripts/pingable_pairs.txt
```

传入 `0` 会查找所有符合规则的可达节点对。1000 个节点最坏情况下仍可能检查大量组合。可通过 `--batch-size` 调整每次批量探测的目标数：

```bash
./scripts/find_pingable_pairs.sh --batch-size 512
```

## 第二步：从已验证节点对发流量

`traffic_stress.sh` 默认读取 `scripts/pingable_pairs.txt`。文件不存在、为空或没有可用的运行中节点对时，脚本会停止并提示先执行连通性检测。

单流 ICMP：

```bash
./scripts/traffic_stress.sh run \
  --protocol icmp \
  --concurrency 1 \
  --duration 10 \
  --interval-ms 1000
```

ICMP 每条流只启动一个持续运行的 `ping` 进程，`--interval-ms` 对应 `ping -i` 的发送间隔，`--duration` 对应 `ping -w` 的总运行时间。脚本使用实际 `ping` 进程 PID，因此 `./scripts/traffic_stress.sh stop` 仍可提前终止。

混合并发流量：

```bash
./scripts/traffic_stress.sh run \
  --protocol mixed \
  --concurrency 32 \
  --duration 300 \
  --interval-ms 50 \
  --payload-bytes 1024
```

脚本优先使用同一个源节点对应的已验证记录；数量不足时再使用文件中的其他节点对。请求的并发数超过当前可用记录数时，按实际可用数量运行。

指定节点对时，该方向必须存在于 `pingable_pairs.txt`：

```bash
./scripts/traffic_stress.sh run \
  --source <source_container> \
  --target <target_container> \
  --protocol icmp \
  --concurrency 1 \
  --duration 10
```

使用其他检测结果文件：

```bash
./scripts/traffic_stress.sh run \
  --pairs-file /path/to/pingable_pairs.txt \
  --protocol udp \
  --concurrency 32 \
  --duration 300
```

查看和停止流量：

```bash
./scripts/traffic_stress.sh status
./scripts/traffic_stress.sh stop
```

TCP、UDP、mixed 流量以及页面侧 Filter、动画、录制和回放的检查方法，请继续参考 500 节点示例文档，不在这里重复。
