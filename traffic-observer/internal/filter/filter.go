package filter

import (
	"encoding/binary"
	"fmt"
	"net"
	"strconv"
	"strings"
)

const (
	ProtoAny  = 0
	ProtoICMP = 1
	ProtoTCP  = 6
	ProtoUDP  = 17

	DirectionAny     = 0
	DirectionIngress = 1
	DirectionEgress  = 2
)

// Config must stay layout-compatible with struct filter_config in bpf/packet_trace.h.
type Config struct {
	Enabled       uint8
	IPProto       uint8
	Direction     uint8
	MatchSrcIP    uint8
	MatchDstIP    uint8
	MatchSrcPort  uint8
	MatchDstPort  uint8
	Reserved      uint8
	SrcIP         uint32
	DstIP         uint32
	SrcPort       uint16
	DstPort       uint16
}

func Parse(expr string) (Config, error) {
	expr = strings.TrimSpace(strings.ToLower(expr))
	if expr == "" {
		return Config{}, nil
	}

	cfg := Config{
		Enabled:   1,
		IPProto:   ProtoAny,
		Direction: DirectionAny,
	}
	if expr == "all" || expr == "any" {
		return cfg, nil
	}

	tokens := compact(strings.Fields(expr))

	for i := 0; i < len(tokens); {
		switch tokens[i] {
		case "tcp":
			cfg.IPProto = ProtoTCP
			i++
		case "udp":
			cfg.IPProto = ProtoUDP
			i++
		case "icmp":
			cfg.IPProto = ProtoICMP
			i++
		case "ingress":
			cfg.Direction = DirectionIngress
			i++
		case "egress":
			cfg.Direction = DirectionEgress
			i++
		case "host":
			if i+1 >= len(tokens) {
				return cfg, fmt.Errorf("host requires an IP address")
			}
			ip, err := parseIPv4(tokens[i+1])
			if err != nil {
				return cfg, err
			}
			cfg.MatchSrcIP = 1
			cfg.MatchDstIP = 1
			cfg.SrcIP = ip
			cfg.DstIP = ip
			i += 2
		case "port":
			if i+1 >= len(tokens) {
				return cfg, fmt.Errorf("port requires a value")
			}
			port, err := parsePort(tokens[i+1])
			if err != nil {
				return cfg, err
			}
			cfg.MatchSrcPort = 1
			cfg.MatchDstPort = 1
			cfg.SrcPort = port
			cfg.DstPort = port
			i += 2
		case "src", "dst":
			if i+2 >= len(tokens) {
				return cfg, fmt.Errorf("%s requires host or port and a value", tokens[i])
			}
			side := tokens[i]
			kind := tokens[i+1]
			value := tokens[i+2]
			switch kind {
			case "host":
				ip, err := parseIPv4(value)
				if err != nil {
					return cfg, err
				}
				if side == "src" {
					cfg.MatchSrcIP = 1
					cfg.SrcIP = ip
				} else {
					cfg.MatchDstIP = 1
					cfg.DstIP = ip
				}
			case "port":
				port, err := parsePort(value)
				if err != nil {
					return cfg, err
				}
				if side == "src" {
					cfg.MatchSrcPort = 1
					cfg.SrcPort = port
				} else {
					cfg.MatchDstPort = 1
					cfg.DstPort = port
				}
			default:
				return cfg, fmt.Errorf("unsupported %s qualifier %q", side, kind)
			}
			i += 3
		default:
			return cfg, fmt.Errorf("unsupported filter token %q", tokens[i])
		}
	}

	return cfg, nil
}

func compact(tokens []string) []string {
	out := make([]string, 0, len(tokens))
	for _, token := range tokens {
		if token == "and" || token == "&&" {
			continue
		}
		out = append(out, token)
	}
	return out
}

func parseIPv4(value string) (uint32, error) {
	ip := net.ParseIP(value).To4()
	if ip == nil {
		return 0, fmt.Errorf("invalid IPv4 address %q", value)
	}
	return binary.LittleEndian.Uint32(ip), nil
}

func parsePort(value string) (uint16, error) {
	port, err := strconv.ParseUint(value, 10, 16)
	if err != nil {
		return 0, fmt.Errorf("invalid port %q", value)
	}
	return uint16(port), nil
}
