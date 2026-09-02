# Deployment and environment variables

This document describes how to start `internet-map-globe` with Docker Compose, how to run it locally for development, and which environment variables matter most.

## Docker Compose service

In the repository-level `docker-compose.yml`, the service key for `internet-map-globe` is:

```text
seedemu_internet_map_globe
```

Default configuration:

```yaml
seedemu_internet_map_globe:
  container_name: seedemu_internet_map_globe
  image: handsonsecurity/seedemu-internet-map-globe:3.0
  build:
    context: internet-map-globe
    dockerfile: Dockerfile
  depends_on:
    - seedemu_emulator_service
  ports:
    - "8090:80"
```

## Start commands

### Topology viewing only

```bash
docker compose up --build seedemu_emulator_service seedemu_internet_map_globe
```

### Topology viewing with live packet capture

```bash
docker compose up --build seedemu_emulator_service seedemu_internet_map_globe seedmu_traffic_observer_service
```

### Full visualization stack

```bash
docker compose up --build
```

## URLs

| Page | URL |
| --- | --- |
| Live 3D | `http://localhost:8090/pro/map/3d` |
| Live 2D | `http://localhost:8090/pro/map/2d` |
| Upload 3D | `http://localhost:8090/pro/upload/3d` |
| Upload 2D | `http://localhost:8090/pro/upload/2d` |
| Console | `http://localhost:8090/pro/console` |

## Local development

```bash
cd internet-map-globe/frontend
pnpm install
pnpm dev
```

The default development port comes from `frontend/env/.env.development`:

```text
VITE_FRONTEND_PORT=5174
VITE_FRONTEND_URL_PREFIX=/dev
```

Open:

```text
http://localhost:5174/dev/map/3d
```

## Key environment variables

| Variable | Environment | Description |
| --- | --- | --- |
| `VITE_FRONTEND_URL_PREFIX` | Development / production | Frontend route prefix. Production usually uses `/pro`; development usually uses `/dev`. |
| `VITE_SERVER_EMULATOR_URL_PREFIX` | Development / production | API prefix for `emulator-service`. |
| `VITE_PROXY_EMULATOR_ADDRESS` | Development | Vite proxy target for `emulator-service`. |
| `VITE_TRAFFIC_OBSERVER_URL_PREFIX` | Development / production | Frontend proxy prefix for `traffic-observer-service`. |
| `VITE_TRAFFIC_OBSERVER_ADDRESS` | Development | Vite proxy target for `traffic-observer-service`. |
| `VITE_SATELLITE_TILES_URL` | Development / production | Cesium imagery tile URL. |

## Nginx

The production image serves static assets and proxies API traffic through `internet-map-globe/nginx.conf`.

Common proxy relationships:

- `/emulator/api/v1` -> `seedemu_emulator_service`
- `/traffic-observer` -> `traffic-observer-service`

When deploying to a remote server, make sure the browser can reach the required HTTP and WebSocket endpoints.

## Security recommendations

- Console access may expose container terminals. Do not expose it directly to the public internet.
- `traffic-observer-service` requires elevated privileges to load eBPF programs and should only run in trusted lab environments.
- If you only need offline topology viewing, you do not need to start `traffic-observer-service`.
