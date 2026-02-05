//go:build windows

package terminal

import (
	"os/exec"
)

// sendSignalToProcess sends a signal to a process (Windows-specific stub implementation)
// SIGWINCH is not available on Windows, so this is a no-op
func sendSignalToProcess(cmd *exec.Cmd) error {
	// SIGWINCH is not available on Windows
	return nil
}
