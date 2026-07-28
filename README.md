## Project layout

- `emulator-service/`: shared API backend for emulator container, network, console, sniffer, packet, and plugin APIs.
- `internet-map/`: Internet Map frontend. Its container serves the frontend and proxies `/api/v1` to `emulator-service`.
- `satellite-emulator/`: Satellite Emulator frontend and Nginx proxy.
- `satellite-emulator-service/`: satellite-specific API and WebSocket service for link updates and network node metadata.
- `traffic-observer-service/`: privileged eBPF + Go collector service for packet metadata observation.
- `shared/`: shared libraries used by multiple services.

## Docker Compose

Run all services from this repository root:

```sh
docker compose up --build
```

Default ports:

- Internet Map: `http://localhost:8080`
- Shared API backend: `http://localhost:8081/api/v1`
- Satellite Emulator: `http://localhost:9090`
- Satellite Emulator Service: `http://localhost:9091/api/v1`
- Traffic Observer Service: `http://localhost:19092`
