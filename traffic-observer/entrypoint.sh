#!/usr/bin/env sh
set -eu

BPF_DIR=/opt/traffic-observer/bpf
OBJECT_PATH="${EBPF_OBJECT:-/tmp/packet_trace.bpf.o}"

clang \
  -O2 \
  -g \
  -target bpf \
  -D__TARGET_ARCH_x86 \
  -I"${BPF_DIR}" \
  -I/usr/include/x86_64-linux-gnu \
  -c "${BPF_DIR}/packet_trace.bpf.c" \
  -o "${OBJECT_PATH}"

exec /usr/local/bin/traffic-collector
