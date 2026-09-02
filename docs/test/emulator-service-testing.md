# emulator-service 测试覆盖文档

本文档描述 `emulator-service` 当前测试用例覆盖的模块和测试函数。

## 测试入口

- 单元测试：`npm run test:unit`
- 集成测试：`npm run test:integration`

## 单元测试覆盖图

```mermaid
%%{init: {"flowchart": {"useMaxWidth": true, "htmlLabels": true}} }%%
flowchart TB
  Unit["Unit tests<br/>tests/unit"]
  Api["api/v1/main.test.ts"]
  Env["config/env.test.ts"]
  Controller["utils/controller.test.ts"]
  DockerClient["utils/docker-client.test.ts"]
  Meta["utils/seedemu-meta.test.ts"]
  SubmitEvent["utils/submit-event.test.ts"]

  Unit --> Api
  Unit --> Env
  Unit --> Controller
  Unit --> DockerClient
  Unit --> Meta
  Unit --> SubmitEvent
```

| 测试文件 | 覆盖模块 | 测试函数 |
| --- | --- | --- |
| `tests/unit/api/v1/main.test.ts` | API v1 router | `returns seed containers and filters non-seed containers`<br/>`returns a sanitized server error when docker listContainers fails`<br/>`returns a structured response for unknown API routes`<br/>`returns parameter error when a container id has no unique match`<br/>`returns network metadata from docker networks`<br/>`returns docker-controlled network status for a matched container`<br/>`passes body params to network status changes`<br/>`returns details for a uniquely matched container id prefix`<br/>`rejects container operations when an id prefix is ambiguous`<br/>`lists BGP peers for a uniquely matched container`<br/>`passes requested BGP peer state changes to the controller`<br/>`stores and returns the active sniff filter`<br/>`returns parameter error for packet capture without node id or name`<br/>`starts packet capture by node name and returns the packet filter` |
| `tests/unit/config/env.test.ts` | Environment loader | `loads development env by default`<br/>`loads development env while running under Jest NODE_ENV=test`<br/>`loads production env when BACKEND_ENV is production`<br/>`keeps real environment variables over file values`<br/>`configures the checked-in development Docker endpoint` |
| `tests/unit/utils/controller.test.ts` | Controller service | `maps net_status output to a boolean`<br/>`parses BGP peer rows from bird output` |
| `tests/unit/utils/docker-client.test.ts` | Docker client configuration | `uses the local Docker daemon by default`<br/>`uses DOCKER_HOST and DOCKER_PORT for remote Docker daemons`<br/>`parses tcp Docker host URLs`<br/>`parses http and https Docker host URLs`<br/>`uses socket paths when configured` |
| `tests/unit/utils/seedemu-meta.test.ts` | SEED metadata parser | `parses container node metadata labels`<br/>`parses network metadata labels` |
| `tests/unit/utils/submit-event.test.ts` | SubmitEvent runtime interactions | `executes a command inside a node through the runtime client`<br/>`raises runtime execution failures to callers` |

## 集成测试覆盖图

```mermaid
%%{init: {"flowchart": {"useMaxWidth": true, "htmlLabels": true}} }%%
flowchart TB
  Integration["Integration tests<br/>tests/integration"]
  RemoteDocker["api/v1/remote-docker.test.ts"]
  DockerAPI["Remote Docker API"]
  PluginAPI["Plugin API"]
  Events["Host events"]
  Capture["Packet capture"]
  BGP["BGP operations"]

  Integration --> RemoteDocker
  RemoteDocker --> DockerAPI
  RemoteDocker --> PluginAPI
  RemoteDocker --> Events
  RemoteDocker --> Capture
  RemoteDocker --> BGP
```

| 测试文件 | 覆盖模块 | 测试函数 |
| --- | --- | --- |
| `tests/integration/api/v1/remote-docker.test.ts` | Remote Docker API | `returns runtime frontend environment`<br/>`requests containers from the configured remote Docker daemon`<br/>`requests networks from the configured remote Docker daemon`<br/>`requests a specific container from the configured remote Docker daemon`<br/>`returns an error when a requested container does not exist`<br/>`returns an error for network status when the container id is invalid`<br/>`does not change network status when the container id is invalid` |
| `tests/integration/api/v1/remote-docker.test.ts` | Plugin API | `returns configured plugin list`<br/>`rejects unknown plugin install requests after querying the remote containers`<br/>`accepts unknown plugin uninstall requests without touching container files` |
| `tests/integration/api/v1/remote-docker.test.ts` | Host event API | `broadcasts visualization changes for a real remote Docker container`<br/>`broadcasts host events through the API endpoint` |
| `tests/integration/api/v1/remote-docker.test.ts` | Sniffer / packet capture | `returns the current sniffer filter`<br/>`returns an error for packet capture when the target node does not exist` |
| `tests/integration/api/v1/remote-docker.test.ts` | BGP operations | `returns an error for BGP peer listing when the container id is invalid`<br/>`does not change BGP peer state when the container id is invalid` |

