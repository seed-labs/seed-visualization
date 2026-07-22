package dockerapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

const DefaultSocketPath = "/var/run/docker.sock"

type Client struct {
	http *http.Client
}

type ContainerListItem struct {
	ID     string            `json:"Id"`
	Names  []string          `json:"Names"`
	Labels map[string]string `json:"Labels"`
}

type ContainerInspect struct {
	ID              string           `json:"Id"`
	Name            string           `json:"Name"`
	Config          ContainerConfig  `json:"Config"`
	State           ContainerState   `json:"State"`
	HostConfig      HostConfig       `json:"HostConfig"`
	NetworkSettings NetworkSettings `json:"NetworkSettings"`
}

type ContainerConfig struct {
	Labels map[string]string `json:"Labels"`
}

type ContainerState struct {
	Pid int `json:"Pid"`
}

type HostConfig struct {
	NetworkMode string `json:"NetworkMode"`
}

type NetworkSettings struct {
	Networks map[string]EndpointSettings `json:"Networks"`
}

type EndpointSettings struct {
	IPAddress  string `json:"IPAddress"`
	MacAddress string `json:"MacAddress"`
}

func New(socketPath string) *Client {
	if strings.TrimSpace(socketPath) == "" {
		socketPath = DefaultSocketPath
	}

	transport := &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			var d net.Dialer
			return d.DialContext(ctx, "unix", socketPath)
		},
	}

	return &Client{
		http: &http.Client{
			Transport: transport,
			Timeout:   5 * time.Second,
		},
	}
}

func (c *Client) ListContainers(ctx context.Context) ([]ContainerListItem, error) {
	var containers []ContainerListItem
	if err := c.getJSON(ctx, "/containers/json", &containers); err != nil {
		return nil, fmt.Errorf("list docker containers: %w", err)
	}
	return containers, nil
}

func (c *Client) InspectContainer(ctx context.Context, id string) (ContainerInspect, error) {
	var inspect ContainerInspect
	if err := c.getJSON(ctx, "/containers/"+id+"/json", &inspect); err != nil {
		return inspect, fmt.Errorf("inspect docker container %s: %w", ShortID(id), err)
	}
	return inspect, nil
}

func (c *Client) getJSON(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://docker"+path, nil)
	if err != nil {
		return err
	}

	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
		return fmt.Errorf("docker api status=%d body=%s", res.StatusCode, strings.TrimSpace(string(body)))
	}

	return json.NewDecoder(res.Body).Decode(out)
}

func ShortID(id string) string {
	if len(id) <= 12 {
		return id
	}
	return id[:12]
}
