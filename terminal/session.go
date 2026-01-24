package terminal

import (
	"io"
	"log"
	"os"
	"os/exec"
	"sync"

	"github.com/creack/pty"
)

// InMemoryHistory implements HistoryProvider with an in-memory buffer
type InMemoryHistory struct {
	mu     sync.RWMutex
	buffer []byte
	size   int
}

// NewInMemoryHistory creates a new in-memory history buffer
func NewInMemoryHistory(size int) *InMemoryHistory {
	return &InMemoryHistory{
		size:   size,
		buffer: make([]byte, 0, size),
	}
}

// Write writes data to the history buffer
func (h *InMemoryHistory) Write(p []byte) (n int, err error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	// If new data is larger than size, just take the last 'size' bytes of it
	if len(p) > h.size {
		h.buffer = p[len(p)-h.size:]
		return len(p), nil
	}

	// If current + new > size, cut from front
	if len(h.buffer)+len(p) > h.size {
		overflow := (len(h.buffer) + len(p)) - h.size
		h.buffer = h.buffer[overflow:]
	}

	h.buffer = append(h.buffer, p...)
	return len(p), nil
}

// GetHistory returns the current history buffer
func (h *InMemoryHistory) GetHistory() []byte {
	h.mu.RLock()
	defer h.mu.RUnlock()
	// Return a copy
	out := make([]byte, len(h.buffer))
	copy(out, h.buffer)
	return out
}

// TerminalSession manages a single terminal session with PTY
type TerminalSession struct {
	id      string
	ptyFile *os.File
	cmd     *exec.Cmd
	history HistoryProvider
	ptySvc  PTYService

	// Clients management
	clients        map[WebSocketClient]bool
	clientsMu      sync.Mutex
	broadcast      chan []byte
	orderedClients []WebSocketClient

	// Lifecycle
	closed  bool
	closeMu sync.RWMutex
}

// SessionConfig holds configuration for creating a new session
type SessionConfig struct {
	ID          string
	Shell       string
	HistorySize int
	PTYService  PTYService
}

// NewTerminalSession creates a new terminal session
func NewTerminalSession(config SessionConfig) (*TerminalSession, error) {
	if config.Shell == "" {
		config.Shell = os.Getenv("SHELL")
		if config.Shell == "" {
			config.Shell = "bash"
		}
	}

	if config.HistorySize == 0 {
		config.HistorySize = 4096 // 4KB default
	}

	ptySvc := config.PTYService
	if ptySvc == nil {
		ptySvc = &DefaultPTYService{}
	}

	// Start the shell with PTY
	ptmx, err := ptySvc.Start(config.Shell)
	if err != nil {
		return nil, err
	}

	session := &TerminalSession{
		id:             config.ID,
		ptyFile:        ptmx,
		history:        NewInMemoryHistory(config.HistorySize),
		ptySvc:         ptySvc,
		clients:        make(map[WebSocketClient]bool),
		broadcast:      make(chan []byte, 256),
		orderedClients: make([]WebSocketClient, 0),
		closed:         false,
	}

	// Start PTY reader goroutine
	go session.readPTY()

	// Start broadcaster goroutine
	go session.broadcastLoop()

	return session, nil
}

// ID returns the session identifier
func (s *TerminalSession) ID() string {
	return s.id
}

// AddClient adds a new WebSocket client to the session
func (s *TerminalSession) AddClient(client WebSocketClient) error {
	s.closeMu.RLock()
	if s.closed {
		s.closeMu.RUnlock()
		return io.ErrClosedPipe
	}
	s.closeMu.RUnlock()

	s.clientsMu.Lock()
	defer s.clientsMu.Unlock()

	s.clients[client] = true
	s.orderedClients = append(s.orderedClients, client)

	// Send history to new client
	hist := s.history.GetHistory()
	if len(hist) > 0 {
		client.Send(hist)
	}

	return nil
}

// RemoveClient removes a WebSocket client from the session
func (s *TerminalSession) RemoveClient(client WebSocketClient) {
	s.clientsMu.Lock()
	defer s.clientsMu.Unlock()

	if _, ok := s.clients[client]; !ok {
		return
	}

	delete(s.clients, client)

	// Remove from ordered clients
	for i, c := range s.orderedClients {
		if c == client {
			s.orderedClients = append(s.orderedClients[:i], s.orderedClients[i+1:]...)
			break
		}
	}
}

// Write writes data to the PTY
func (s *TerminalSession) Write(data []byte) (int, error) {
	s.closeMu.RLock()
	defer s.closeMu.RUnlock()

	if s.closed {
		return 0, io.ErrClosedPipe
	}

	return s.ptyFile.Write(data)
}

// Resize resizes the terminal PTY
func (s *TerminalSession) Resize(client WebSocketClient, cols, rows int) error {
	s.closeMu.RLock()
	defer s.closeMu.RUnlock()

	if s.closed {
		return io.ErrClosedPipe
	}

	s.clientsMu.Lock()
	defer s.clientsMu.Unlock()

	// Only allow resize from the first (primary) client
	if len(s.orderedClients) > 0 {
		firstClient := s.orderedClients[0]
		if client == firstClient {
			return s.ptySvc.SetSize(s.ptyFile, cols, rows)
		}
	}

	// Ignore resize from non-primary clients
	return nil
}

// Close closes the terminal session and cleanup resources
func (s *TerminalSession) Close() error {
	s.closeMu.Lock()
	defer s.closeMu.Unlock()

	if s.closed {
		return nil
	}

	s.closed = true

	// Close all clients
	s.clientsMu.Lock()
	for client := range s.clients {
		client.Close()
		delete(s.clients, client)
	}
	s.clientsMu.Unlock()

	// Close PTY
	if s.ptyFile != nil {
		if err := s.ptyFile.Close(); err != nil {
			log.Printf("Error closing PTY: %v", err)
		}
	}

	// Kill the shell process
	if s.cmd != nil && s.cmd.Process != nil {
		s.cmd.Process.Kill()
	}

	close(s.broadcast)

	return nil
}

// ClientCount returns the number of connected clients
func (s *TerminalSession) ClientCount() int {
	s.clientsMu.Lock()
	defer s.clientsMu.Unlock()
	return len(s.clients)
}

// readPTY continuously reads from PTY and broadcasts to clients
func (s *TerminalSession) readPTY() {
	buf := make([]byte, 1024)
	for {
		s.closeMu.RLock()
		closed := s.closed
		s.closeMu.RUnlock()

		if closed {
			return
		}

		n, err := s.ptyFile.Read(buf)
		if err != nil {
			if err == io.EOF {
				log.Println("Shell process exited")
			} else {
				log.Printf("PTY read error: %v", err)
			}
			return
		}

		data := make([]byte, n)
		copy(data, buf[:n])

		// Save to history
		s.history.Write(data)

		// Broadcast to all clients
		s.broadcast <- data
	}
}

// broadcastLoop broadcasts PTY output to all connected clients
func (s *TerminalSession) broadcastLoop() {
	for {
		data, ok := <-s.broadcast
		if !ok {
			// Channel closed, exit loop
			return
		}

		s.clientsMu.Lock()
		for client := range s.clients {
			if err := client.Send(data); err != nil {
				// If send fails, close and remove the client
				client.Close()
				delete(s.clients, client)
			}
		}
		s.clientsMu.Unlock()
	}
}

// DefaultPTYService implements PTYService using creack/pty
type DefaultPTYService struct{}

// Start starts a new shell with PTY
func (d *DefaultPTYService) Start(shell string) (*os.File, error) {
	cmd := exec.Command(shell)
	return pty.Start(cmd)
}

// SetSize sets the PTY window size
func (d *DefaultPTYService) SetSize(file *os.File, cols, rows int) error {
	return pty.Setsize(file, &pty.Winsize{
		Cols: uint16(cols),
		Rows: uint16(rows),
	})
}
