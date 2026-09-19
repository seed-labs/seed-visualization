#!/usr/bin/env bash
set -euo pipefail

META_PREFIX='org.seedsecuritylabs.seedemu.meta.'
META_NAME="${META_PREFIX}nodename"
META_ROLE="${META_PREFIX}role"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="$SCRIPT_DIR/pingable_pairs.txt"
PROBE_TIMEOUT=1
BATCH_SIZE=1024
MAX_PAIRS=0
MAX_CHECKS=0

usage() {
  cat <<'EOF'
Usage:
  ./scripts/find_pingable_pairs.sh PAIR_COUNT [options]
  ./scripts/find_pingable_pairs.sh --count PAIR_COUNT [options]

Options:
  --output FILE          Result file (default: scripts/pingable_pairs.txt)
  --timeout SEC          Timeout for each ping (default: 1)
  --batch-size N         Target nodes per docker exec (default: 1024)
  --count N              Required reachable-pair count; 0 means all available
  --max-pairs N          Alias for --count
  --max-checks N         Stop after checking N candidate pairs; 0 means unlimited
  -h, --help             Show this help

Output format:
  source_container target_container

Each unordered pair is tested once. If "a b" is emitted, "b a" is not tested
or emitted. Only the target's primary IPv4 is tested. A pair is skipped when
the source is attached to the Docker network containing that target address.
The first pass tests one representative node per network. Only when that pass
finds fewer than PAIR_COUNT pairs are additional nodes from those networks used.
EOF
}

die() { echo "ERROR: $*" >&2; exit 1; }
is_uint() { [[ "$1" =~ ^[0-9]+$ ]]; }

list_traffic_nodes() {
  docker ps --filter "label=${META_NAME}" \
    --format "{{.Names}}|{{.Label \"${META_ROLE}\"}}" \
    | awk -F'|' '$2 == "Router" || $2 == "BorderRouter" || $2 == "Route Server" {print $1}' \
    | sort
}

load_endpoint_cache() {
  local node line name field network ip
  local -a inspect_args=()
  for node in "${NODES[@]}"; do inspect_args+=("$node"); done

  while IFS= read -r line; do
    IFS='|' read -ra fields <<<"$line"
    name="${fields[0]#/}"
    [[ -n "$name" ]] || continue
    ENDPOINTS["$name"]=""
    for field in "${fields[@]:1}"; do
      network="${field%%=*}"
      ip="${field#*=}"
      [[ -n "$network" && -n "$ip" && "$field" == *=* ]] || continue
      ENDPOINTS["$name"]+="${network}=${ip}"$'\n'
    done
  done < <(docker inspect --format '{{.Name}}{{range $name, $net := .NetworkSettings.Networks}}{{if $net.IPAddress}}|{{$name}}={{$net.IPAddress}}{{end}}{{end}}' "${inspect_args[@]}")
}

probe_batch() {
  local source="$1" result_file="$2"
  shift 2
  (($# > 0)) || { : >"$result_file"; return; }

  docker exec "$source" sh -c '
    timeout="$1"
    shift
    for record do
      target=${record%%|*}
      ip=${record#*|}
      (
        if ping -q -c 1 -W "$timeout" "$ip" >/dev/null 2>&1; then
          printf "%s|%s\n" "$target" "$ip"
        fi
      ) &
    done
    wait
  ' sh "$PROBE_TIMEOUT" "$@" >"$result_file"
}

ACTION="${1:-}"
if [[ "$ACTION" == "-h" || "$ACTION" == "--help" ]]; then usage; exit 0; fi
if [[ "$ACTION" =~ ^[0-9]+$ ]]; then
  MAX_PAIRS="$ACTION"
  shift
fi
while (($#)); do
  case "$1" in
    --output) OUTPUT_FILE="$2"; shift 2;;
    --timeout) PROBE_TIMEOUT="$2"; shift 2;;
    --batch-size) BATCH_SIZE="$2"; shift 2;;
    --count|--max-pairs) MAX_PAIRS="$2"; shift 2;;
    --max-checks) MAX_CHECKS="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) die "Unknown argument: $1";;
  esac
done

for value in "$PROBE_TIMEOUT" "$BATCH_SIZE" "$MAX_PAIRS" "$MAX_CHECKS"; do
  is_uint "$value" || die "Numeric options must be non-negative integers."
done
((PROBE_TIMEOUT > 0 && BATCH_SIZE > 0)) \
  || die "Timeout and batch size must be greater than zero."

mapfile -t NODES < <(list_traffic_nodes)
((${#NODES[@]} >= 2)) || die "At least two running SEED router/route-server containers are required."

declare -A ENDPOINTS=()
declare -A PRIMARY_NETWORK=()
declare -A PRIMARY_IP=()
echo "Caching network information for ${#NODES[@]} nodes..." >&2
load_endpoint_cache

REPRESENTATIVES=()
declare -A NETWORK_REPRESENTATIVE=()
for node in "${NODES[@]}"; do
  first_endpoint="$(awk 'NF {print; exit}' <<<"${ENDPOINTS[$node]:-}")"
  [[ -n "$first_endpoint" ]] || continue
  PRIMARY_NETWORK["$node"]="${first_endpoint%%=*}"
  PRIMARY_IP["$node"]="${first_endpoint#*=}"
  network="${PRIMARY_NETWORK[$node]}"
  if [[ -z "${NETWORK_REPRESENTATIVE[$network]:-}" ]]; then
    NETWORK_REPRESENTATIVE["$network"]="$node"
    REPRESENTATIVES+=("$node")
  fi
done
((${#REPRESENTATIVES[@]} >= 2)) || die "At least two primary Docker networks are required."

output_dir="$(dirname "$OUTPUT_FILE")"
mkdir -p "$output_dir"
: >"$OUTPUT_FILE"
result_file="$(mktemp "${TMPDIR:-/tmp}/seedemu-ping-pairs.XXXXXX")"
trap 'rm -f "$result_file"' EXIT INT TERM

checked=0
found=0
declare -A TESTED_NODE_PAIRS=()

unordered_key() {
  if [[ "$1" < "$2" ]]; then printf '%s|%s\n' "$1" "$2"; else printf '%s|%s\n' "$2" "$1"; fi
}

scan_phase() {
  local phase="$1" array_name="$2"
  local -n phase_nodes="$array_name"
  local source target source_network target_network node_key ip
  local batch_start batch_end pair_checks i j
  local -a records

  echo "Starting $phase pass with ${#phase_nodes[@]} nodes..." >&2
  for ((i=0; i<${#phase_nodes[@]}-1; i++)); do
    source="${phase_nodes[i]}"
    source_network="${PRIMARY_NETWORK[$source]:-}"
    [[ -n "$source_network" ]] || continue
    batch_start=$((i + 1))
    while ((batch_start < ${#phase_nodes[@]})); do
      if ((MAX_CHECKS > 0 && checked >= MAX_CHECKS)); then return 2; fi
      batch_end=$((batch_start + BATCH_SIZE))
      ((batch_end <= ${#phase_nodes[@]})) || batch_end=${#phase_nodes[@]}
      records=()
      pair_checks=0

      for ((j=batch_start; j<batch_end; j++)); do
        target="${phase_nodes[j]}"
        target_network="${PRIMARY_NETWORK[$target]:-}"
        ip="${PRIMARY_IP[$target]:-}"
        [[ -n "$target_network" && -n "$ip" && "$source_network" != "$target_network" ]] || continue
        node_key="$(unordered_key "$source" "$target")"
        [[ -z "${TESTED_NODE_PAIRS[$node_key]:-}" ]] || continue
        if ((MAX_CHECKS > 0 && checked + pair_checks >= MAX_CHECKS)); then break; fi
        TESTED_NODE_PAIRS["$node_key"]=1
        records+=("$target|$ip")
        pair_checks=$((pair_checks + 1))
      done

      probe_batch "$source" "$result_file" "${records[@]}"
      checked=$((checked + pair_checks))
      unset emitted_in_batch 2>/dev/null || true
      declare -A emitted_in_batch=()
      while IFS='|' read -r target ip; do
        [[ -n "$target" && -z "${emitted_in_batch[$target]:-}" ]] || continue
        emitted_in_batch["$target"]=1
        printf '%s %s\n' "$source" "$target" >>"$OUTPUT_FILE"
        found=$((found + 1))
        if ((MAX_PAIRS > 0 && found >= MAX_PAIRS)); then return 1; fi
      done <"$result_file"

      if ((MAX_PAIRS > 0)); then
        printf '\rChecked %d candidate pairs; found %d/%d pingable pairs...' "$checked" "$found" "$MAX_PAIRS" >&2
      else
        printf '\rChecked %d candidate pairs; found %d pingable pairs...' "$checked" "$found" >&2
      fi
      batch_start=$batch_end
    done
  done
  return 0
}

set +e
scan_phase representative REPRESENTATIVES
phase_status=$?
set -e
if ((phase_status == 0 && (MAX_PAIRS == 0 || found < MAX_PAIRS))); then
  set +e
  scan_phase fallback NODES
  phase_status=$?
  set -e
fi

if ((phase_status == 1)); then
  printf '\nReached requested pair count: %d.\n' "$MAX_PAIRS" >&2
elif ((phase_status == 2)); then
  printf '\nReached the candidate check limit: %d.\n' "$MAX_CHECKS" >&2
fi

printf '\nSaved %d pingable pairs to %s\n' "$found" "$OUTPUT_FILE" >&2
