package terminal

import (
	"os"
)

// HistoryProvider defines the interface for terminal output history storage
type HistoryProvider interface {
	Write(p []byte) (n int, err error)
	GetHistory() []byte
}

// PTYService defines the interface for PTY operations (for testability)
type PTYService interface {
	Start(cmd string) (*os.File, error)
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
}

// ClientMessage represents a message from a WebSocket client
type ClientMessage struct {
	Type string `json:"type"` // "input" or "resize"
	Data string `json:"data,omitempty"`
	Cols int    `json:"cols,omitempty"`
	Rows int    `json:"rows,omitempty"`
}
