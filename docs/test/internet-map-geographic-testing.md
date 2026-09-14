# InternetMap-Geographic 测试覆盖文档

测试位于 `InternetMap-Geographic/frontend`，对应 CI 为 `.github/workflows/ci-internet-map-geographic.yaml`。

## 运行方式

```bash
cd InternetMap-Geographic/frontend
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run test:unit
pnpm exec playwright install chromium
pnpm run test:e2e
```

E2E 自动启动本地开发服务器，使用 `http://127.0.0.1:5174` 和 `/dev` 路由前缀。Docker API、抓包过滤器接口和 WebSocket 使用 mock，无需启动仿真后端。测试仍会初始化 Cesium 页面。

## 单元测试

| 测试文件 | 覆盖范围 |
| --- | --- |
| `tests/unit/utils/tools.test.ts` | 路由展开、父路由查找、图片 URL、Compose 数据转换、缺失数据处理、路由器权重排序 |
| `tests/unit/view/map3dGraph.test.ts` | 无向边键、路由器类型识别、卫星连接路由器的 AS 高亮节点 |
| `tests/unit/view/packetFlowAnalyzer.test.ts` | ICMP 正向路径分析、排除应答包、重复实时数据包的路径去重 |

## E2E 测试

`tests/e2e/emulator-topology-pages.spec.ts` 分别检查 3D 和 2D 路由，共 4 个用例：

| 路由 | 覆盖范围 |
| --- | --- |
| `/dev/map/3d`、`/dev/map/2d` | 使用 mock Docker API 数据加载实时拓扑页面，显示对应标题及节点/链路统计 |
| `/dev/upload/3d`、`/dev/upload/2d` | 显示 Compose 文件上传入口和解析按钮 |

辅助数据位于 `tests/e2e/fixtures/map.ts`，后端 mock 位于 `tests/e2e/helpers/mapMock.ts`。抓包过滤器 mock 对应当前的 `/traffic-observer/filter` 接口。

Playwright 将 HTML 报告输出到 `playwright-report/`；CI 上传为 `internet-map-geographic-playwright-report`。失败时的测试产物位于 `test-results/`。

当前测试未覆盖真实后端通信、蠕虫传播及控制台任务栏交互。

### 大规模上传与真实渲染回归

在 `InternetMap-Geographic/frontend` 下运行：

```bash
pnpm exec playwright test large-upload-dock scene-interaction --workers=1
```

`large-upload-dock.spec.ts` 上传 `InternetMap-Geographic/examples/E01_large_internet_10k/docker-compose-10k-with-geo.yml`，等待首帧完成，再连续切换 Settings、Traffic Replay、Overview 两轮。测试使用真实 Cesium 和 Chromium 软件 WebGL，验证页签状态更新及切换期间没有调用拓扑重建。为避免外部瓦片服务影响结果，测试屏蔽卫星瓦片请求。完整人工压力步骤见该示例目录的 `README.md`。

HTML 报告附件包含自动点击耗时、点击事件到 DOM 更新及下一次动画帧回调的耗时和主线程长任务。自动点击耗时包含 Playwright 等待；动画帧回调也不等于屏幕实际显示时间。软件渲染结果用于回归对比，不能替代目标机器上使用 GPU 的交互实测。

`scene-interaction.spec.ts` 验证 3D/2D 高亮复用连线几何、类型隐藏/恢复不替换连线对象、相机交互期间保持连线显示，以及按需渲染下发包动画能够结束。静态连线按位置数量分批，保持原始曲线采样、分辨率和抗锯齿设置；`batchedPolylines.test.ts` 验证分批保留全部坐标和对象身份，以及替换拓扑时释放旧集合。

Settings 中的 IX、Network、Router、Host 使用组级 `show` 切换。完整拓扑只在上传新文件、实时数据或结构筛选变化时重建；类型开关不清空节点、连线或重新计算曲线。`large-upload-dock.spec.ts` 会在 10k 示例上验证隐藏 Host 只发生可见性更新，拓扑清空次数和 `renderGraph` 调用次数均不增加。
