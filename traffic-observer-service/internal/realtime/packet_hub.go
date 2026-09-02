package realtime

import (
	"context"
	"log"
	"net/http"
	"sync"
	"time"

	"seed-visualization/traffic-observer-service/internal/event"

	"github.com/gorilla/websocket"
)

type PacketMessage struct {
	Type                string    `json:"type"`
	Timestamp           time.Time `json:"timestamp"`
	TimestampNS         uint64    `json:"timestampNs"`
	ContainerName       string    `json:"containerName"`
	IfName              string    `json:"ifName,omitempty"`
	NodeLabel           string    `json:"nodeLabel,omitempty"`
	NodeName            string    `json:"nodeName,omitempty"`
	NodeIP              string    `json:"nodeIp,omitempty"`
	NetworkID           string    `json:"networkId,omitempty"`
	NetworkName         string    `json:"networkName,omitempty"`
	NetworkLabel        string    `json:"networkLabel,omitempty"`
	SourceIP            string    `json:"sourceIp,omitempty"`
	DestIP              string    `json:"destIp,omitempty"`
	IPProtocol          string    `json:"ipProtocol,omitempty"`
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
	SourceContainerName string    `json:"sourceContainerName,omitempty"`
	SourceNodeName      string    `json:"sourceNodeName,omitempty"`
	SourceNodeIP        string    `json:"sourceNodeIp,omitempty"`
	DestContainerName   string    `json:"destContainerName,omitempty"`
	DestNodeName        string    `json:"destNodeName,omitempty"`
	DestNodeIP          string    `json:"destNodeIp,omitempty"`
}

type PacketHub struct {
	mu       sync.RWMutex
	clients  map[*packetClient]struct{}
	upgrader websocket.Upgrader
	name     string
}

func NewPacketHub(paths ...string) *PacketHub {
	name := "ws-server"
	if len(paths) > 0 && paths[0] != "" {
		name += ":" + paths[0]
	}

	return &PacketHub{
		clients: map[*packetClient]struct{}{},
		name:    name,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(_ *http.Request) bool {
				return true
			},
		},
	}
}

func (h *PacketHub) Name() string {
	return h.name
}

func (h *PacketHub) Close() error {
	h.mu.Lock()
	defer h.mu.Unlock()

	for client := range h.clients {
		client.close()
		delete(h.clients, client)
	}

	return nil
}

func (h *PacketHub) Send(_ context.Context, value any) error {
	packet, ok := value.(event.Packet)
	if !ok {
		return nil
	}

	h.Broadcast(NewPacketMessage(packet))

	return nil
}

func NewPacketMessage(packet event.Packet) PacketMessage {
	return PacketMessage{
		Type:                "packet",
		Timestamp:           packet.Timestamp,
		TimestampNS:         packet.TimestampNS,
		ContainerName:       packet.ContainerName,
		IfName:              packet.IfName,
		NodeLabel:           packet.NodeLabel,
		NodeName:            packet.NodeName,
		NodeIP:              packet.NodeIP,
		NetworkID:           packet.NetworkID,
		NetworkName:         packet.NetworkName,
		NetworkLabel:        packet.NetworkLabel,
		SourceIP:            packet.SourceIP,
		DestIP:              packet.DestIP,
		IPProtocol:          packet.IPProtocol,
		FlowID:              packet.FlowID,
		PacketID:            packet.PacketID,
		PacketRole:          packet.PacketRole,
		PacketKind:          packet.PacketKind,
		SourcePort:          packet.SourcePort,
		DestPort:            packet.DestPort,
		ICMPType:            packet.ICMPType,
		ICMPCode:            packet.ICMPCode,
		ICMPID:              packet.ICMPID,
		ICMPSeq:             packet.ICMPSeq,
		TCPSeq:              packet.TCPSeq,
		TCPAck:              packet.TCPAck,
		TCPFlags:            packet.TCPFlags,
		SourceContainerName: packet.SourceContainerName,
		SourceNodeName:      packet.SourceNodeName,
		SourceNodeIP:        packet.SourceNodeIP,
		DestContainerName:   packet.DestContainerName,
		DestNodeName:        packet.DestNodeName,
		DestNodeIP:          packet.DestNodeIP,
	}
}

func (h *PacketHub) Broadcast(message PacketMessage) {
	h.mu.RLock()
	var stale []*packetClient
	for client := range h.clients {
		select {
		case client.send <- message:
		default:
			stale = append(stale, client)
		}
	}
	h.mu.RUnlock()

	for _, client := range stale {
		h.unregister(client)
	}
}

func (h *PacketHub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	client := &packetClient{
		conn: conn,
		send: make(chan PacketMessage, 256),
		hub:  h,
	}

	h.register(client)
	go client.writeLoop()
	go client.readLoop()
}

func (h *PacketHub) register(client *packetClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[client] = struct{}{}
}

func (h *PacketHub) unregister(client *packetClient) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.clients[client]; !ok {
		return
	}

	delete(h.clients, client)
	client.close()
}

type packetClient struct {
	conn *websocket.Conn
	send chan PacketMessage
	hub  *PacketHub
	once sync.Once
}

func (c *packetClient) readLoop() {
	defer c.hub.unregister(c)

	for {
		if _, _, err := c.conn.ReadMessage(); err != nil {
			return
		}
	}
}

func (c *packetClient) writeLoop() {
	defer c.hub.unregister(c)

	for message := range c.send {
		_ = c.conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
		if err := c.conn.WriteJSON(message); err != nil {
			log.Printf("write packet websocket failed: %v", err)
			return
		}
	}
}

func (c *packetClient) close() {
	c.once.Do(func() {
		close(c.send)
		_ = c.conn.Close()
	})
}
