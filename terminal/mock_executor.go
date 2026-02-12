package terminal

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// CommandExecutor is an interface for executing commands, allowing mocking in tests
type CommandExecutor interface {
	Execute(ctx context.Context, command string, workingDir string, envVars map[string]string) (stdout string, stderr string, exitCode int, err error)
}

// RealCommandExecutor executes actual shell commands
type RealCommandExecutor struct{}

func (r *RealCommandExecutor) Execute(ctx context.Context, command string, workingDir string, envVars map[string]string) (string, string, int, error) {
	// This is implemented in CronExecutor.buildCommand and execution logic
	// The real implementation doesn't use this interface directly
	return "", "", 0, fmt.Errorf("use CronExecutor.Execute instead")
}

// MockCommandExecutor simulates command execution for testing
type MockCommandExecutor struct {
	mu           sync.RWMutex
	executedCmds []string
	results      map[string]MockCommandResult
	defaultResult MockCommandResult
	onExecute    func(command string) MockCommandResult
}

// MockCommandResult represents a mocked command execution result
type MockCommandResult struct {
	Stdout   string
	Stderr   string
	ExitCode int
	Error    error
	Delay    time.Duration // Simulated execution time
}

// NewMockCommandExecutor creates a new mock command executor
func NewMockCommandExecutor() *MockCommandExecutor {
	return &MockCommandExecutor{
		executedCmds: make([]string, 0),
		results:      make(map[string]MockCommandResult),
		defaultResult: MockCommandResult{
			Stdout:   "",
			ExitCode: 0,
		},
	}
}

// SetResult sets the result for a specific command pattern
func (m *MockCommandExecutor) SetResult(commandPattern string, result MockCommandResult) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.results[commandPattern] = result
}

// SetDefaultResult sets the default result for unmatched commands
func (m *MockCommandExecutor) SetDefaultResult(result MockCommandResult) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.defaultResult = result
}

// SetOnExecute sets a callback function to determine results dynamically
func (m *MockCommandExecutor) SetOnExecute(fn func(command string) MockCommandResult) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onExecute = fn
}

// Execute simulates command execution
func (m *MockCommandExecutor) Execute(ctx context.Context, command string, workingDir string, envVars map[string]string) (string, string, int, error) {
	m.mu.Lock()
	m.executedCmds = append(m.executedCmds, command)
	m.mu.Unlock()

	// Check for context cancellation first
	select {
	case <-ctx.Done():
		return "", "", -1, ctx.Err()
	default:
	}

	// Determine the result
	var result MockCommandResult

	m.mu.RLock()
	if m.onExecute != nil {
		result = m.onExecute(command)
	} else if r, ok := m.results[command]; ok {
		result = r
	} else {
		// Check for pattern matches (e.g., "sleep*" for any sleep command)
		for pattern, r := range m.results {
			if len(command) >= len(pattern) && command[:len(pattern)] == pattern {
				result = r
				break
			}
		}
		if result == (MockCommandResult{}) {
			result = m.defaultResult
		}
	}
	m.mu.RUnlock()

	// Simulate execution delay (but respect context cancellation)
	if result.Delay > 0 {
		select {
		case <-time.After(result.Delay):
		case <-ctx.Done():
			return "", "", -1, ctx.Err()
		}
	}

	// Check context again before returning
	select {
	case <-ctx.Done():
		return "", "", -1, ctx.Err()
	default:
	}

	return result.Stdout, result.Stderr, result.ExitCode, result.Error
}

// GetExecutedCommands returns all commands that were executed
func (m *MockCommandExecutor) GetExecutedCommands() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	copies := make([]string, len(m.executedCmds))
	copy(copies, m.executedCmds)
	return copies
}

// Reset clears all recorded commands and results
func (m *MockCommandExecutor) Reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.executedCmds = make([]string, 0)
	m.results = make(map[string]MockCommandResult)
	m.onExecute = nil
}
