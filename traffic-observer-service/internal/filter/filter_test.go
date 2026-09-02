package filter

import "testing"

func TestParseEmptyDisablesFilter(t *testing.T) {
	cfg, err := Parse("")
	if err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}

	if cfg.Enabled != 0 {
		t.Fatalf("expected empty filter to be disabled, got %d", cfg.Enabled)
	}
}

func TestParseProtocolDirectionAndQualifiers(t *testing.T) {
	cfg, err := Parse("ingress tcp src host 10.0.0.1 dst port 443")
	if err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}

	if cfg.Enabled != 1 {
		t.Fatalf("expected filter to be enabled")
	}
	if cfg.Direction != DirectionIngress {
		t.Fatalf("expected ingress direction, got %d", cfg.Direction)
	}
	if cfg.IPProto != ProtoTCP {
		t.Fatalf("expected tcp protocol, got %d", cfg.IPProto)
	}
	if cfg.MatchSrcIP != 1 || cfg.SrcIP != 0x0100000a {
		t.Fatalf("expected source ip 10.0.0.1, match=%d value=0x%x", cfg.MatchSrcIP, cfg.SrcIP)
	}
	if cfg.MatchDstPort != 1 || cfg.DstPort != 443 {
		t.Fatalf("expected destination port 443, match=%d value=%d", cfg.MatchDstPort, cfg.DstPort)
	}
}

func TestParseHostAndPortMatchEitherSide(t *testing.T) {
	cfg, err := Parse("icmp host 10.0.0.8 and port 8080")
	if err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}

	if cfg.IPProto != ProtoICMP {
		t.Fatalf("expected icmp protocol, got %d", cfg.IPProto)
	}
	if cfg.MatchSrcIP != 1 || cfg.MatchDstIP != 1 || cfg.SrcIP != cfg.DstIP {
		t.Fatalf("expected host to match both source and destination")
	}
	if cfg.MatchSrcPort != 1 || cfg.MatchDstPort != 1 || cfg.SrcPort != 8080 || cfg.DstPort != 8080 {
		t.Fatalf("expected port to match both source and destination")
	}
}

func TestParseRejectsInvalidExpressions(t *testing.T) {
	cases := []string{
		"src host not-an-ip",
		"dst port 70000",
		"src mac aa:bb:cc:dd:ee:ff",
		"tcp nonsense",
	}

	for _, expr := range cases {
		t.Run(expr, func(t *testing.T) {
			if _, err := Parse(expr); err == nil {
				t.Fatalf("expected Parse(%q) to fail", expr)
			}
		})
	}
}
