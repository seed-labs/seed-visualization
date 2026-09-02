package realtime

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"seed-visualization/traffic-observer-service/internal/event"

	"github.com/gorilla/websocket"
)

func TestPacketHubBroadcastsPacketMessages(t *testing.T) {
	hub := NewPacketHub()
	defer hub.Close()

	server := httptest.NewServer(hub)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial packet hub websocket: %v", err)
	}
	defer conn.Close()
	time.Sleep(25 * time.Millisecond)

	timestamp := time.Date(2026, 7, 15, 9, 31, 28, 922000000, time.UTC)
	err = hub.Send(context.Background(), event.Packet{
		Timestamp:           timestamp,
		TimestampNS:         1784107888922000000,
		ContainerID:         "container-a",
		ContainerName:       "container-name-a",
		IfName:              "veth-a",
		NodeLabel:           "150/host-a",
		NodeName:            "host-a",
		NodeIP:              "10.0.0.1",
		NetworkID:           "network-a",
		NetworkName:         "output_net_150_net0",
		NetworkLabel:        "150/net0",
		SourceIP:            "10.0.0.1",
		DestIP:              "10.0.0.2",
		IPProtocol:          "icmp",
		FlowID:              "icmp|10.0.0.1:0|10.0.0.2:0|id=1",
		PacketID:            "icmp|10.0.0.1>10.0.0.2|type=8|code=0|id=1|seq=1",
		PacketRole:          "request",
		PacketKind:          "icmp-echo-request",
		SourceContainerID:   "container-a",
		SourceContainerName: "container-name-a",
		DestContainerID:     "container-b",
		DestContainerName:   "container-name-b",
		DestNodeName:        "host-b",
		DestNodeIP:          "10.0.0.2",
	})
	if err != nil {
		t.Fatalf("send packet: %v", err)
	}

	if err := conn.SetReadDeadline(time.Now().Add(2 * time.Second)); err != nil {
		t.Fatalf("set deadline: %v", err)
	}
	_, payload, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("read packet message: %v", err)
	}

	var message PacketMessage
	if err := json.Unmarshal(payload, &message); err != nil {
		t.Fatalf("decode packet message: %v", err)
	}

	if message.Type != "packet" {
		t.Fatalf("unexpected message type: %s", message.Type)
	}
	if message.ContainerName != "container-name-a" || message.NodeName != "host-a" || message.NodeIP != "10.0.0.1" {
		t.Fatalf("unexpected node fields: %#v", message)
	}
	if message.IfName != "veth-a" || message.NodeLabel != "150/host-a" || message.NetworkLabel != "150/net0" {
		t.Fatalf("unexpected interface or label fields: %#v", message)
	}
	if message.SourceContainerName != "container-name-a" || message.DestContainerName != "container-name-b" {
		t.Fatalf("unexpected endpoint fields: %#v", message)
	}
	if message.FlowID == "" || message.PacketID == "" || message.PacketRole != "request" || message.PacketKind != "icmp-echo-request" {
		t.Fatalf("unexpected packet identity fields: %#v", message)
	}
	if strings.Contains(string(payload), "containerId") || strings.Contains(string(payload), "sourceContainerId") || strings.Contains(string(payload), "destContainerId") {
		t.Fatalf("packet message should not expose container id fields: %s", payload)
	}
	if message.TimestampNS != 1784107888922000000 {
		t.Fatalf("unexpected timestamp ns: %d", message.TimestampNS)
	}
}

func TestPacketHubIgnoresUnsupportedValues(t *testing.T) {
	hub := NewPacketHub()
	defer hub.Close()

	if err := hub.Send(context.Background(), "not a packet"); err != nil {
		t.Fatalf("unsupported values should be ignored, got error: %v", err)
	}
}
