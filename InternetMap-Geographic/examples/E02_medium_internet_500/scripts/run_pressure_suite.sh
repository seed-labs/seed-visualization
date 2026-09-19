#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRAFFIC="$SCRIPT_DIR/traffic_stress.sh"
STAGE_DURATION="${STAGE_DURATION:-180}"
REST_SECONDS="${REST_SECONDS:-30}"
SOURCE_ARGS=()
[[ -n "${SOURCE_CONTAINER:-}" ]] && SOURCE_ARGS+=(--source "$SOURCE_CONTAINER")

cleanup() { bash "$TRAFFIC" stop >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

run_stage() {
  local name="$1" protocol="$2" concurrency="$3" interval="$4" payload="$5"
  echo "[$(date -Is)] Stage: $name"
  bash "$TRAFFIC" run --protocol "$protocol" --concurrency "$concurrency" \
    --duration "$STAGE_DURATION" --interval-ms "$interval" --payload-bytes "$payload" \
    "${SOURCE_ARGS[@]}"
  sleep "$STAGE_DURATION"
  cleanup
  echo "[$(date -Is)] Rest: ${REST_SECONDS}s"
  sleep "$REST_SECONDS"
}

run_stage 'ICMP baseline' icmp 1 1000 64
run_stage 'ICMP packet-rate ramp' icmp 32 20 64
run_stage 'TCP concurrent new flows' tcp 64 25 4096
run_stage 'UDP packet-rate ramp' udp 64 10 1400
run_stage 'Mixed ICMP/TCP/UDP' mixed 96 20 2048

echo "[$(date -Is)] Pressure suite completed."
