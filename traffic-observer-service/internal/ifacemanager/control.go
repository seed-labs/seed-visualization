package ifacemanager

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

type Control struct {
	manager *Manager
}

func NewControl(manager *Manager) *Control {
	return &Control{manager: manager}
}

func (c *Control) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		_ = json.NewEncoder(w).Encode(c.manager.Snapshot())
	case http.MethodPost, http.MethodPut:
		snapshot, err := c.manager.Refresh(r.Context())
		if err != nil {
			log.Printf("traffic interfaces refresh failed: interfaces=%s discoveredContainerInterfaces=%d error=%v", snapshot.Interfaces, snapshot.DiscoveredContainerInterface, err)
			http.Error(w, fmt.Sprintf("refresh interfaces failed: %v", err), http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(snapshot)
	default:
		w.Header().Set("Allow", "GET, POST, PUT")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
