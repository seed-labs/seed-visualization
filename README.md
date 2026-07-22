## Project layout

- `emulator-service/`: shared API backend for emulator container, network, console, sniffer, packet, and plugin APIs.
- `internet-map/`: Internet Map frontend. Its container serves the frontend and proxies `/api/v1` to `emulator-service`.
- `satellite-emulator/`: satellite emulator frontend and its satellite-specific backend. Its container proxies `/internet-map/api/v1` to `emulator-service`.
- `docker/`: Docker build and Nginx runtime files for the frontend containers.

## Docker Compose

Run all services from this repository root:

```sh
docker compose up --build
```

Default ports:

- Internet Map: `http://localhost:8080`
- Shared API backend: `http://localhost:8081/api/v1`
- Satellite Emulator: `http://localhost:9090`
