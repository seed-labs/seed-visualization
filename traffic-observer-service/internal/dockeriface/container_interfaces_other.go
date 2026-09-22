//go:build !linux

package dockeriface

import (
	"context"
	"fmt"
)

func containerInterfaces(_ context.Context, _ int) ([]containerInterface, error) {
	return nil, fmt.Errorf("container network interface discovery requires Linux")
}
