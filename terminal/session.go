package terminal

import (
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/creack/pty"
)

const defaultHistorySize = 4096

var errTmuxUnavailable = errors.New("tmux executable not found")

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
	backend SessionBackend

	// tmux-specific state
	tmuxSessionName string

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

	// Session rate limiting
	outputRateLimit   chan struct{}
	rateLimitMu       sync.Mutex
	lastRateLimitWarn time.Time

	// Lifecycle
	closed  bool
	closeMu sync.RWMutex
	onExit  func() // bound callback, nil if not set
}

// SessionConfig holds configuration for creating a new session
type SessionConfig struct {
	ID               string
	Name             string
	Shell            string
	WorkingDirectory string
	Command          string
	EnvVars          map[string]string
	Backend          SessionBackend
	HistorySize      int
	PTYService       PTYService
	OnExit           func(sessionID string) // Called when the underlying process exits naturally
}

type sessionStartResult struct {
	ptmx            *os.File
	cmd             *exec.Cmd
	backend         SessionBackend
	backendFallback string
	tmuxSessionName string
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
		config.HistorySize = defaultHistorySize
	}

	ptySvc := config.PTYService
	if ptySvc == nil {
		ptySvc = &DefaultPTYService{}
	}

	startResult, err := startSessionProcess(config, ptySvc)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	session := &TerminalSession{
		id:              config.ID,
		ptyFile:         startResult.ptmx,
		cmd:             startResult.cmd,
		history:         NewInMemoryHistory(config.HistorySize),
		ptySvc:          ptySvc,
		backend:         startResult.backend,
		tmuxSessionName: startResult.tmuxSessionName,
		metadata: SessionMetadata{
			Name:             config.Name,
			CreatedAt:        now,
			LastActivityAt:   now,
			ClientCount:      0,
			WorkingDirectory: config.WorkingDirectory,
			Backend:          startResult.backend,
			BackendFallback:  startResult.backendFallback,
		},
		termCols:        80, // Default size
		termRows:        24,
		clients:         make(map[WebSocketClient]bool),
		broadcast:       make(chan []byte, 256),
		orderedClients:  make([]WebSocketClient, 0),
		closed:          false,
		outputRateLimit: make(chan struct{}, 500), // Max 500 messages per second
	}

	if config.OnExit != nil {
		sessionID := config.ID
		cb := config.OnExit
		session.onExit = func() { cb(sessionID) }
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

func resolveRequestedBackend(config SessionConfig) SessionBackend {
	backend := SessionBackend(strings.ToLower(strings.TrimSpace(string(config.Backend))))
	if backend != SessionBackendPTY && backend != SessionBackendTmux {
		backend = ""
	}

	if backend == "" {
		// Tests and custom PTY implementations should remain deterministic.
		if config.PTYService != nil {
			return SessionBackendPTY
		}
		return SessionBackendTmux
	}

	return backend
}

func startSessionProcess(config SessionConfig, ptySvc PTYService) (sessionStartResult, error) {
	backend := resolveRequestedBackend(config)
	if backend == SessionBackendTmux {
		startResult, err := startTmuxSession(config)
		if err == nil {
			return startResult, nil
		}

		fallbackReason := tmuxFallbackReason(err)
		log.Printf(
			"Session %s: failed to initialize tmux backend (%v), falling back to pty",
			config.ID,
			err,
		)

		ptmx, cmd, ptyErr := ptySvc.StartWithConfig(
			config.Shell,
			config.WorkingDirectory,
			config.EnvVars,
		)
		if ptyErr != nil {
			return sessionStartResult{}, ptyErr
		}

		return sessionStartResult{
			ptmx:            ptmx,
			cmd:             cmd,
			backend:         SessionBackendPTY,
			backendFallback: fallbackReason,
		}, nil
	}

	ptmx, cmd, err := ptySvc.StartWithConfig(config.Shell, config.WorkingDirectory, config.EnvVars)
	if err != nil {
		return sessionStartResult{}, err
	}

	return sessionStartResult{
		ptmx:    ptmx,
		cmd:     cmd,
		backend: SessionBackendPTY,
	}, nil
}

func startTmuxSession(config SessionConfig) (sessionStartResult, error) {
	if _, err := exec.LookPath("tmux"); err != nil {
		return sessionStartResult{}, errTmuxUnavailable
	}

	sessionName := sanitizeTmuxSessionName(config.ID)
	args := []string{"new-session", "-A", "-s", sessionName}
	if config.WorkingDirectory != "" {
		args = append(args, "-c", config.WorkingDirectory)
	}

	// Ensure newly created tmux sessions start in the configured shell.
	args = append(args, config.Shell)

	cmd := exec.Command("tmux", args...)
	if config.WorkingDirectory != "" {
		cmd.Dir = config.WorkingDirectory
	}
	cmd.Env = buildCommandEnv(config.EnvVars)

	ptmx, err := pty.Start(cmd)
	if err != nil {
		return sessionStartResult{}, fmt.Errorf("failed to start tmux session: %w", err)
	}

	return sessionStartResult{
		ptmx:            ptmx,
		cmd:             cmd,
		backend:         SessionBackendTmux,
		tmuxSessionName: sessionName,
	}, nil
}

func sanitizeTmuxSessionName(sessionID string) string {
	trimmed := strings.TrimSpace(sessionID)
	if trimmed == "" {
		return "terminal-hub"
	}

	var builder strings.Builder
	builder.Grow(len(trimmed))
	for _, char := range trimmed {
		if unicode.IsLetter(char) || unicode.IsDigit(char) || char == '-' || char == '_' {
			builder.WriteRune(char)
			continue
		}
		builder.WriteRune('_')
	}

	name := builder.String()
	if name == "" {
		return "terminal-hub"
	}
	return name
}

func tmuxFallbackReason(err error) string {
	if errors.Is(err, errTmuxUnavailable) {
		return "tmux_not_found"
	}
	return "tmux_start_failed"
}

func buildCommandEnv(envVars map[string]string) []string {
	env := os.Environ()

	// Set default TERM/COLORTERM for consistent terminal capabilities.
	termSet := false
	colortermSet := false
	for key, value := range envVars {
		env = append(env, key+"="+value)
		if key == "TERM" {
			termSet = true
		}
		if key == "COLORTERM" {
			colortermSet = true
		}
	}
	if !termSet {
		env = append(env, "TERM=xterm-256color")
	}
	if !colortermSet {
		env = append(env, "COLORTERM=truecolor")
	}

	return env
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
	// Platform-specific: Unix systems send SIGWINCH, Windows is a no-op
	sendSignalToProcess(s.cmd)

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

	if s.backend == SessionBackendTmux && s.tmuxSessionName != "" {
		killCmd := exec.Command("tmux", "kill-session", "-t", s.tmuxSessionName)
		if err := killCmd.Run(); err != nil {
			log.Printf("Error killing tmux session %q: %v", s.tmuxSessionName, err)
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
			s.closeMu.RLock()
			alreadyClosed := s.closed
			s.closeMu.RUnlock()

			if err == io.EOF {
				log.Printf("Session %s: shell process exited", s.id)
			} else if !alreadyClosed {
				log.Printf("Session %s: PTY read error: %v", s.id, err)
			}

			if !alreadyClosed && s.onExit != nil {
				go s.onExit()
			}
			return
		}

		data := make([]byte, n)
		copy(data, buf[:n])

		// Rate limiting: only allow up to 500 messages per second
		select {
		case s.outputRateLimit <- struct{}{}:
		default:
			// Rate limit exceeded, log warning periodically
			s.rateLimitMu.Lock()
			if time.Since(s.lastRateLimitWarn) > 5*time.Second {
				log.Printf("Session %s: Output rate limit exceeded, dropping messages", s.id)
				s.lastRateLimitWarn = time.Now()
			}
			s.rateLimitMu.Unlock()
			continue
		}

		// Save to history
		if _, err := s.history.Write(data); err != nil {
			log.Printf("Error writing to history: %v", err)
		}

		// Broadcast to all clients - hold lock to prevent race with Close()
		s.closeMu.Lock()
		closed = s.closed
		if !closed {
			// BLOCKING send to broadcast channel
			// This will block reading from PTY if the channel is full (backpressure)
			// The broadcast channel is consumed by broadcastLoop, which handles
			// sending to clients with timeouts.
			s.broadcast <- data
		}
		s.closeMu.Unlock()
	}
}

// broadcastLoop broadcasts PTY output to all connected clients
func (s *TerminalSession) broadcastLoop() {
	// Use a ticker to periodically release the rate limiter
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case data, ok := <-s.broadcast:
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
					log.Printf("Session %s: Removed slow/unresponsive client", s.id)
				}
			}
			s.clientsMu.Unlock()

			// Release one token from rate limit (acts as refill)
			select {
			case <-s.outputRateLimit:
			default:
			}

		case <-ticker.C:
			// Continuously release rate limit tokens to allow normal throughput
			for i := 0; i < 5; i++ { // Release 5 tokens every 10ms = 500/sec
				select {
				case <-s.outputRateLimit:
				default:
				}
			}
		}
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

	cmd.Env = buildCommandEnv(envVars)

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
