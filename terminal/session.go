package terminal

import (
	"io"
	"log"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"time"

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

	// Metadata
	metadata   SessionMetadata
	metadataMu sync.RWMutex

	// Terminal dimensions
	termCols   int
	termRows   int
	termSizeMu sync.RWMutex

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
	ID               string
	Name             string
	Shell            string
	WorkingDirectory string
	Command          string
	EnvVars          map[string]string
	HistorySize      int
	PTYService       PTYService
}

// NewTerminalSession creates a new terminal session
func NewTerminalSession(config SessionConfig) (*TerminalSession, error) {
	if config.Shell == "" {
		config.Shell = os.Getenv("SHELL")
		if config.Shell == "" {
			config.Shell = "bash"
		}
	}

	if config.Name == "" {
		config.Name = config.ID
	}

	if config.HistorySize == 0 {
		config.HistorySize = 4096 // 4KB default
	}

	ptySvc := config.PTYService
	if ptySvc == nil {
		ptySvc = &DefaultPTYService{}
	}

	// Start the shell with PTY
	ptmx, cmd, err := ptySvc.StartWithConfig(config.Shell, config.WorkingDirectory, config.EnvVars)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	session := &TerminalSession{
		id:      config.ID,
		ptyFile: ptmx,
		cmd:     cmd,
		history: NewInMemoryHistory(config.HistorySize),
		ptySvc:  ptySvc,
		metadata: SessionMetadata{
			Name:             config.Name,
			CreatedAt:        now,
			LastActivityAt:   now,
			ClientCount:      0,
			WorkingDirectory: config.WorkingDirectory,
		},
		termCols:       80, // Default size
		termRows:       24,
		clients:        make(map[WebSocketClient]bool),
		broadcast:      make(chan []byte, 256),
		orderedClients: make([]WebSocketClient, 0),
		closed:         false,
	}

	// Start PTY reader goroutine
	go session.readPTY()

	// Start broadcaster goroutine
	go session.broadcastLoop()

	// Execute initial command if provided
	if config.Command != "" {
		go func() {
			time.Sleep(100 * time.Millisecond) // Small delay to ensure PTY is ready
			if _, err := session.Write([]byte(config.Command + "\n")); err != nil {
				log.Printf("Error writing initial command: %v", err)
			}
		}()
	}

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

	// Update metadata
	s.metadataMu.Lock()
	s.metadata.ClientCount = len(s.clients)
	s.metadata.LastActivityAt = time.Now()
	s.metadataMu.Unlock()

	// Send history to new client
	hist := s.history.GetHistory()
	if len(hist) > 0 {
		if err := client.Send(hist); err != nil {
			log.Printf("Error sending history to client: %v", err)
		}
	}

	// Send SIGWINCH to trigger redraw for applications like htop
	if s.cmd != nil && s.cmd.Process != nil {
		if err := s.cmd.Process.Signal(syscall.SIGWINCH); err != nil {
			// Log but don't fail - process may have already exited
			log.Printf("Warning: failed to send SIGWINCH: %v", err)
		}
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
	isPrimary := len(s.orderedClients) > 0 && s.orderedClients[0] == client

	for i, c := range s.orderedClients {
		if c == client {
			s.orderedClients = append(s.orderedClients[:i], s.orderedClients[i+1:]...)
			break
		}
	}

	// Update metadata
	s.metadataMu.Lock()
	s.metadata.ClientCount = len(s.clients)
	s.metadata.LastActivityAt = time.Now()
	s.metadataMu.Unlock()

	// If the primary client changed, resize the PTY to the current dimensions
	if isPrimary && len(s.orderedClients) > 0 {
		s.termSizeMu.RLock()
		cols, rows := s.termCols, s.termRows
		s.termSizeMu.RUnlock()
		if err := s.ptySvc.SetSize(s.ptyFile, cols, rows); err != nil {
			log.Printf("Error resizing PTY after primary client change: %v", err)
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

	// Update last activity time
	s.metadataMu.Lock()
	s.metadata.LastActivityAt = time.Now()
	s.metadataMu.Unlock()

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

	// Store the terminal dimensions
	s.termSizeMu.Lock()
	changed := s.termCols != cols || s.termRows != rows
	s.termCols = cols
	s.termRows = rows
	s.termSizeMu.Unlock()

	if !changed {
		// Force redraw by toggling size slightly if it's the same
		// This ensures SIGWINCH is sent even if the terminal size hasn't changed
		// which often happens on page refresh.
		if err := s.ptySvc.SetSize(s.ptyFile, cols, rows+1); err != nil {
			log.Printf("Error forcing PTY resize: %v", err)
		}
		return s.ptySvc.SetSize(s.ptyFile, cols, rows)
	}

	return s.ptySvc.SetSize(s.ptyFile, cols, rows)
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
		if err := client.Close(); err != nil {
			log.Printf("Error closing client: %v", err)
		}
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
		if err := s.cmd.Process.Kill(); err != nil {
			log.Printf("Error killing shell process: %v", err)
		}
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

// GetMetadata returns the session metadata
func (s *TerminalSession) GetMetadata() SessionMetadata {
	s.metadataMu.RLock()
	defer s.metadataMu.RUnlock()
	return s.metadata
}

// updateName updates the session name (called by SessionManager via type assertion)
func (s *TerminalSession) updateName(name string) {
	s.metadataMu.Lock()
	defer s.metadataMu.Unlock()
	s.metadata.Name = name
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
		if _, err := s.history.Write(data); err != nil {
			log.Printf("Error writing to history: %v", err)
		}

		// Broadcast to all clients - hold lock to prevent race with Close()
		s.closeMu.Lock()
		closed = s.closed
		if !closed {
			select {
			case s.broadcast <- data:
			default:
				// Channel buffer full (shouldn't happen with size 256), skip
			}
		}
		s.closeMu.Unlock()
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
				if closeErr := client.Close(); closeErr != nil {
					log.Printf("Error closing client after send failure: %v", closeErr)
				}
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

// StartWithConfig starts a new shell with PTY using the provided configuration
func (d *DefaultPTYService) StartWithConfig(shell string, workingDir string, envVars map[string]string) (*os.File, *exec.Cmd, error) {
	cmd := exec.Command(shell)

	// Set working directory if provided
	if workingDir != "" {
		cmd.Dir = workingDir
	}

	// Start with current environment
	cmd.Env = os.Environ()

	// Set default TERM to xterm-256color for proper color support
	// Set COLORTERM to truecolor to advertise 24-bit color support
	// Users can override these by passing their own values in envVars
	termSet := false
	colortermSet := false
	for k, v := range envVars {
		cmd.Env = append(cmd.Env, k+"="+v)
		if k == "TERM" {
			termSet = true
		}
		if k == "COLORTERM" {
			colortermSet = true
		}
	}
	if !termSet {
		cmd.Env = append(cmd.Env, "TERM=xterm-256color")
	}
	if !colortermSet {
		cmd.Env = append(cmd.Env, "COLORTERM=truecolor")
	}

	// Start with PTY
	ptmx, err := pty.Start(cmd)
	if err != nil {
		return nil, nil, err
	}

	return ptmx, cmd, nil
}

// SetSize sets the PTY window size
func (d *DefaultPTYService) SetSize(file *os.File, cols, rows int) error {
	return pty.Setsize(file, &pty.Winsize{
		Cols: uint16(cols),
		Rows: uint16(rows),
	})
}
