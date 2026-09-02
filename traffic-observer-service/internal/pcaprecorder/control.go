package pcaprecorder

import (
	"encoding/json"
	"fmt"
	"net/http"
)

type controlRequest struct {
	Enabled *bool `json:"enabled"`
}

type Control struct {
	recorder *Recorder
}

func NewControl(recorder *Recorder) *Control {
	return &Control{recorder: recorder}
}

func (c *Control) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		_ = json.NewEncoder(w).Encode(c.recorder.Status())
	case http.MethodPost, http.MethodPut:
		var req controlRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, fmt.Sprintf("invalid pcap request: %v", err), http.StatusBadRequest)
			return
		}
		if req.Enabled == nil {
			http.Error(w, "enabled is required", http.StatusBadRequest)
			return
		}
		if err := c.recorder.SetEnabled(*req.Enabled); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(c.recorder.Status())
	default:
		w.Header().Set("Allow", "GET, POST, PUT")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
