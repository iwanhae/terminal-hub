package terminal

import (
	"os"
	"os/exec"
	"time"
)

// HistoryProvider defines the interface for terminal output history storage
type HistoryProvider interface {
	Write(p []byte) (n int, err error)
	GetHistory() []byte
}

// PTYService defines the interface for PTY operations (for testability)
type PTYService interface {
	Start(cmd string) (*os.File, error)
	StartWithConfig(shell string, workingDir string, envVars map[string]string) (*os.File, *exec.Cmd, error)
	SetSize(file *os.File, cols, rows int) error
}

// WebSocketClient defines the interface for WebSocket client connections
type WebSocketClient interface {
	Send(data []byte) error
	Close() error
}

// Session represents a managed terminal session interface
type Session interface {
	ID() string
	AddClient(client WebSocketClient) error
	RemoveClient(client WebSocketClient)
	Write(data []byte) (int, error)
	Resize(client WebSocketClient, cols, rows int) error
	Close() error
	ClientCount() int
	GetMetadata() SessionMetadata
}

// ClientMessage represents a message from a WebSocket client
type ClientMessage struct {
	Type string `json:"type"` // "input" or "resize"
	Data string `json:"data,omitempty"`
	Cols int    `json:"cols,omitempty"`
	Rows int    `json:"rows,omitempty"`
}

// SessionMetadata holds runtime information about a session
type SessionMetadata struct {
	Name            string    `json:"name"`
	CreatedAt       time.Time `json:"created_at"`
	LastActivityAt  time.Time `json:"last_activity_at"`
	ClientCount     int       `json:"client_count"`
	WorkingDirectory string   `json:"working_directory,omitempty"`
}

// CreateSessionRequest represents a request to create a new session
type CreateSessionRequest struct {
	Name            string            `json:"name"`                       // Required: User-friendly name
	WorkingDirectory string           `json:"working_directory,omitempty"` // Optional: Initial working directory
	Command         string            `json:"command,omitempty"`           // Optional: Initial command to run
	EnvVars         map[string]string `json:"env_vars,omitempty"`          // Optional: Environment variables
	ShellPath       string            `json:"shell_path,omitempty"`        // Optional: Custom shell path
}

// UpdateSessionRequest represents a request to update a session
type UpdateSessionRequest struct {
	Name string `json:"name"` // Required: New session name
}

// SessionInfo represents information about a session for API responses
type SessionInfo struct {
	ID              string           `json:"id"`
	Metadata        SessionMetadata  `json:"metadata"`
}

// CreateSessionResponse represents the response when creating a session
type CreateSessionResponse struct {
	ID       string          `json:"id"`
	Metadata SessionMetadata `json:"metadata"`
}
