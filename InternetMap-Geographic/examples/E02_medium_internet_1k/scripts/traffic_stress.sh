#!/usr/bin/env bash
set -euo pipefail

META_PREFIX='org.seedsecuritylabs.seedemu.meta.'
META_NAME="${META_PREFIX}nodename"
META_ROLE="${META_PREFIX}role"
RUN_ID="seedemu-traffic-stress-1k"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_FILE="$SCRIPT_DIR/.traffic_stress_state"
PAIRS_FILE="$SCRIPT_DIR/pingable_pairs.txt"
PROTOCOL="mixed"
CONCURRENCY=8
DURATION=60
INTERVAL_MS=100
PAYLOAD_BYTES=1024
TCP_PORT=19001
UDP_PORT=19002
SOURCE_CONTAINER=""
TARGET_CONTAINER=""
TARGET_IP=""
SOURCE_CONTAINERS=()
TARGET_CONTAINERS=()
TARGET_IPS=()

usage() {
  cat <<'EOF'
Usage:
  ./scripts/traffic_stress.sh run [options]
  ./scripts/traffic_stress.sh stop
  ./scripts/traffic_stress.sh status

Run options:
  --protocol icmp|tcp|udp|mixed  Traffic protocol (default: mixed)
  --concurrency N               Number of distinct reachable node pairs (default: 8)
  --duration SEC                Test duration (default: 60)
  --interval-ms MS              Delay between sends per worker (default: 100)
  --payload-bytes N             TCP/UDP payload size (default: 1024)
  --pairs-file FILE             Verified pairs file (default: scripts/pingable_pairs.txt)
  --source CONTAINER            Preferred source node
  --target CONTAINER            Explicit target; requires --concurrency 1
  --target-ip ADDRESS           Explicit target address; requires --target

The 1k topology has no Host nodes. Run find_pingable_pairs.sh first. Traffic
pairs are selected exclusively from its verified output; unverified router
pairs are never used.
EOF
}

die() { echo "ERROR: $*" >&2; exit 1; }
is_uint() { [[ "$1" =~ ^[0-9]+$ ]]; }

node_role() {
  docker inspect --format "{{index .Config.Labels \"${META_ROLE}\"}}" "$1" 2>/dev/null || true
}

is_traffic_node() {
  case "$(node_role "$1")" in
    Router|BorderRouter|"Route Server") return 0 ;;
    *) return 1 ;;
  esac
}

list_traffic_nodes() {
  docker ps --filter "label=${META_NAME}" \
    --format "{{.Names}}|{{.Label \"${META_ROLE}\"}}" \
    | awk -F'|' '$2 == "Router" || $2 == "BorderRouter" || $2 == "Route Server" {print $1}' \
    | sort
}

# Print network|IPv4 for every interface. Docker may report several addresses
# for transit routers, so selection must not assume that the first one routes.
container_endpoints() {
  docker inspect --format '{{range $name, $net := .NetworkSettings.Networks}}{{if $net.IPAddress}}{{println $name "|" $net.IPAddress}}{{end}}{{end}}' "$1" \
    | awk -F '[[:space:]]*\|[[:space:]]*' 'NF == 2 && $2 != "" {print $1 "|" $2}'
}

container_primary_ip() {
  container_endpoints "$1" | awk -F'|' 'NF == 2 {print $2; exit}'
}

pair_is_verified() {
  local source="$1" target="$2"
  awk -v source="$source" -v target="$target" \
    'NF >= 2 && $1 == source && $2 == target {found=1; exit} END {exit !found}' \
    "$PAIRS_FILE"
}

select_explicit_pair() {
  local selected_ip
  docker inspect "$SOURCE_CONTAINER" "$TARGET_CONTAINER" >/dev/null 2>&1 \
    || die "Source or target container was not found."
  is_traffic_node "$SOURCE_CONTAINER" || die "Unsupported source role: $(node_role "$SOURCE_CONTAINER")"
  is_traffic_node "$TARGET_CONTAINER" || die "Unsupported target role: $(node_role "$TARGET_CONTAINER")"
  [[ "$SOURCE_CONTAINER" != "$TARGET_CONTAINER" ]] || die "Source and target must differ."
  pair_is_verified "$SOURCE_CONTAINER" "$TARGET_CONTAINER" \
    || die "Pair is not present in $PAIRS_FILE: $SOURCE_CONTAINER $TARGET_CONTAINER"
  selected_ip="${TARGET_IP:-$(container_primary_ip "$TARGET_CONTAINER")}"
  [[ -n "$selected_ip" ]] || die "Could not determine the primary IPv4 address of $TARGET_CONTAINER."
  SOURCE_CONTAINERS=("$SOURCE_CONTAINER")
  TARGET_CONTAINERS=("$TARGET_CONTAINER")
  TARGET_IPS=("$selected_ip")
}

select_endpoints() {
  local source target target_ip requested pass line pair_key
  local -a pair_lines
  [[ -s "$PAIRS_FILE" ]] \
    || die "Verified pairs file is missing or empty: $PAIRS_FILE. Run $SCRIPT_DIR/find_pingable_pairs.sh first."
  mapfile -t pair_lines < <(awk 'NF >= 2 && $1 !~ /^#/ {print $1 " " $2}' "$PAIRS_FILE")
  ((${#pair_lines[@]} > 0)) || die "No valid pairs were found in $PAIRS_FILE."
  SOURCE_CONTAINER="${SOURCE_CONTAINER:-${pair_lines[0]%% *}}"

  if [[ -n "$TARGET_CONTAINER" || -n "$TARGET_IP" ]]; then
    ((CONCURRENCY == 1)) || die "--target and --target-ip can only be used with --concurrency 1."
    [[ -n "$TARGET_CONTAINER" ]] || die "--target is required when --target-ip is specified."
    select_explicit_pair
    echo "Selected the explicitly requested verified flow."
    return
  fi
  requested=$CONCURRENCY

  # Prefer verified pairs with the requested source, then fill remaining flow
  # slots from the rest of the verified file. The stored direction is kept.
  declare -A selected_pairs=()
  for pass in preferred remaining; do
    for line in "${pair_lines[@]}"; do
      source="${line%% *}"
      target="${line#* }"
      if [[ "$pass" == preferred && "$source" != "$SOURCE_CONTAINER" ]]; then continue; fi
      if [[ "$pass" == remaining && "$source" == "$SOURCE_CONTAINER" ]]; then continue; fi
      pair_key="$source|$target"
      [[ -z "${selected_pairs[$pair_key]:-}" ]] || continue
      docker inspect "$source" "$target" >/dev/null 2>&1 || continue
      target_ip="$(container_primary_ip "$target")"
      [[ -n "$target_ip" ]] || continue
      selected_pairs["$pair_key"]=1
      SOURCE_CONTAINERS+=("$source")
      TARGET_CONTAINERS+=("$target")
      TARGET_IPS+=("$target_ip")
      ((${#SOURCE_CONTAINERS[@]} < CONCURRENCY)) || break 2
    done
  done

  CONCURRENCY=${#SOURCE_CONTAINERS[@]}
  ((CONCURRENCY > 0)) || die "No running pair from $PAIRS_FILE is currently usable."
  if ((CONCURRENCY < requested)); then
    echo "Requested $requested flows, but only $CONCURRENCY verified running pairs were usable. Running $CONCURRENCY flows."
  else
    echo "Selected $CONCURRENCY flows from $PAIRS_FILE."
  fi
}

stop_processes() {
  local container
  declare -A stopped=()
  for container in ${SOURCE_CONTAINER:-} ${SOURCE_CONTAINERS[@]:-} ${TARGET_CONTAINERS[@]:-} ${TARGET_CONTAINER:-}; do
    [[ -n "$container" && -z "${stopped[$container]:-}" ]] || continue
    stopped["$container"]=1
    docker exec "$container" sh -c "if [ -f /tmp/${RUN_ID}.pids ]; then while IFS= read -r pid; do kill \"\$pid\" 2>/dev/null || true; done < /tmp/${RUN_ID}.pids; rm -f /tmp/${RUN_ID}.pids; fi" >/dev/null 2>&1 || true
  done
}

start_receivers() {
  local target
  declare -A started=()
  for target in "${TARGET_CONTAINERS[@]}"; do
    [[ -z "${started[$target]:-}" ]] || continue
    started["$target"]=1
    docker exec "$target" sh -c "
      command -v nc >/dev/null 2>&1 || exit 127
      rm -f /tmp/${RUN_ID}.tcp.log /tmp/${RUN_ID}.udp.log
      nc -l -k -p ${TCP_PORT} >>/tmp/${RUN_ID}.tcp.log 2>&1 & echo \$! >>/tmp/${RUN_ID}.pids
      nc -u -l -k -p ${UDP_PORT} >>/tmp/${RUN_ID}.udp.log 2>&1 & echo \$! >>/tmp/${RUN_ID}.pids
    " || die "Target $target does not provide a usable nc command."
  done
}

worker_command() {
  local protocol="$1" target_ip="$2" delay
  delay="$(awk -v ms="$INTERVAL_MS" 'BEGIN { printf "%.3f", ms / 1000 }')"
  case "$protocol" in
    icmp)
      printf 'exec ping -q -i %s -w %s %q' "$delay" "$DURATION" "$target_ip"
      ;;
    tcp)
      printf 'end=$(( $(date +%%s) + %s )); while [ "$(date +%%s)" -lt "$end" ]; do dd if=/dev/zero bs=%s count=1 2>/dev/null | nc -w 1 %q %s >/dev/null 2>&1 || true; sleep %s; done' "$DURATION" "$PAYLOAD_BYTES" "$target_ip" "$TCP_PORT" "$delay"
      ;;
    udp)
      printf 'end=$(( $(date +%%s) + %s )); while [ "$(date +%%s)" -lt "$end" ]; do dd if=/dev/zero bs=%s count=1 2>/dev/null | nc -u -q 0 -w 1 %q %s >/dev/null 2>&1 || true; sleep %s; done' "$DURATION" "$PAYLOAD_BYTES" "$target_ip" "$UDP_PORT" "$delay"
      ;;
  esac
}

run_traffic() {
  select_endpoints
  stop_processes
  if [[ "$PROTOCOL" != "icmp" ]]; then
    start_receivers
  fi

  local index protocol command source
  for ((index=0; index<CONCURRENCY; index++)); do
    if [[ "$PROTOCOL" == "mixed" ]]; then
      case $((index % 3)) in 0) protocol=icmp;; 1) protocol=tcp;; *) protocol=udp;; esac
    else
      protocol="$PROTOCOL"
    fi
    command="$(worker_command "$protocol" "${TARGET_IPS[index]}")"
    source="${SOURCE_CONTAINERS[index]}"
    docker exec "$source" sh -c "($command) >/tmp/${RUN_ID}.${protocol}.${index}.log 2>&1 & echo \$! >>/tmp/${RUN_ID}.pids"
  done

  echo "Started: protocol=$PROTOCOL flows=$CONCURRENCY duration=${DURATION}s interval=${INTERVAL_MS}ms payload=${PAYLOAD_BYTES}B"
  for ((index=0; index<CONCURRENCY; index++)); do
    echo "Flow $((index + 1)): ${SOURCE_CONTAINERS[index]} -> ${TARGET_CONTAINERS[index]} (${TARGET_IPS[index]})"
  done
  printf '%s\n' "${SOURCE_CONTAINERS[@]}" "${TARGET_CONTAINERS[@]}" | sort -u >"$STATE_FILE"
  echo "Stop early: $0 stop"
}

ACTION="${1:-}"
[[ -n "$ACTION" ]] || { usage; exit 1; }
if [[ "$ACTION" == "-h" || "$ACTION" == "--help" ]]; then usage; exit 0; fi
shift
while (($#)); do
  case "$1" in
    --protocol) PROTOCOL="$2"; shift 2;;
    --concurrency) CONCURRENCY="$2"; shift 2;;
    --duration) DURATION="$2"; shift 2;;
    --interval-ms) INTERVAL_MS="$2"; shift 2;;
    --payload-bytes) PAYLOAD_BYTES="$2"; shift 2;;
    --pairs-file) PAIRS_FILE="$2"; shift 2;;
    --source) SOURCE_CONTAINER="$2"; shift 2;;
    --target) TARGET_CONTAINER="$2"; shift 2;;
    --target-ip) TARGET_IP="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) die "Unknown argument: $1";;
  esac
done

case "$ACTION" in
  run)
    [[ "$PROTOCOL" =~ ^(icmp|tcp|udp|mixed)$ ]] || die "Invalid protocol: $PROTOCOL"
    for value in "$CONCURRENCY" "$DURATION" "$INTERVAL_MS" "$PAYLOAD_BYTES"; do
      is_uint "$value" || die "Numeric options must be non-negative integers."
    done
    ((CONCURRENCY > 0 && DURATION > 0 && PAYLOAD_BYTES > 0)) \
      || die "Concurrency, duration, and payload must be greater than zero."
    run_traffic
    ;;
  stop)
    if [[ -f "$STATE_FILE" ]]; then
      mapfile -t SOURCE_CONTAINERS <"$STATE_FILE"
    else
      mapfile -t SOURCE_CONTAINERS < <(list_traffic_nodes)
    fi
    TARGET_CONTAINERS=()
    SOURCE_CONTAINER=""
    TARGET_CONTAINER=""
    stop_processes
    rm -f "$STATE_FILE"
    echo "Stopped traffic processes."
    ;;
  status)
    if [[ -f "$STATE_FILE" ]]; then
      mapfile -t status_containers <"$STATE_FILE"
    else
      mapfile -t status_containers < <(list_traffic_nodes)
    fi
    for container in "${status_containers[@]}"; do
      count="$(docker exec "$container" sh -c "test -f /tmp/${RUN_ID}.pids && wc -l </tmp/${RUN_ID}.pids || echo 0" 2>/dev/null || echo 0)"
      [[ "$count" == "0" ]] || echo "$container: $count recorded processes"
    done
    ;;
  *) usage; exit 1;;
esac
