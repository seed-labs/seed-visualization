package pcaprecorder

import (
	"encoding/binary"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"seed-visualization/traffic-observer-service/internal/event"
)

func TestRecorderWritesOnlyWhenEnabledAndCaptureActive(t *testing.T) {
	dir := t.TempDir()
	recorder := New(dir, false)
	defer recorder.Close()
	packet, raw := testPacket(time.Date(2026, 8, 11, 10, 20, 30, 0, time.Local))

	recorder.Write(packet, raw, map[string]string{"type": "packet"})
	assertFileCount(t, dir, "*.pcap", 0)
	assertFileCount(t, dir, "*.json", 0)

	if err := recorder.SetEnabled(true); err != nil {
		t.Fatalf("enable recorder: %v", err)
	}
	recorder.Write(packet, raw, map[string]string{"type": "packet"})
	assertFileCount(t, dir, "*.pcap", 0)
	assertFileCount(t, dir, "*.json", 0)

	if err := recorder.BeginCapture("icmp"); err != nil {
		t.Fatalf("begin capture: %v", err)
	}
	recorder.Write(packet, raw, map[string]string{"type": "packet"})
	assertFileCount(t, dir, "*.pcap", 1)
	assertFileCount(t, dir, "*.json", 1)
}

func TestRecorderStartsNewFilesWhenFilterChanges(t *testing.T) {
	dir := t.TempDir()
	recorder := New(dir, true)
	defer recorder.Close()
	packet, raw := testPacket(time.Date(2026, 8, 11, 10, 20, 30, 0, time.Local))

	if err := recorder.BeginCapture("icmp"); err != nil {
		t.Fatalf("begin first capture: %v", err)
	}
	recorder.Write(packet, raw, map[string]string{"type": "packet"})
	firstStatus := recorder.Status()
	if firstStatus.CurrentPcapFile == "" || firstStatus.CurrentJSONFile == "" {
		t.Fatalf("expected first capture files, got status: %+v", firstStatus)
	}

	if err := recorder.BeginCapture("icmp"); err != nil {
		t.Fatalf("repeat same capture: %v", err)
	}
	recorder.Write(packet, raw, map[string]string{"type": "packet"})
	sameStatus := recorder.Status()
	if sameStatus.CurrentPcapFile != firstStatus.CurrentPcapFile {
		t.Fatalf("same filter should keep pcap file: first=%q same=%q", firstStatus.CurrentPcapFile, sameStatus.CurrentPcapFile)
	}
	if sameStatus.CurrentJSONFile != firstStatus.CurrentJSONFile {
		t.Fatalf("same filter should keep json file: first=%q same=%q", firstStatus.CurrentJSONFile, sameStatus.CurrentJSONFile)
	}

	if err := recorder.BeginCapture("tcp port 80"); err != nil {
		t.Fatalf("begin second capture: %v", err)
	}
	recorder.Write(packet, raw, map[string]string{"type": "packet"})

	assertFileCount(t, dir, "*.pcap", 2)
	assertFileCount(t, dir, "*.json", 2)
}

func TestRecorderStopsCaptureOnEmptyFilter(t *testing.T) {
	dir := t.TempDir()
	recorder := New(dir, true)
	defer recorder.Close()
	packet, raw := testPacket(time.Now())

	if err := recorder.BeginCapture("icmp"); err != nil {
		t.Fatalf("begin capture: %v", err)
	}
	recorder.Write(packet, raw, map[string]string{"type": "packet"})
	if err := recorder.BeginCapture(""); err != nil {
		t.Fatalf("stop capture: %v", err)
	}
	recorder.Write(packet, raw, map[string]string{"type": "packet"})

	assertFileCount(t, dir, "*.pcap", 1)
	assertFileCount(t, dir, "*.json", 1)
	status := recorder.Status()
	if status.CaptureActive {
		t.Fatalf("empty filter should stop capture: %+v", status)
	}
}

func TestRecorderUsesFilterBasedFileNames(t *testing.T) {
	dir := t.TempDir()
	recorder := New(dir, true)
	defer recorder.Close()
	packet, raw := testPacket(time.Date(2026, 8, 11, 10, 20, 30, 0, time.Local))

	if err := recorder.BeginCapture("tcp and port 80"); err != nil {
		t.Fatalf("begin capture: %v", err)
	}
	recorder.Write(packet, raw, map[string]string{"type": "packet"})

	pcapFile := singleFile(t, dir, "*.pcap")
	jsonFile := singleFile(t, dir, "*.json")
	pcapName := filepath.Base(pcapFile)
	jsonName := filepath.Base(jsonFile)

	if strings.Contains(pcapName, packet.IfName) || strings.Contains(pcapName, packet.SourceIP) || strings.Contains(pcapName, packet.DestIP) {
		t.Fatalf("pcap file name should be based on filter only: %s", pcapName)
	}
	if !strings.HasPrefix(pcapName, "tcp-and-port-80_") || !strings.HasSuffix(pcapName, ".pcap") {
		t.Fatalf("unexpected pcap file name: %s", pcapName)
	}
	if strings.TrimSuffix(pcapName, ".pcap") != strings.TrimSuffix(jsonName, ".json") {
		t.Fatalf("pcap and json files should share the same stem: pcap=%s json=%s", pcapName, jsonName)
	}
}

func TestRecorderWritesPcapAndJSONInSameOrder(t *testing.T) {
	dir := t.TempDir()
	recorder := New(dir, true)
	defer recorder.Close()

	if err := recorder.BeginCapture("icmp"); err != nil {
		t.Fatalf("begin capture: %v", err)
	}

	firstPacket, firstRaw := testPacket(time.Date(2026, 8, 11, 10, 20, 30, 0, time.Local))
	secondPacket, secondRaw := testPacket(time.Date(2026, 8, 11, 10, 20, 31, 0, time.Local))
	copy(firstRaw.PacketData[:], []byte{0x01, 0x02, 0x03, 0x04})
	copy(secondRaw.PacketData[:], []byte{0xaa, 0xbb, 0xcc, 0xdd})

	if err := recorder.Write(firstPacket, firstRaw, map[string]any{"type": "packet", "sequence": 1}); err != nil {
		t.Fatalf("write first packet: %v", err)
	}
	if err := recorder.Write(secondPacket, secondRaw, map[string]any{"type": "packet", "sequence": 2}); err != nil {
		t.Fatalf("write second packet: %v", err)
	}
	if err := recorder.Close(); err != nil {
		t.Fatalf("close recorder: %v", err)
	}

	pcapRecords := readPcapRecords(t, singleFile(t, dir, "*.pcap"))
	if len(pcapRecords) != 2 {
		t.Fatalf("expected 2 pcap records, got %d", len(pcapRecords))
	}
	if string(pcapRecords[0]) != string([]byte{0x01, 0x02, 0x03, 0x04}) {
		t.Fatalf("unexpected first pcap record: %x", pcapRecords[0])
	}
	if string(pcapRecords[1]) != string([]byte{0xaa, 0xbb, 0xcc, 0xdd}) {
		t.Fatalf("unexpected second pcap record: %x", pcapRecords[1])
	}

	var messages []map[string]any
	data, err := os.ReadFile(singleFile(t, dir, "*.json"))
	if err != nil {
		t.Fatalf("read json recording: %v", err)
	}
	if err := json.Unmarshal(data, &messages); err != nil {
		t.Fatalf("parse json recording: %v", err)
	}
	if len(messages) != 2 {
		t.Fatalf("expected 2 json messages, got %d", len(messages))
	}
	if messages[0]["sequence"] != float64(1) || messages[1]["sequence"] != float64(2) {
		t.Fatalf("json messages are not in packet order: %+v", messages)
	}
}

func testPacket(timestamp time.Time) (event.Packet, event.Raw) {
	raw := event.Raw{
		PacketLen:   4,
		CapturedLen: 4,
	}
	copy(raw.PacketData[:], []byte{0xde, 0xad, 0xbe, 0xef})

	return event.Packet{
		Timestamp: timestamp,
		IfName:    "veth-test0",
		SourceIP:  "10.150.0.72",
		DestIP:    "10.151.0.72",
	}, raw
}

func singleFile(t *testing.T, dir string, pattern string) string {
	t.Helper()

	files, err := filepath.Glob(filepath.Join(dir, pattern))
	if err != nil {
		t.Fatalf("glob %s: %v", pattern, err)
	}
	if len(files) != 1 {
		t.Fatalf("expected one file matching %s, got %d", pattern, len(files))
	}
	return files[0]
}

func readPcapRecords(t *testing.T, path string) [][]byte {
	t.Helper()

	file, err := os.Open(path)
	if err != nil {
		t.Fatalf("open pcap: %v", err)
	}
	defer file.Close()

	if _, err := file.Seek(24, io.SeekStart); err != nil {
		t.Fatalf("skip pcap global header: %v", err)
	}

	var records [][]byte
	for {
		var header struct {
			TimestampSec  uint32
			TimestampUsec uint32
			IncludedLen   uint32
			OriginalLen   uint32
		}
		if err := binary.Read(file, binary.LittleEndian, &header); err != nil {
			if err == io.EOF {
				break
			}
			t.Fatalf("read pcap record header: %v", err)
		}
		data := make([]byte, header.IncludedLen)
		if _, err := io.ReadFull(file, data); err != nil {
			t.Fatalf("read pcap record data: %v", err)
		}
		records = append(records, data)
	}
	return records
}

func assertFileCount(t *testing.T, dir string, pattern string, expected int) {
	t.Helper()

	files, err := filepath.Glob(filepath.Join(dir, pattern))
	if err != nil {
		t.Fatalf("glob %s: %v", pattern, err)
	}
	if len(files) != expected {
		entries, _ := os.ReadDir(dir)
		names := make([]string, 0, len(entries))
		for _, entry := range entries {
			names = append(names, entry.Name())
		}
		t.Fatalf("expected %d files matching %s, got %d: %s", expected, pattern, len(files), strings.Join(names, ", "))
	}
}
