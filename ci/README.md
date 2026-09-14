# Docker 生命周期检查

`probe-docker-compose.sh` 可以手动执行，也由 `.github/workflows/ci-docker-lifecycle.yaml` 调用。它启动 Compose 服务、检查 HTTP 响应、保存日志，最后关闭测试项目。它不运行单元测试或 Playwright E2E，也不验证真实抓包与蠕虫传播。

## 手动执行

在 Linux 测试主机的仓库根目录执行，需要 Bash、curl、Docker Engine 和 Docker Compose v2，并有访问 Docker daemon 的权限。抓包服务依赖 Linux 内核及特权容器；使用 WSL 时也需要满足这些条件。

```bash
# 先构建当前代码，避免使用已有的旧镜像。
docker compose build

# 构建成功后执行检查。
bash ci/probe-docker-compose.sh
```

成功时输出 `[ci] docker lifecycle probes passed`，退出码为 0；探针失败时返回非零退出码。

检查包括三个前端首页、仿真后端环境接口、卫星轨道和网关数据接口，以及 Geographic/Satellite 的 Nginx 后端代理。抓包服务作为依赖启动，但本脚本不检查其抓包功能。

## 清理与日志

无论探针成功还是失败，脚本退出时都会保存容器状态和日志，并执行 `docker compose down --remove-orphans`。默认项目名为 `seed-visualization-ci`，日志目录为 `ci-artifacts/docker-lifecycle/logs/`。

当前 Compose 使用固定容器名称和宿主机端口，因此更换项目名也不能与现有部署并行运行。请在空闲测试主机执行，确保 7071、8080、8090、9090、9091 和抓包控制端口 19092 可用。

支持通过环境变量设置 `COMPOSE_FILE`、`COMPOSE_PROJECT_NAME` 和 `ARTIFACT_DIR`。自定义 Compose 文件仍需提供脚本使用的服务名称和端口。

```bash
ARTIFACT_DIR=ci-artifacts/manual-check bash ci/probe-docker-compose.sh
```

也可以在 GitHub Actions 中选择 **CI Docker Lifecycle Probes**，通过 **Run workflow** 运行构建、探针和日志上传流程。
