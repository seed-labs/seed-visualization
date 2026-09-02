package sink

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestNewReturnsStdoutSinkWhenURLIsEmpty(t *testing.T) {
	s, err := New(context.Background(), "")
	if err != nil {
		t.Fatalf("create stdout sink: %v", err)
	}
	defer s.Close()

	if s.Name() != "stdout" {
		t.Fatalf("unexpected sink name: %s", s.Name())
	}
	if err := s.Send(context.Background(), map[string]string{"type": "packet"}); err != nil {
		t.Fatalf("stdout sink should marshal JSON values: %v", err)
	}
}

func TestNewRejectsInvalidWebSocketURL(t *testing.T) {
	if _, err := New(context.Background(), "://bad-url"); err == nil {
		t.Fatal("expected invalid URL error")
	}
}

func TestWebSocketSinkSendsJSON(t *testing.T) {
	messages := make(chan map[string]any, 1)
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("upgrade websocket: %v", err)
			return
		}
		defer conn.Close()

		var payload map[string]any
		if err := conn.ReadJSON(&payload); err != nil {
			t.Errorf("read websocket JSON: %v", err)
			return
		}
		messages <- payload
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	s, err := New(context.Background(), wsURL)
	if err != nil {
		t.Fatalf("create websocket sink: %v", err)
	}
	defer s.Close()

	if s.Name() != wsURL {
		t.Fatalf("unexpected websocket sink name: %s", s.Name())
	}
	if err := s.Send(context.Background(), map[string]string{"type": "packet"}); err != nil {
		t.Fatalf("send websocket JSON: %v", err)
	}

	select {
	case payload := <-messages:
		data, _ := json.Marshal(payload)
		if payload["type"] != "packet" {
			t.Fatalf("unexpected websocket payload: %s", data)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for websocket payload")
	}
}
