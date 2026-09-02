package event

import (
	"testing"
	"time"
)

func TestFromRawConvertsPacketFields(t *testing.T) {
	timestamp := time.Date(2026, 7, 15, 9, 31, 28, 922000000, time.FixedZone("CST", 8*60*60))
	packet := FromRaw(Raw{
		TimestampNS: 1784107888922000000,
		IfIndex:     56,
		PacketLen:   98,
		Direction:   DirectionIngress,
		IPProto:     6,
		SrcIP:       0x0100000a,
		DstIP:       0x0200000a,
		SrcPort:     12345,
		DstPort:     443,
	}, "veth-test", timestamp)

	if packet.Timestamp.Location() != time.UTC {
		t.Fatalf("expected timestamp to be normalized to UTC")
	}
	if packet.TimestampNS != 1784107888922000000 {
		t.Fatalf("unexpected timestamp ns: %d", packet.TimestampNS)
	}
	if packet.IfName != "veth-test" {
		t.Fatalf("unexpected interface data: %#v", packet)
	}
	if packet.SourceIP != "10.0.0.1" || packet.DestIP != "10.0.0.2" {
		t.Fatalf("unexpected ip pair: %s -> %s", packet.SourceIP, packet.DestIP)
	}
	if packet.IPProtocol != "tcp" {
		t.Fatalf("unexpected ip protocol: %s", packet.IPProtocol)
	}
	if packet.PacketRole != "forward" || packet.PacketKind != "tcp" {
		t.Fatalf("unexpected packet identity: role=%q kind=%q", packet.PacketRole, packet.PacketKind)
	}
}

func TestFromRawConvertsObservedNetworkOrderIPs(t *testing.T) {
	packet := FromRaw(Raw{
		IPProto: 1,
		SrcIP:   0x4700980a,
		DstIP:   0x4700960a,
	}, "veth-test", time.Unix(0, 0))

	if packet.SourceIP != "10.152.0.71" || packet.DestIP != "10.150.0.71" {
		t.Fatalf("unexpected observed ip pair: %s -> %s", packet.SourceIP, packet.DestIP)
	}
}

func TestFromRawNamesUnknownValues(t *testing.T) {
	packet := FromRaw(Raw{
		Direction: 99,
		IPProto:   253,
	}, "", time.Unix(0, 0))

	if packet.IPProtocol != "ip-253" {
		t.Fatalf("expected unknown protocol name, got %q", packet.IPProtocol)
	}
}

func TestFromRawIdentifiesICMPEchoRequestAndReply(t *testing.T) {
	request := FromRaw(Raw{
		TimestampNS: 100,
		IPProto:     1,
		ICMPType:    8,
		ICMPCode:    0,
		ICMPID:      123,
		ICMPSeq:     7,
		SrcIP:       0x4700960a,
		DstIP:       0x4700980a,
	}, "veth-a", time.Unix(0, 0))
	reply := FromRaw(Raw{
		TimestampNS: 200,
		IPProto:     1,
		ICMPType:    0,
		ICMPCode:    0,
		ICMPID:      123,
		ICMPSeq:     7,
		SrcIP:       0x4700980a,
		DstIP:       0x4700960a,
	}, "veth-b", time.Unix(0, 0))

	if request.PacketRole != "request" || request.PacketKind != "icmp-echo-request" {
		t.Fatalf("unexpected request identity: %#v", request)
	}
	if reply.PacketRole != "reply" || reply.PacketKind != "icmp-echo-reply" {
		t.Fatalf("unexpected reply identity: %#v", reply)
	}
	if request.FlowID != reply.FlowID {
		t.Fatalf("request and reply should share flow id: %q != %q", request.FlowID, reply.FlowID)
	}
	if request.PacketID == reply.PacketID {
		t.Fatalf("request and reply should keep distinct packet ids: %q", request.PacketID)
	}
	if reply.ICMPType == nil || *reply.ICMPType != 0 {
		t.Fatalf("icmp type 0 must be preserved")
	}
}

func TestFromRawKeepsOppositeICMPRequestsAsDifferentFlows(t *testing.T) {
	first := FromRaw(Raw{
		IPProto:  1,
		ICMPType: 8,
		ICMPID:   123,
		SrcIP:    0x4700960a,
		DstIP:    0x4700980a,
	}, "", time.Unix(0, 0))
	opposite := FromRaw(Raw{
		IPProto:  1,
		ICMPType: 8,
		ICMPID:   123,
		SrcIP:    0x4700980a,
		DstIP:    0x4700960a,
	}, "", time.Unix(0, 0))

	if first.FlowID == opposite.FlowID {
		t.Fatalf("opposite echo requests should not share flow id: %q", first.FlowID)
	}
}
