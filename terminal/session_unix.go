//go:build !windows

package terminal

import (
	"log"
	"os/exec"
	"syscall"
)

// sendSignalToProcess sends a signal to a process (Unix-specific implementation)
func sendSignalToProcess(cmd *exec.Cmd) error {
	if cmd != nil && cmd.Process != nil {
		if err := cmd.Process.Signal(syscall.SIGWINCH); err != nil {
			// Log but don't fail - process may have already exited
			log.Printf("Warning: failed to send SIGWINCH: %v", err)
		}
	}
	return nil
}
