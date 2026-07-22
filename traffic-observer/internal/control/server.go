package control

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"seed-visualization/traffic-observer/internal/filter"

	"github.com/cilium/ebpf"
)

type Server struct {
	httpServer *http.Server
}

type Route struct {
	Pattern string
	Handler http.Handler
}

func NewServer(ctx context.Context, addr string, filterMap *ebpf.Map, initialFilter string, routes ...Route) *Server {
	filterControl := newFilterControl(filterMap, initialFilter)

	mux := http.NewServeMux()
	mux.Handle("/filter", filterControl)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	for _, route := range routes {
		if route.Pattern == "" || route.Handler == nil {
			continue
		}
		mux.Handle(route.Pattern, route.Handler)
	}

	httpServer := &http.Server{
		Addr:              addr,
		Handler:           withCORS(mux),
		ReadHeaderTimeout: 2 * time.Second,
	}

	server := &Server{httpServer: httpServer}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()

	go func() {
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("control server stopped: %v", err)
		}
	}()

	return server
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) Shutdown(ctx context.Context) error {
	return s.httpServer.Shutdown(ctx)
}

type filterControl struct {
	mu     sync.RWMutex
	expr   string
	bpfMap *ebpf.Map
}

type filterRequest struct {
	Filter string `json:"filter"`
}

type filterResponse struct {
	Filter string `json:"filter"`
}

func newFilterControl(bpfMap *ebpf.Map, initialExpr string) *filterControl {
	return &filterControl{
		expr:   initialExpr,
		bpfMap: bpfMap,
	}
}

func (c *filterControl) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		c.mu.RLock()
		defer c.mu.RUnlock()
		_ = json.NewEncoder(w).Encode(filterResponse{Filter: c.expr})
	case http.MethodPost, http.MethodPut:
		var req filterRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, fmt.Sprintf("invalid filter request: %v", err), http.StatusBadRequest)
			return
		}

		expr := strings.TrimSpace(req.Filter)

		cfg, err := filter.Parse(expr)
		if err != nil {
			http.Error(w, fmt.Sprintf("invalid filter expression: %v", err), http.StatusBadRequest)
			return
		}

		c.mu.Lock()
		defer c.mu.Unlock()
		if err := UpdateFilter(c.bpfMap, cfg); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		c.expr = expr
		log.Printf("traffic filter updated: %q", expr)
		_ = json.NewEncoder(w).Encode(filterResponse{Filter: c.expr})
	default:
		w.Header().Set("Allow", "GET, POST, PUT")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func UpdateFilter(m *ebpf.Map, cfg filter.Config) error {
	var key uint32
	if err := m.Update(key, cfg, ebpf.UpdateAny); err != nil {
		return fmt.Errorf("update filter_cfg map: %w", err)
	}
	return nil
}
