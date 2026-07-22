package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"log"
	"net"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"seed-visualization/traffic-observer/internal/config"
	"seed-visualization/traffic-observer/internal/control"
	"seed-visualization/traffic-observer/internal/dockeriface"
	"seed-visualization/traffic-observer/internal/event"
	"seed-visualization/traffic-observer/internal/filter"
	"seed-visualization/traffic-observer/internal/probe"
	"seed-visualization/traffic-observer/internal/realtime"
	"seed-visualization/traffic-observer/internal/sink"

	"golang.org/x/sys/unix"
)

func main() {
	if err := run(); err != nil {
		log.Fatalf("traffic observer stopped: %v", err)
	}
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	cfg := config.Load()

	containerInterfaces, err := dockeriface.Discover(ctx, cfg.DockerSocket, dockeriface.DiscoverOptions{
		OnlySeedContainers: cfg.OnlySeedContainers,
		MaxConcurrency:     cfg.DiscoveryConcurrency,
	})
	if err != nil {
		log.Printf("container interface discovery failed: %v", err)
	}
	containerIndex := dockeriface.NewIndex(containerInterfaces)
	ifaces := cfg.Interfaces
	if len(ifaces) == 0 {
		ifaces = containerIndex.HostInterfaceNames()
	}
	if len(ifaces) == 0 {
		ifaces = cfg.FallbackInterfaces
	}

	filterConfig, err := filter.Parse(cfg.FilterExpr)
	if err != nil {
		return fmt.Errorf("parse TRAFFIC_FILTER: %w", err)
	}

	packetProbe, err := probe.Open(cfg.ObjectPath, ifaces)
	if err != nil {
		return err
	}
	defer packetProbe.Close()

	if err := control.UpdateFilter(packetProbe.FilterMap(), filterConfig); err != nil {
		return err
	}

	reader := packetProbe.Reader()

	eventSink, err := sink.New(ctx, cfg.WebSocketSinkURL)
	if err != nil {
		return err
	}
	defer eventSink.Close()
	packetHub := realtime.NewPacketHub()
	defer packetHub.Close()

	ifNameByIndex := interfaceNameIndex()
	timestampBase, err := monotonicTimestampBase()
	if err != nil {
		return fmt.Errorf("calculate monotonic timestamp base: %w", err)
	}
	controlServer := control.NewServer(
		ctx,
		cfg.ControlAddr,
		packetProbe.FilterMap(),
		cfg.FilterExpr,
		control.Route{
			Pattern: realtime.PacketWebSocketPath,
			Handler: packetHub,
		},
	)
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = controlServer.Shutdown(shutdownCtx)
	}()

	log.Printf("traffic observer ready: interfaces=%s discoveredContainerInterfaces=%d filter=%q sink=%s frontendWS=%s%s control=%s", strings.Join(ifaces, ","), len(containerInterfaces), cfg.FilterExpr, eventSink.Name(), cfg.ControlAddr, realtime.PacketWebSocketPath, cfg.ControlAddr)

	go func() {
		<-ctx.Done()
		_ = reader.Close()
	}()

	for {
		record, err := reader.Read()
		if err != nil {
			if probe.IsReaderClosed(err) || ctx.Err() != nil {
				return nil
			}
			return fmt.Errorf("read ring buffer: %w", err)
		}

		var raw event.Raw
		if err := binary.Read(bytes.NewReader(record.RawSample), binary.LittleEndian, &raw); err != nil {
			log.Printf("drop malformed event: %v", err)
			continue
		}

		packetTimestamp := timestampBase.Add(time.Duration(raw.TimestampNS))
		packet := event.FromRaw(raw, ifNameByIndex[raw.IfIndex], packetTimestamp)
		if containerIface, ok := containerIndex.ByHostIfIndex[raw.IfIndex]; ok {
			enrichPacket(&packet, containerIface)
		}
		enrichPacketEndpoints(&packet, containerIndex)
		if err := eventSink.Send(ctx, packet); err != nil {
			log.Printf("send event failed: %v", err)
		}
		if err := packetHub.Send(ctx, packet); err != nil {
			log.Printf("broadcast packet failed: %v", err)
		}
	}
}

func monotonicTimestampBase() (time.Time, error) {
	var ts unix.Timespec
	if err := unix.ClockGettime(unix.CLOCK_MONOTONIC, &ts); err != nil {
		return time.Time{}, err
	}

	monotonicNow := time.Duration(ts.Sec)*time.Second + time.Duration(ts.Nsec)
	return time.Now().Add(-monotonicNow), nil
}

func enrichPacket(packet *event.Packet, containerIface dockeriface.Interface) {
	packet.ContainerID = containerIface.ContainerID
	packet.ContainerName = containerIface.ContainerName
	packet.NodeID = containerIface.NodeID
	packet.NodeName = containerIface.NodeName
	packet.NodeIP = containerIface.ContainerIPv4
	packet.NodeType = containerIface.NodeType
	packet.NetworkName = containerIface.NetworkName
	packet.ContainerIfName = containerIface.ContainerIfName
	packet.ContainerIPv4 = containerIface.ContainerIPv4
	packet.ContainerMAC = containerIface.ContainerMAC
}

func enrichPacketEndpoints(packet *event.Packet, containerIndex dockeriface.Index) {
	if sourceIface, ok := containerIndex.ByContainerMAC[dockeriface.NormalizeMAC(packet.SourceMAC)]; ok {
		packet.SourceContainerID = sourceIface.ContainerID
		packet.SourceContainerName = sourceIface.ContainerName
		packet.SourceNodeID = sourceIface.NodeID
		packet.SourceNodeName = sourceIface.NodeName
		packet.SourceNodeIP = sourceIface.ContainerIPv4
		packet.SourceNodeType = sourceIface.NodeType
	}

	if destIface, ok := containerIndex.ByContainerMAC[dockeriface.NormalizeMAC(packet.DestMAC)]; ok {
		packet.DestContainerID = destIface.ContainerID
		packet.DestContainerName = destIface.ContainerName
		packet.DestNodeID = destIface.NodeID
		packet.DestNodeName = destIface.NodeName
		packet.DestNodeIP = destIface.ContainerIPv4
		packet.DestNodeType = destIface.NodeType
	}
}

func interfaceNameIndex() map[uint32]string {
	out := map[uint32]string{}
	ifaces, err := net.Interfaces()
	if err != nil {
		return out
	}
	for _, iface := range ifaces {
		out[uint32(iface.Index)] = iface.Name
	}
	return out
}
