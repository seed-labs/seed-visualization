module seed-visualization/traffic-observer

go 1.22

require (
	github.com/cilium/ebpf v0.17.3
	github.com/gorilla/websocket v1.5.3
	golang.org/x/sys v0.30.0
	seed-visualization/shared/go/docker-api v0.0.0
)

replace seed-visualization/shared/go/docker-api => ../shared/go/docker-api
