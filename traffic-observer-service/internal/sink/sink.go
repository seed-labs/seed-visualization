package sink

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"time"

	"github.com/gorilla/websocket"
)

type Sink interface {
	Name() string
	Send(context.Context, any) error
	Close() error
}

func New(ctx context.Context, rawURL string) (Sink, error) {
	if rawURL == "" {
		return stdoutSink{}, nil
	}

	parsed, err := url.Parse(rawURL)
	if err != nil {
		return nil, fmt.Errorf("invalid EMULATOR_SERVICE_TRAFFIC_URL: %w", err)
	}

	conn, _, err := websocket.DefaultDialer.DialContext(ctx, parsed.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("connect websocket sink %s: %w", parsed.String(), err)
	}

	return &websocketSink{url: parsed.String(), conn: conn}, nil
}

type stdoutSink struct{}

func (stdoutSink) Name() string { return "stdout" }
func (stdoutSink) Close() error { return nil }
func (stdoutSink) Send(_ context.Context, value any) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	fmt.Println(string(data))
	return nil
}

type websocketSink struct {
	url  string
	conn *websocket.Conn
}

func (s *websocketSink) Name() string { return s.url }
func (s *websocketSink) Close() error { return s.conn.Close() }
func (s *websocketSink) Send(_ context.Context, value any) error {
	_ = s.conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
	return s.conn.WriteJSON(value)
}
