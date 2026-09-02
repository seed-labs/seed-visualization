package event

import (
	"encoding/binary"
	"fmt"
	"net"
	"sort"
	"strings"
	"time"
)

const (
	DirectionIngress = 1
	DirectionEgress  = 2
	PacketCaptureMax = 65535

	ipProtoICMP = 1
	ipProtoTCP  = 6
	ipProtoUDP  = 17

	icmpEchoReply   = 0
	icmpEchoRequest = 8
)

// Raw must stay layout-compatible with struct packet_event in bpf/packet_trace.h.
type Raw struct {
	TimestampNS uint64
	IfIndex     uint32
	PacketLen   uint32
	Direction   uint8
	IPProto     uint8
	ICMPType    uint8
	ICMPCode    uint8
	SrcIP       uint32
	DstIP       uint32
	SrcPort     uint16
	DstPort     uint16
	ICMPID      uint16
	ICMPSeq     uint16
	TCPSeq      uint32
	TCPAck      uint32
	TCPFlags    uint8
	Reserved    [3]byte
	SrcMAC      [6]byte
	DstMAC      [6]byte
	CapturedLen uint32
	PacketData  [PacketCaptureMax]byte
}

type Packet struct {
	Timestamp           time.Time `json:"timestamp"`
	TimestampNS         uint64    `json:"timestampNs"`
	ContainerID         string    `json:"-"`
	ContainerName       string    `json:"containerName,omitempty"`
	IfName              string    `json:"ifName,omitempty"`
	NodeName            string    `json:"nodeName,omitempty"`
	NodeLabel           string    `json:"nodeLabel,omitempty"`
	NodeIP              string    `json:"nodeIp,omitempty"`
	NetworkID           string    `json:"networkId,omitempty"`
	NetworkName         string    `json:"networkName,omitempty"`
	NetworkLabel        string    `json:"networkLabel,omitempty"`
	SourceContainerID   string    `json:"-"`
	SourceContainerName string    `json:"sourceContainerName,omitempty"`
	SourceNodeName      string    `json:"sourceNodeName,omitempty"`
	SourceNodeIP        string    `json:"sourceNodeIp,omitempty"`
	DestContainerID     string    `json:"-"`
	DestContainerName   string    `json:"destContainerName,omitempty"`
	DestNodeName        string    `json:"destNodeName,omitempty"`
	DestNodeIP          string    `json:"destNodeIp,omitempty"`
	SourceIP            string    `json:"sourceIp"`
	DestIP              string    `json:"destIp"`
	IPProtocol          string    `json:"ipProtocol"`
	FlowID              string    `json:"flowId,omitempty"`
	PacketID            string    `json:"packetId,omitempty"`
	PacketRole          string    `json:"packetRole,omitempty"`
	PacketKind          string    `json:"packetKind,omitempty"`
	SourcePort          uint16    `json:"sourcePort,omitempty"`
	DestPort            uint16    `json:"destPort,omitempty"`
	ICMPType            *uint8    `json:"icmpType,omitempty"`
	ICMPCode            *uint8    `json:"icmpCode,omitempty"`
	ICMPID              uint16    `json:"icmpId,omitempty"`
	ICMPSeq             uint16    `json:"icmpSeq,omitempty"`
	TCPSeq              uint32    `json:"tcpSeq,omitempty"`
	TCPAck              uint32    `json:"tcpAck,omitempty"`
	TCPFlags            string    `json:"tcpFlags,omitempty"`
	Direction           uint8     `json:"-"`
	SourceMAC           string    `json:"-"`
	DestMAC             string    `json:"-"`
}

func FromRaw(raw Raw, ifName string, timestamp time.Time) Packet {
	packet := Packet{
		Timestamp:   timestamp.UTC(),
		TimestampNS: raw.TimestampNS,
		IfName:      ifName,
		Direction:   raw.Direction,
		SourceIP:    ipv4(raw.SrcIP),
		DestIP:      ipv4(raw.DstIP),
		IPProtocol:  protoName(raw.IPProto),
		SourcePort:  raw.SrcPort,
		DestPort:    raw.DstPort,
		SourceMAC:   net.HardwareAddr(raw.SrcMAC[:]).String(),
		DestMAC:     net.HardwareAddr(raw.DstMAC[:]).String(),
	}
	enrichPacketIdentity(&packet, raw)
	return packet
}

func (r Raw) CapturedPacketData() []byte {
	capturedLen := r.CapturedLen
	if capturedLen > PacketCaptureMax {
		capturedLen = PacketCaptureMax
	}
	return r.PacketData[:capturedLen]
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
	case ipProtoICMP:
		return "icmp"
	case ipProtoTCP:
		return "tcp"
	case ipProtoUDP:
		return "udp"
	default:
		return fmt.Sprintf("ip-%d", value)
	}
}

func enrichPacketIdentity(packet *Packet, raw Raw) {
	switch raw.IPProto {
	case ipProtoICMP:
		packet.ICMPType = uint8Ptr(raw.ICMPType)
		packet.ICMPCode = uint8Ptr(raw.ICMPCode)
		packet.ICMPID = raw.ICMPID
		packet.ICMPSeq = raw.ICMPSeq
		packet.PacketRole, packet.PacketKind = icmpPacketRoleAndKind(raw.ICMPType)
		packet.FlowID = icmpFlowID(packet.SourceIP, packet.DestIP, raw.ICMPType, raw.ICMPID)
		packet.PacketID = fmt.Sprintf(
			"icmp|%s>%s|type=%d|code=%d|id=%d|seq=%d",
			packet.SourceIP,
			packet.DestIP,
			raw.ICMPType,
			raw.ICMPCode,
			raw.ICMPID,
			raw.ICMPSeq,
		)
	case ipProtoTCP:
		packet.TCPSeq = raw.TCPSeq
		packet.TCPAck = raw.TCPAck
		packet.TCPFlags = tcpFlagsName(raw.TCPFlags)
		packet.PacketRole = "forward"
		packet.PacketKind = "tcp"
		if packet.TCPFlags != "" {
			packet.PacketKind = "tcp-" + strings.ToLower(strings.ReplaceAll(packet.TCPFlags, "|", "-"))
		}
		packet.FlowID = unorderedEndpointFlowID("tcp", packet.SourceIP, raw.SrcPort, packet.DestIP, raw.DstPort, "")
		packet.PacketID = fmt.Sprintf(
			"tcp|%s:%d>%s:%d|seq=%d|ack=%d|flags=%s",
			packet.SourceIP,
			raw.SrcPort,
			packet.DestIP,
			raw.DstPort,
			raw.TCPSeq,
			raw.TCPAck,
			packet.TCPFlags,
		)
	case ipProtoUDP:
		packet.PacketRole = "forward"
		packet.PacketKind = "udp"
		packet.FlowID = unorderedEndpointFlowID("udp", packet.SourceIP, raw.SrcPort, packet.DestIP, raw.DstPort, "")
		packet.PacketID = fmt.Sprintf(
			"udp|%s:%d>%s:%d|ts=%d",
			packet.SourceIP,
			raw.SrcPort,
			packet.DestIP,
			raw.DstPort,
			raw.TimestampNS,
		)
	default:
		packet.PacketRole = "forward"
		packet.PacketKind = packet.IPProtocol
		packet.FlowID = unorderedEndpointFlowID(packet.IPProtocol, packet.SourceIP, 0, packet.DestIP, 0, "")
		packet.PacketID = fmt.Sprintf("%s|%s>%s|ts=%d", packet.IPProtocol, packet.SourceIP, packet.DestIP, raw.TimestampNS)
	}
}

func icmpPacketRoleAndKind(icmpType uint8) (string, string) {
	switch icmpType {
	case icmpEchoRequest:
		return "request", "icmp-echo-request"
	case icmpEchoReply:
		return "reply", "icmp-echo-reply"
	default:
		return "control", fmt.Sprintf("icmp-type-%d", icmpType)
	}
}

func icmpFlowID(sourceIP string, destIP string, icmpType uint8, icmpID uint16) string {
	if icmpType == icmpEchoReply {
		return fmt.Sprintf("icmp|%s>%s|id=%d", destIP, sourceIP, icmpID)
	}
	return fmt.Sprintf("icmp|%s>%s|id=%d", sourceIP, destIP, icmpID)
}

func unorderedEndpointFlowID(protocol string, sourceIP string, sourcePort uint16, destIP string, destPort uint16, extra string) string {
	endpoints := []string{
		fmt.Sprintf("%s:%d", sourceIP, sourcePort),
		fmt.Sprintf("%s:%d", destIP, destPort),
	}
	sort.Strings(endpoints)
	parts := []string{protocol, endpoints[0], endpoints[1]}
	if extra != "" {
		parts = append(parts, extra)
	}
	return strings.Join(parts, "|")
}

func tcpFlagsName(flags uint8) string {
	names := make([]string, 0, 6)
	if flags&0x01 != 0 {
		names = append(names, "FIN")
	}
	if flags&0x02 != 0 {
		names = append(names, "SYN")
	}
	if flags&0x04 != 0 {
		names = append(names, "RST")
	}
	if flags&0x08 != 0 {
		names = append(names, "PSH")
	}
	if flags&0x10 != 0 {
		names = append(names, "ACK")
	}
	if flags&0x20 != 0 {
		names = append(names, "URG")
	}
	return strings.Join(names, "|")
}

func uint8Ptr(value uint8) *uint8 {
	return &value
}
