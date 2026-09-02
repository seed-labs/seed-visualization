package dockerapi

import "testing"

func TestShortID(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "empty", in: "", want: ""},
		{name: "short", in: "abc123", want: "abc123"},
		{name: "long", in: "0123456789abcdef", want: "0123456789ab"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ShortID(tt.in); got != tt.want {
				t.Fatalf("ShortID(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}
