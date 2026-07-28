package event

import (
	"encoding/binary"
	"fmt"
	"net"
	"time"
)

const (
	DirectionIngress = 1
	DirectionEgress  = 2
)

// Raw must stay layout-compatible with struct packet_event in bpf/packet_trace.h.
type Raw struct {
	TimestampNS uint64
	IfIndex     uint32
	PacketLen   uint32
	Direction   uint8
	IPProto     uint8
	EthProto    uint16
	SrcIP       uint32
	DstIP       uint32
	SrcPort     uint16
	DstPort     uint16
	SrcMAC      [6]byte
	DstMAC      [6]byte
	TCPFlags    uint8
	TTL         uint8
	IPTotalLen  uint16
}

type Packet struct {
	Timestamp           time.Time `json:"timestamp"`
	TimestampNS         uint64    `json:"timestampNs"`
	HostIfIndex         uint32    `json:"hostIfIndex"`
	HostIfName          string    `json:"hostIfName,omitempty"`
	ContainerID         string    `json:"containerId,omitempty"`
	ContainerName       string    `json:"containerName,omitempty"`
	NodeID              string    `json:"nodeId,omitempty"`
	NodeName            string    `json:"nodeName,omitempty"`
	NodeIP              string    `json:"nodeIp,omitempty"`
	NodeType            string    `json:"nodeType,omitempty"`
	NetworkName         string    `json:"networkName,omitempty"`
	ContainerIfName     string    `json:"containerIfName,omitempty"`
	ContainerIPv4       string    `json:"containerIpv4,omitempty"`
	ContainerMAC        string    `json:"containerMac,omitempty"`
	SourceContainerID   string    `json:"sourceContainerId,omitempty"`
	SourceContainerName string    `json:"sourceContainerName,omitempty"`
	SourceNodeID        string    `json:"sourceNodeId,omitempty"`
	SourceNodeName      string    `json:"sourceNodeName,omitempty"`
	SourceNodeIP        string    `json:"sourceNodeIp,omitempty"`
	SourceNodeType      string    `json:"sourceNodeType,omitempty"`
	DestContainerID     string    `json:"destContainerId,omitempty"`
	DestContainerName   string    `json:"destContainerName,omitempty"`
	DestNodeID          string    `json:"destNodeId,omitempty"`
	DestNodeName        string    `json:"destNodeName,omitempty"`
	DestNodeIP          string    `json:"destNodeIp,omitempty"`
	DestNodeType        string    `json:"destNodeType,omitempty"`
	Direction           string    `json:"direction"`
	PacketLength        uint32    `json:"packetLength"`
	EthProtocol         string    `json:"ethProtocol"`
	SourceMAC           string    `json:"sourceMac"`
	DestMAC             string    `json:"destMac"`
	SourceIP            string    `json:"sourceIp"`
	DestIP              string    `json:"destIp"`
	IPProtocol          string    `json:"ipProtocol"`
	SourcePort          uint16    `json:"sourcePort,omitempty"`
	DestPort            uint16    `json:"destPort,omitempty"`
	TCPFlags            string    `json:"tcpFlags,omitempty"`
	TTL                 uint8     `json:"ttl"`
	IPTotalLen          uint16    `json:"ipTotalLength"`
}

func FromRaw(raw Raw, ifName string, timestamp time.Time) Packet {
	return Packet{
		Timestamp:    timestamp.UTC(),
		TimestampNS:  raw.TimestampNS,
		HostIfIndex:  raw.IfIndex,
		HostIfName:   ifName,
		Direction:    directionName(raw.Direction),
		PacketLength: raw.PacketLen,
		EthProtocol:  fmt.Sprintf("0x%04x", raw.EthProto),
		SourceMAC:    net.HardwareAddr(raw.SrcMAC[:]).String(),
		DestMAC:      net.HardwareAddr(raw.DstMAC[:]).String(),
		SourceIP:     ipv4(raw.SrcIP),
		DestIP:       ipv4(raw.DstIP),
		IPProtocol:   protoName(raw.IPProto),
		SourcePort:   raw.SrcPort,
		DestPort:     raw.DstPort,
		TCPFlags:     tcpFlags(raw.TCPFlags),
		TTL:          raw.TTL,
		IPTotalLen:   raw.IPTotalLen,
	}
}

func ipv4(value uint32) string {
	var b [4]byte
	binary.LittleEndian.PutUint32(b[:], value)
	return net.IPv4(b[0], b[1], b[2], b[3]).String()
}

func directionName(value uint8) string {
	switch value {
	case DirectionIngress:
		return "ingress"
	case DirectionEgress:
		return "egress"
	default:
		return "unknown"
	}
}

func protoName(value uint8) string {
	switch value {
	case 1:
		return "icmp"
	case 6:
		return "tcp"
	case 17:
		return "udp"
	default:
		return fmt.Sprintf("ip-%d", value)
	}
}

func tcpFlags(value uint8) string {
	if value == 0 {
		return ""
	}
	flags := ""
	if value&0x01 != 0 {
		flags += "FIN,"
	}
	if value&0x02 != 0 {
		flags += "SYN,"
	}
	if value&0x04 != 0 {
		flags += "RST,"
	}
	if value&0x08 != 0 {
		flags += "PSH,"
	}
	if value&0x10 != 0 {
		flags += "ACK,"
	}
	if value&0x20 != 0 {
		flags += "URG,"
	}
	return flags[:len(flags)-1]
}
