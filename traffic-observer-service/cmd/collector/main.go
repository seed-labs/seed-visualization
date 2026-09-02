package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"seed-visualization/traffic-observer-service/internal/config"
	"seed-visualization/traffic-observer-service/internal/control"
	"seed-visualization/traffic-observer-service/internal/dockeriface"
	"seed-visualization/traffic-observer-service/internal/event"
	"seed-visualization/traffic-observer-service/internal/filter"
	"seed-visualization/traffic-observer-service/internal/ifacemanager"
	"seed-visualization/traffic-observer-service/internal/pcaprecorder"
	"seed-visualization/traffic-observer-service/internal/probe"
	"seed-visualization/traffic-observer-service/internal/realtime"
	"seed-visualization/traffic-observer-service/internal/sink"

	"golang.org/x/sys/unix"
)

func main() {
	configureLogTimeZone()
	if err := run(); err != nil {
		log.Fatalf("traffic observer stopped: %v", err)
	}
}

func configureLogTimeZone() {
	name := strings.TrimSpace(os.Getenv("TRAFFIC_LOG_TIMEZONE"))
	if name == "" {
		name = "Asia/Shanghai"
	}

	location, err := time.LoadLocation(name)
	if err != nil {
		location = time.FixedZone("Asia/Shanghai", 8*60*60)
	}
	time.Local = location
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	cfg := config.Load()

	filterConfig, err := filter.Parse(cfg.FilterExpr)
	if err != nil {
		return fmt.Errorf("parse TRAFFIC_FILTER: %w", err)
	}

	packetProbe, err := probe.Open(cfg.ObjectPath, nil)
	if err != nil {
		return err
	}
	defer packetProbe.Close()

	interfaceManager := ifacemanager.New(cfg.DockerSocket, dockeriface.DiscoverOptions{
		OnlySeedContainers: cfg.OnlySeedContainers,
		MaxConcurrency:     cfg.DiscoveryConcurrency,
	}, packetProbe)
	if len(cfg.Interfaces) > 0 {
		if err := interfaceManager.SetExplicitInterfaces(cfg.Interfaces); err != nil {
			return err
		}
	} else {
		snapshot, err := interfaceManager.Refresh(ctx)
		if err != nil {
			log.Printf("container interface discovery failed: %v", err)
		} else if snapshot.Interfaces == "" {
			log.Printf("no emulator container interfaces discovered at startup; traffic capture will attach after a filter request or manual interface refresh")
		}
	}

	if err := control.UpdateFilter(packetProbe.FilterMap(), filterConfig); err != nil {
		return err
	}

	reader := packetProbe.Reader()

	eventSink, err := sink.New(ctx, cfg.WebSocketSinkURL)
	if err != nil {
		return err
	}
	defer eventSink.Close()
	packetHub := realtime.NewPacketHub(control.PacketStreamPath)
	defer packetHub.Close()
	pcapRecorder := pcaprecorder.New(cfg.PcapOutputDir, cfg.PcapEnabled)
	defer pcapRecorder.Close()
	if err := pcapRecorder.BeginCapture(cfg.FilterExpr); err != nil {
		return err
	}

	ifNameByIndex := interfaceNameIndex()
	timestampBase, err := monotonicTimestampBase()
	if err != nil {
		return fmt.Errorf("calculate monotonic timestamp base: %w", err)
	}
	controlServer := control.NewServer(control.ServerOptions{
		Context:       ctx,
		Addr:          cfg.ControlAddr,
		FilterMap:     packetProbe.FilterMap(),
		InitialFilter: cfg.FilterExpr,
		BeforeFilterApplied: func(newExpr string) error {
			snapshot, err := interfaceManager.EnsureReady(ctx)
			if err != nil {
				return fmt.Errorf("%w; interfaces=%s discoveredContainerInterfaces=%d", err, snapshot.Interfaces, snapshot.DiscoveredContainerInterface)
			}
			log.Printf("traffic interfaces ready for filter %q: interfaces=%s discoveredContainerInterfaces=%d", newExpr, snapshot.Interfaces, snapshot.DiscoveredContainerInterface)
			return nil
		},
		OnFilterApplied: func(_, newExpr string) error {
			return pcapRecorder.BeginCapture(newExpr)
		},
		PacketStreamHandler: packetHub,
		PcapHandler:         pcaprecorder.NewControl(pcapRecorder),
		InterfacesHandler:   ifacemanager.NewControl(interfaceManager),
	})
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = controlServer.Shutdown(shutdownCtx)
	}()

	interfaceSnapshot := interfaceManager.Snapshot()
	log.Printf("traffic observer ready: interfaces=%s discoveredContainerInterfaces=%d filter=%q sink=%s frontendWS=%s%s control=%s pcapEnabled=%t pcapDir=%s", interfaceSnapshot.Interfaces, interfaceSnapshot.DiscoveredContainerInterface, cfg.FilterExpr, eventSink.Name(), cfg.ControlAddr, control.PacketStreamPath, cfg.ControlAddr, cfg.PcapEnabled, cfg.PcapOutputDir)

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
		interfaceManager.EnrichPacket(&packet, raw.IfIndex)
		syncPacketEndpointIPs(&packet)
		frontendMessage := realtime.NewPacketMessage(packet)
		if err := pcapRecorder.Write(packet, raw, frontendMessage); err != nil {
			log.Printf("packet recorder write failed: %v", err)
		}
		if err := eventSink.Send(ctx, frontendMessage); err != nil {
			log.Printf("send event failed: %v", err)
		}
		packetHub.Broadcast(frontendMessage)
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

func syncPacketEndpointIPs(packet *event.Packet) {
	if packet.SourceNodeIP != "" {
		packet.SourceIP = packet.SourceNodeIP
	}
	if packet.DestNodeIP != "" {
		packet.DestIP = packet.DestNodeIP
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
