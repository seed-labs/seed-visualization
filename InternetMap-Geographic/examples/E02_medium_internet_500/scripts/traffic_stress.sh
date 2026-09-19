#!/usr/bin/env bash
set -euo pipefail

META_ROLE='org.seedsecuritylabs.seedemu.meta.role'
RUN_ID="seedemu-traffic-stress"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_FILE="$SCRIPT_DIR/.traffic_stress_state"
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
MAX_FLOWS=0

usage() {
  cat <<'EOF'
Usage:
  ./scripts/traffic_stress.sh run [options]
  ./scripts/traffic_stress.sh stop [--source CONTAINER] [--target CONTAINER]
  ./scripts/traffic_stress.sh status

Run options:
  --protocol icmp|tcp|udp|mixed  Traffic protocol (default: mixed)
  --concurrency N               Number of distinct cross-network Host pairs (default: 8)
  --duration SEC                Test duration (default: 60)
  --interval-ms MS              Delay between sends per worker (default: 100)
  --payload-bytes N             TCP/UDP payload size (default: 1024)
  --source CONTAINER            Source Host; auto-selected when omitted
  --target CONTAINER            Host on another network; auto-selected when omitted
  --target-ip ADDRESS           Reachable target address; auto-detected when omitted

Examples:
  ./scripts/traffic_stress.sh run --protocol icmp --concurrency 16 --duration 300 --interval-ms 20
  ./scripts/traffic_stress.sh run --protocol tcp --concurrency 64 --duration 600
  ./scripts/traffic_stress.sh run --protocol mixed --concurrency 96 --duration 3600

Only containers labelled org.seedsecuritylabs.seedemu.meta.role=Host are accepted.
Source and target must be attached to
different Docker networks.
EOF
}

die() { echo "ERROR: $*" >&2; exit 1; }
is_uint() { [[ "$1" =~ ^[0-9]+$ ]]; }

list_host_containers() {
  docker ps \
    --filter "label=${META_ROLE}=Host" \
    --format '{{.Names}}' | sort
}

container_networks() {
  docker inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$1" | awk 'NF'
}

is_host() {
  [[ "$(docker inspect --format "{{index .Config.Labels \"${META_ROLE}\"}}" "$1" 2>/dev/null)" == "Host" ]]
}

shares_network() {
  local source="$1" target="$2" network
  while IFS= read -r network; do
    container_networks "$target" | grep -Fxq -- "$network" && return 0
  done < <(container_networks "$source")
  return 1
}

network_lists_overlap() {
  local left="$1" right="$2" network
  while IFS= read -r network; do
    [[ -n "$network" ]] && grep -Fxq -- "$network" <<<"$right" && return 0
  done <<<"$left"
  return 1
}

select_endpoints() {
  local candidate candidate_ip first second i j requested_concurrency
  mapfile -t containers < <(list_host_containers)
  ((${#containers[@]} >= 2)) || die "At least two running Host containers are required."
  SOURCE_CONTAINER="${SOURCE_CONTAINER:-${containers[0]}}"
  docker inspect "$SOURCE_CONTAINER" >/dev/null 2>&1 || die "Source container not found: $SOURCE_CONTAINER"
  is_host "$SOURCE_CONTAINER" || die "Source must have ${META_ROLE}=Host: $SOURCE_CONTAINER"

  if [[ -n "$TARGET_CONTAINER" || -n "$TARGET_IP" ]]; then
    ((CONCURRENCY == 1)) || die "--target and --target-ip can only be used with --concurrency 1."
    [[ -n "$TARGET_CONTAINER" ]] || die "--target is required when --target-ip is specified."
    docker inspect "$TARGET_CONTAINER" >/dev/null 2>&1 || die "Target container not found: $TARGET_CONTAINER"
    is_host "$TARGET_CONTAINER" || die "Target must have ${META_ROLE}=Host: $TARGET_CONTAINER"
    [[ "$SOURCE_CONTAINER" != "$TARGET_CONTAINER" ]] || die "Source and target must differ."
    shares_network "$SOURCE_CONTAINER" "$TARGET_CONTAINER" && die "Source and target must belong to different Docker networks."
    candidate_ip="${TARGET_IP:-$(container_ip "$TARGET_CONTAINER")}"
    [[ -n "$candidate_ip" ]] || die "Could not determine target IPv4 address; pass --target-ip."
    SOURCE_CONTAINERS=("$SOURCE_CONTAINER")
    TARGET_CONTAINERS=("$TARGET_CONTAINER")
    TARGET_IPS=("$candidate_ip")
    MAX_FLOWS=1
    echo "Maximum available flows for the explicitly selected Host pair: 1."
    return
  fi

  # Put the preferred source first. Generating i<j pairs then exhausts all
  # destinations for that source before moving to the next source, without
  # ever producing both A->B and B->A.
  local ordered=("$SOURCE_CONTAINER")
  for candidate in "${containers[@]}"; do
    [[ "$candidate" == "$SOURCE_CONTAINER" ]] || ordered+=("$candidate")
  done

  declare -A host_ips=()
  declare -A host_networks=()
  for candidate in "${ordered[@]}"; do
    candidate_ip="$(container_ip "$candidate")"
    [[ -n "$candidate_ip" ]] || die "Could not determine IPv4 address for Host: $candidate"
    host_ips["$candidate"]="$candidate_ip"
    host_networks["$candidate"]="$(container_networks "$candidate")"
  done

  for ((i=0; i<${#ordered[@]}; i++)); do
    first="${ordered[i]}"
    for ((j=i+1; j<${#ordered[@]}; j++)); do
      second="${ordered[j]}"
      network_lists_overlap "${host_networks[$first]}" "${host_networks[$second]}" && continue
      SOURCE_CONTAINERS+=("$first")
      TARGET_CONTAINERS+=("$second")
      TARGET_IPS+=("${host_ips[$second]}")
    done
  done
  MAX_FLOWS=${#SOURCE_CONTAINERS[@]}
  ((MAX_FLOWS > 0)) || die "No cross-network Host pair was found."
  requested_concurrency=$CONCURRENCY
  if ((CONCURRENCY > MAX_FLOWS)); then
    CONCURRENCY=$MAX_FLOWS
    echo "Requested ${requested_concurrency} flows; maximum available is ${MAX_FLOWS}. Running ${MAX_FLOWS} flows."
  else
    echo "Maximum available cross-network Host flows: ${MAX_FLOWS}."
  fi
  SOURCE_CONTAINERS=("${SOURCE_CONTAINERS[@]:0:CONCURRENCY}")
  TARGET_CONTAINERS=("${TARGET_CONTAINERS[@]:0:CONCURRENCY}")
  TARGET_IPS=("${TARGET_IPS[@]:0:CONCURRENCY}")
}

container_ip() {
  docker inspect --format '{{range .NetworkSettings.Networks}}{{println .IPAddress}}{{end}}' "$1" | awk 'NF {print; exit}'
}

stop_processes() {
  local container
  declare -A stopped=()
  for container in ${SOURCE_CONTAINER:-} ${SOURCE_CONTAINERS[@]:-} ${TARGET_CONTAINERS[@]:-} ${TARGET_CONTAINER:-}; do
    [[ -n "$container" ]] || continue
    [[ -z "${stopped[$container]:-}" ]] || continue
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
      rm -f /tmp/${RUN_ID}.tcp.log /tmp/${RUN_ID}.udp.log
      nc -l -k -p ${TCP_PORT} >>/tmp/${RUN_ID}.tcp.log 2>&1 & echo \$! >>/tmp/${RUN_ID}.pids
      nc -u -l -k -p ${UDP_PORT} >>/tmp/${RUN_ID}.udp.log 2>&1 & echo \$! >>/tmp/${RUN_ID}.pids
    "
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
  start_receivers

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
if [[ "$ACTION" == "-h" || "$ACTION" == "--help" ]]; then
  usage
  exit 0
fi
shift
while (($#)); do
  case "$1" in
    --protocol) PROTOCOL="$2"; shift 2;;
    --concurrency) CONCURRENCY="$2"; shift 2;;
    --duration) DURATION="$2"; shift 2;;
    --interval-ms) INTERVAL_MS="$2"; shift 2;;
    --payload-bytes) PAYLOAD_BYTES="$2"; shift 2;;
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
    for value in "$CONCURRENCY" "$DURATION" "$INTERVAL_MS" "$PAYLOAD_BYTES"; do is_uint "$value" || die "Numeric options must be non-negative integers."; done
    ((CONCURRENCY > 0 && DURATION > 0 && PAYLOAD_BYTES > 0)) || die "Concurrency, duration and payload must be greater than zero."
    run_traffic
    ;;
  stop)
    if [[ -z "$SOURCE_CONTAINER" && -z "$TARGET_CONTAINER" ]]; then
      if [[ -f "$STATE_FILE" ]]; then
        mapfile -t saved_containers <"$STATE_FILE"
        SOURCE_CONTAINER=""
        SOURCE_CONTAINERS=("${saved_containers[@]}")
        TARGET_CONTAINERS=()
        stop_processes
      else
        while IFS= read -r container; do SOURCE_CONTAINER="$container"; TARGET_CONTAINER=""; stop_processes; done < <(list_host_containers)
      fi
    else
      stop_processes
    fi
    rm -f "$STATE_FILE"
    echo "Stopped traffic processes."
    ;;
  status)
    if [[ -f "$STATE_FILE" ]]; then
      mapfile -t status_containers <"$STATE_FILE"
    else
      mapfile -t status_containers < <(list_host_containers)
    fi
    for container in "${status_containers[@]}"; do
      count="$(docker exec "$container" sh -c "test -f /tmp/${RUN_ID}.pids && wc -l </tmp/${RUN_ID}.pids || echo 0" 2>/dev/null || echo 0)"
      [[ "$count" == "0" ]] || echo "$container: $count recorded processes"
    done
    ;;
  *) usage; exit 1;;
esac
