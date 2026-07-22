package realtime

import (
	"context"
	"log"
	"net/http"
	"sync"
	"time"

	"seed-visualization/traffic-observer/internal/event"

	"github.com/gorilla/websocket"
)

const PacketWebSocketPath = "/ws/packets"

type PacketMessage struct {
	Type              string    `json:"type"`
	Timestamp         time.Time `json:"timestamp"`
	TimestampNS       uint64    `json:"timestampNs"`
	ContainerID       string    `json:"containerId"`
	NodeName          string    `json:"nodeName,omitempty"`
	NodeIP            string    `json:"nodeIp,omitempty"`
	SourceIP          string    `json:"sourceIp,omitempty"`
	DestIP            string    `json:"destIp,omitempty"`
	IPProtocol        string    `json:"ipProtocol,omitempty"`
	SourcePort        uint16    `json:"sourcePort,omitempty"`
	DestPort          uint16    `json:"destPort,omitempty"`
	SourceContainerID string    `json:"sourceContainerId,omitempty"`
	SourceNodeName    string    `json:"sourceNodeName,omitempty"`
	SourceNodeIP      string    `json:"sourceNodeIp,omitempty"`
	DestContainerID   string    `json:"destContainerId,omitempty"`
	DestNodeName      string    `json:"destNodeName,omitempty"`
	DestNodeIP        string    `json:"destNodeIp,omitempty"`
}

type PacketHub struct {
	mu       sync.RWMutex
	clients  map[*packetClient]struct{}
	upgrader websocket.Upgrader
}

func NewPacketHub() *PacketHub {
	return &PacketHub{
		clients: map[*packetClient]struct{}{},
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
	return "ws-server:" + PacketWebSocketPath
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

	h.Broadcast(PacketMessage{
		Type:              "packet",
		Timestamp:         packet.Timestamp,
		TimestampNS:       packet.TimestampNS,
		ContainerID:       packet.ContainerID,
		NodeName:          packet.NodeName,
		NodeIP:            packet.NodeIP,
		SourceIP:          packet.SourceIP,
		DestIP:            packet.DestIP,
		IPProtocol:        packet.IPProtocol,
		SourcePort:        packet.SourcePort,
		DestPort:          packet.DestPort,
		SourceContainerID: packet.SourceContainerID,
		SourceNodeName:    packet.SourceNodeName,
		SourceNodeIP:      packet.SourceNodeIP,
		DestContainerID:   packet.DestContainerID,
		DestNodeName:      packet.DestNodeName,
		DestNodeIP:        packet.DestNodeIP,
	})

	return nil
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
