FROM golang:1.22-bookworm AS builder
ENV GOPROXY=https://goproxy.cn,direct
ENV http_proxy=http://10.1.9.253:7890
ENV https_proxy=http://10.1.9.253:7890

WORKDIR /src/traffic-observer
COPY traffic-observer/go.mod ./
COPY shared/go/docker-api ../shared/go/docker-api
COPY traffic-observer/cmd ./cmd
COPY traffic-observer/internal ./internal
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/traffic-collector ./cmd/collector

FROM ubuntu:22.04

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      clang \
      iproute2 \
      libbpf-dev \
      linux-libc-dev \
      llvm \
      util-linux \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /out/traffic-collector /usr/local/bin/traffic-collector
COPY traffic-observer/bpf /opt/traffic-observer/bpf
COPY traffic-observer/entrypoint.sh /usr/local/bin/traffic-observer-entrypoint

RUN chmod +x /usr/local/bin/traffic-observer-entrypoint

ENV EBPF_OBJECT=/tmp/packet_trace.bpf.o
ENV TRAFFIC_INTERFACES=
ENV TRAFFIC_FALLBACK_INTERFACES=docker0
ENV TRAFFIC_ONLY_SEED_CONTAINERS=true
ENV TRAFFIC_DISCOVERY_CONCURRENCY=32
ENV TRAFFIC_FILTER=
ENV TRAFFIC_CONTROL_ADDR=:19092
ENV EMULATOR_SERVICE_TRAFFIC_URL=

ENTRYPOINT ["/usr/local/bin/traffic-observer-entrypoint"]
