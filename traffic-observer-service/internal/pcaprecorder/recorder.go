package pcaprecorder

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"seed-visualization/traffic-observer-service/internal/event"
)

const (
	defaultSnapLen   = event.PacketCaptureMax
	linkTypeEthernet = 1
)

type Status struct {
	Enabled         bool   `json:"enabled"`
	CaptureActive   bool   `json:"captureActive"`
	Filter          string `json:"filter,omitempty"`
	OutputDir       string `json:"outputDir"`
	CurrentPcapFile string `json:"currentPcapFile,omitempty"`
	CurrentJSONFile string `json:"currentJsonFile,omitempty"`
	PacketCount     uint64 `json:"packetCount"`
	ByteCount       uint64 `json:"byteCount"`
	MessageCount    uint64 `json:"messageCount"`
	LastError       string `json:"lastError,omitempty"`
}

type Recorder struct {
	mu              sync.Mutex
	outputDir       string
	enabled         bool
	captureActive   bool
	filter          string
	fileStem        string
	currentPcapFile string
	currentJSONFile string
	pcapFile        *os.File
	jsonFile        *os.File
	jsonStarted     bool
	packetCount     uint64
	byteCount       uint64
	messageCount    uint64
	lastError       string
}

func New(outputDir string, enabled bool) *Recorder {
	if strings.TrimSpace(outputDir) == "" {
		outputDir = "pcap"
	}

	return &Recorder{
		outputDir: outputDir,
		enabled:   enabled,
	}
}

func (r *Recorder) Status() Status {
	r.mu.Lock()
	defer r.mu.Unlock()

	return Status{
		Enabled:         r.enabled,
		CaptureActive:   r.captureActive,
		Filter:          r.filter,
		OutputDir:       r.outputDir,
		CurrentPcapFile: r.currentPcapFile,
		CurrentJSONFile: r.currentJSONFile,
		PacketCount:     r.packetCount,
		ByteCount:       r.byteCount,
		MessageCount:    r.messageCount,
		LastError:       r.lastError,
	}
}

func (r *Recorder) SetEnabled(enabled bool) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.enabled = enabled
	if !enabled {
		return r.closeLocked()
	}

	r.lastError = ""
	return nil
}

func (r *Recorder) BeginCapture(filterExpr string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	filterExpr = strings.TrimSpace(filterExpr)
	if filterExpr == "" {
		r.captureActive = false
		r.filter = ""
		r.fileStem = ""
		r.packetCount = 0
		r.byteCount = 0
		r.messageCount = 0
		return r.closeLocked()
	}

	if r.captureActive && r.filter == filterExpr {
		return nil
	}

	if err := r.closeLocked(); err != nil {
		r.lastError = err.Error()
		return err
	}

	r.captureActive = true
	r.filter = filterExpr
	r.fileStem = defaultFileStem(filterExpr, time.Now())
	r.packetCount = 0
	r.byteCount = 0
	r.messageCount = 0
	r.lastError = ""
	log.Printf("packet recorder capture started: filter=%q", filterExpr)
	return nil
}

func (r *Recorder) Close() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.closeLocked()
}

func (r *Recorder) Write(packet event.Packet, raw event.Raw, frontendMessage any) error {
	data := raw.CapturedPacketData()
	if len(data) == 0 {
		return nil
	}

	var frontendData []byte
	var err error
	if frontendMessage != nil {
		frontendData, err = json.Marshal(frontendMessage)
		if err != nil {
			return err
		}
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if !r.enabled || !r.captureActive {
		return nil
	}

	if r.pcapFile == nil {
		if err := r.openPcapLocked(packet); err != nil {
			r.lastError = err.Error()
			log.Printf("pcap recorder open failed: %v", err)
			return err
		}
	}
	if frontendMessage != nil && r.jsonFile == nil {
		if err := r.openJSONLocked(packet.Timestamp); err != nil {
			r.lastError = err.Error()
			log.Printf("packet json recorder open failed: %v", err)
			return err
		}
	}

	pcapOffset, err := r.pcapFile.Seek(0, os.SEEK_CUR)
	if err != nil {
		r.lastError = err.Error()
		return err
	}
	jsonOffset := int64(0)
	jsonStarted := r.jsonStarted
	if r.jsonFile != nil {
		jsonOffset, err = r.jsonFile.Seek(0, os.SEEK_CUR)
		if err != nil {
			r.lastError = err.Error()
			return err
		}
	}
	if err := writePacketRecord(r.pcapFile, packet.Timestamp, data, raw.PacketLen); err != nil {
		r.lastError = err.Error()
		log.Printf("pcap recorder write failed: %v", err)
		_ = r.closePcapLocked()
		return err
	}
	if frontendMessage != nil {
		if err := r.writeFrontendMessageDataLocked(frontendData); err != nil {
			r.lastError = err.Error()
			log.Printf("packet json recorder write failed: %v", err)
			if truncateErr := truncateFileLocked(r.pcapFile, pcapOffset); truncateErr != nil {
				log.Printf("pcap recorder rollback failed: %v", truncateErr)
			}
			if r.jsonFile != nil {
				if truncateErr := truncateFileLocked(r.jsonFile, jsonOffset); truncateErr != nil {
					log.Printf("packet json recorder rollback failed: %v", truncateErr)
				}
			}
			r.jsonStarted = jsonStarted
			return err
		}
	}

	r.packetCount++
	r.byteCount += uint64(len(data))
	return nil
}

func (r *Recorder) openPcapLocked(_ event.Packet) error {
	if err := os.MkdirAll(r.outputDir, 0o755); err != nil {
		return err
	}

	if fileStemExists(r.outputDir, r.fileStem) {
		r.fileStem = uniqueFileStem(r.filter, time.Now())
	}

	path := filepath.Join(r.outputDir, r.fileStem+".pcap")
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if os.IsExist(err) {
		r.fileStem = uniqueFileStem(r.filter, time.Now())
		path = filepath.Join(r.outputDir, r.fileStem+".pcap")
		file, err = os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	}
	if err != nil {
		return err
	}

	if err := writeGlobalHeader(file); err != nil {
		_ = file.Close()
		return err
	}

	r.pcapFile = file
	r.currentPcapFile = path
	r.packetCount = 0
	r.byteCount = 0
	r.lastError = ""
	log.Printf("pcap recorder started: %s", path)
	return nil
}

func (r *Recorder) closeLocked() error {
	err := r.closePcapLocked()
	if jsonErr := r.closeJSONLocked(); jsonErr != nil && err == nil {
		err = jsonErr
	}
	return err
}

func (r *Recorder) closePcapLocked() error {
	if r.pcapFile == nil {
		r.currentPcapFile = ""
		return nil
	}

	err := r.pcapFile.Close()
	r.pcapFile = nil
	r.currentPcapFile = ""
	return err
}

func (r *Recorder) openJSONLocked(_ time.Time) error {
	if r.jsonFile != nil {
		return nil
	}
	if err := os.MkdirAll(r.outputDir, 0o755); err != nil {
		return err
	}

	path := filepath.Join(r.outputDir, r.fileStem+".json")
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if os.IsExist(err) {
		return fmt.Errorf("packet json recorder file already exists for current capture batch: %s", path)
	}
	if err != nil {
		return err
	}
	if _, err := file.WriteString("[\n"); err != nil {
		_ = file.Close()
		return err
	}

	r.jsonFile = file
	r.currentJSONFile = path
	r.jsonStarted = false
	r.messageCount = 0
	log.Printf("packet json recorder started: %s", path)
	return nil
}

func (r *Recorder) writeFrontendMessageDataLocked(data []byte) error {
	if r.jsonStarted {
		if _, err := r.jsonFile.WriteString(",\n"); err != nil {
			return err
		}
	}
	if _, err := r.jsonFile.Write(data); err != nil {
		return err
	}

	r.jsonStarted = true
	r.messageCount++
	return nil
}

func truncateFileLocked(file *os.File, offset int64) error {
	if file == nil {
		return nil
	}
	if err := file.Truncate(offset); err != nil {
		return err
	}
	_, err := file.Seek(offset, os.SEEK_SET)
	return err
}

func (r *Recorder) closeJSONLocked() error {
	if r.jsonFile == nil {
		r.currentJSONFile = ""
		r.jsonStarted = false
		return nil
	}

	var err error
	if r.jsonStarted {
		_, err = r.jsonFile.WriteString("\n]\n")
	} else {
		_, err = r.jsonFile.WriteString("]\n")
	}
	if closeErr := r.jsonFile.Close(); err == nil {
		err = closeErr
	}

	r.jsonFile = nil
	r.currentJSONFile = ""
	r.jsonStarted = false
	return err
}

func defaultFileStem(filterExpr string, timestamp time.Time) string {
	return fmt.Sprintf("%s_%s", safeFilterName(filterExpr), timestamp.Local().Format("20060102150405"))
}

func uniqueFileStem(filterExpr string, timestamp time.Time) string {
	return fmt.Sprintf("%s_%d", defaultFileStem(filterExpr, timestamp), time.Now().UnixNano())
}

func fileStemExists(outputDir string, stem string) bool {
	if stem == "" {
		return false
	}
	if _, err := os.Stat(filepath.Join(outputDir, stem+".pcap")); err == nil {
		return true
	}
	if _, err := os.Stat(filepath.Join(outputDir, stem+".json")); err == nil {
		return true
	}
	return false
}

func safeFilterName(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "empty-filter"
	}
	value = strings.ToLower(value)
	value = regexp.MustCompile(`[^a-z0-9._-]+`).ReplaceAllString(value, "-")
	value = strings.Trim(value, ".-_")
	if value == "" {
		return "filter"
	}
	if len(value) > 120 {
		return value[:120]
	}
	return value
}

func writeGlobalHeader(file *os.File) error {
	header := struct {
		MagicNumber  uint32
		VersionMajor uint16
		VersionMinor uint16
		ThisZone     int32
		SigFigs      uint32
		SnapLen      uint32
		Network      uint32
	}{
		MagicNumber:  0xa1b2c3d4,
		VersionMajor: 2,
		VersionMinor: 4,
		ThisZone:     0,
		SigFigs:      0,
		SnapLen:      defaultSnapLen,
		Network:      linkTypeEthernet,
	}
	return binary.Write(file, binary.LittleEndian, header)
}

func writePacketRecord(file *os.File, timestamp time.Time, data []byte, originalLen uint32) error {
	if originalLen == 0 {
		originalLen = uint32(len(data))
	}

	recordHeader := struct {
		TimestampSec  uint32
		TimestampUsec uint32
		IncludedLen   uint32
		OriginalLen   uint32
	}{
		TimestampSec:  uint32(timestamp.Unix()),
		TimestampUsec: uint32(timestamp.Nanosecond() / 1000),
		IncludedLen:   uint32(len(data)),
		OriginalLen:   originalLen,
	}

	if err := binary.Write(file, binary.LittleEndian, recordHeader); err != nil {
		return err
	}
	_, err := file.Write(data)
	return err
}
