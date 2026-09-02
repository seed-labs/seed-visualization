FROM golang:1.22-bookworm AS builder
ARG GOPROXY=https://goproxy.cn,direct
ENV GOPROXY=${GOPROXY}

WORKDIR /src/traffic-observer-service
COPY traffic-observer-service/go.mod traffic-observer-service/go.sum ./
COPY shared/go/docker-api ../shared/go/docker-api
RUN go mod download
COPY traffic-observer-service/cmd ./cmd
COPY traffic-observer-service/internal ./internal
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/traffic-collector ./cmd/collector

FROM debian:bookworm-slim

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
COPY traffic-observer-service/bpf /opt/traffic-observer-service/bpf
COPY traffic-observer-service/entrypoint.sh /usr/local/bin/traffic-observer-entrypoint

RUN chmod +x /usr/local/bin/traffic-observer-entrypoint

ENV EBPF_OBJECT=/tmp/packet_trace.bpf.o
ENV TRAFFIC_INTERFACES=
ENV TRAFFIC_ONLY_SEED_CONTAINERS=true
ENV TRAFFIC_DISCOVERY_CONCURRENCY=32
ENV TRAFFIC_FILTER=
ENV TRAFFIC_CONTROL_ADDR=:19092
ENV EMULATOR_SERVICE_TRAFFIC_URL=
ENV TRAFFIC_PCAP_ENABLED=false
ENV TRAFFIC_PCAP_OUTPUT_DIR=/data/pcap
ENV TRAFFIC_LOG_TIMEZONE=Asia/Shanghai

ENTRYPOINT ["/usr/local/bin/traffic-observer-entrypoint"]
