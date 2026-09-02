#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
ARTIFACT_DIR="${ARTIFACT_DIR:-ci-artifacts/docker-lifecycle}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-seed-visualization-ci}"

mkdir -p "${ARTIFACT_DIR}/logs"

compose() {
  docker compose -p "${PROJECT_NAME}" -f "${COMPOSE_FILE}" "$@"
}

retry_curl() {
  local name="$1"
  local url="$2"
  local expected="${3:-}"
  local attempts="${4:-30}"
  local delay="${5:-2}"

  echo "[ci] probe ${name}: ${url}"
  for attempt in $(seq 1 "${attempts}"); do
    if body="$(curl --noproxy "*" --fail --silent --show-error --max-time 8 "${url}" 2>"${ARTIFACT_DIR}/logs/${name}.stderr")"; then
      printf '%s\n' "${body}" > "${ARTIFACT_DIR}/logs/${name}.body"
      if [[ -z "${expected}" || "${body}" == *"${expected}"* ]]; then
        echo "[ci] probe ${name} passed on attempt ${attempt}"
        return 0
      fi
      echo "[ci] probe ${name} response did not contain expected text: ${expected}"
    else
      cat "${ARTIFACT_DIR}/logs/${name}.stderr" || true
    fi

    if [[ "${attempt}" != "${attempts}" ]]; then
      sleep "${delay}"
    fi
  done

  echo "[ci] probe ${name} failed after ${attempts} attempts"
  return 1
}

cleanup() {
  set +e
  compose ps > "${ARTIFACT_DIR}/logs/compose-ps.txt" 2>&1
  compose logs --no-color > "${ARTIFACT_DIR}/logs/compose.log" 2>&1
  compose down --remove-orphans > "${ARTIFACT_DIR}/logs/compose-down.log" 2>&1
}
trap cleanup EXIT

echo "[ci] starting application lifecycle"
compose up -d seedemu_emulator_service seedemu_satellite_emulator_service seedemu_internet_map seedemu_internet_map_globe seedemu_satellite_emulator

retry_curl "emulator-service-env" "http://127.0.0.1:7071/api/v1/env.js" "window.__ENV__"
retry_curl "satellite-service-orbits" "http://127.0.0.1:9091/api/v1/satellite/planned-shell-orbit" "\"ok\":true"
retry_curl "satellite-service-gateways" "http://127.0.0.1:9091/api/v1/satellite/starlink-gateways" "\"ok\":true"
retry_curl "internet-map-frontend" "http://127.0.0.1:8080/" "<!doctype html"
retry_curl "internet-map-globe-frontend" "http://127.0.0.1:8090/" "<!doctype html"
retry_curl "satellite-frontend" "http://127.0.0.1:9090/" "<!doctype html"
retry_curl "satellite-nginx-api-proxy" "http://127.0.0.1:9090/api/v1/satellite/planned-shell-orbit" "\"ok\":true"
retry_curl "satellite-nginx-emulator-proxy" "http://127.0.0.1:9090/emulator/api/v1/env.js" "window.__ENV__"

echo "[ci] docker lifecycle probes passed"
