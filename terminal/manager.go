package terminal

import (
	"errors"
	"sort"
	"sync"
)

// SessionManager manages multiple terminal sessions
type SessionManager struct {
	sessions map[string]Session
	mu       sync.RWMutex
}

// NewSessionManager creates a new session manager
func NewSessionManager() *SessionManager {
	return &SessionManager{
		sessions: make(map[string]Session),
	}
}

// GetOrCreate retrieves an existing session or creates a new one
func (sm *SessionManager) GetOrCreate(sessionID string) (Session, error) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	// Check if session exists
	if sess, ok := sm.sessions[sessionID]; ok {
		return sess, nil
	}

	// Create new session
	sess, err := NewTerminalSession(SessionConfig{
		ID: sessionID,
	})
	if err != nil {
		return nil, err
	}

	sm.sessions[sessionID] = sess
	return sess, nil
}

// Get retrieves a session if it exists
func (sm *SessionManager) Get(sessionID string) (Session, bool) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	sess, ok := sm.sessions[sessionID]
	return sess, ok
}

// Remove removes and closes a session
func (sm *SessionManager) Remove(sessionID string) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	sess, ok := sm.sessions[sessionID]
	if !ok {
		return errors.New("session not found")
	}

	// Close the session
	if err := sess.Close(); err != nil {
		return err
	}

	delete(sm.sessions, sessionID)
	return nil
}

// CloseAll closes all sessions
func (sm *SessionManager) CloseAll() error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	var lastErr error
	for id, sess := range sm.sessions {
		if err := sess.Close(); err != nil {
			lastErr = err
		}
		delete(sm.sessions, id)
	}

	return lastErr
}

// SessionCount returns the number of active sessions
func (sm *SessionManager) SessionCount() int {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	return len(sm.sessions)
}

// ListSessions returns a list of all session IDs
func (sm *SessionManager) ListSessions() []string {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	ids := make([]string, 0, len(sm.sessions))
	for id := range sm.sessions {
		ids = append(ids, id)
	}
	return ids
}

// ListSessionsInfo returns information about all sessions, sorted by newest first
func (sm *SessionManager) ListSessionsInfo() []SessionInfo {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	infos := make([]SessionInfo, 0, len(sm.sessions))
	for id, sess := range sm.sessions {
		info := SessionInfo{
			ID:       id,
			Metadata: sess.GetMetadata(),
		}
		infos = append(infos, info)
	}

	// Sort by creation time, newest first
	sort.Slice(infos, func(i, j int) bool {
		return infos[i].Metadata.CreatedAt.After(infos[j].Metadata.CreatedAt)
	})

	return infos
}

// CreateSession creates a new session with the given configuration
func (sm *SessionManager) CreateSession(config SessionConfig) (Session, error) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	// Check if session with this ID already exists
	if _, ok := sm.sessions[config.ID]; ok {
		return nil, errors.New("session already exists")
	}

	// Create new session
	sess, err := NewTerminalSession(config)
	if err != nil {
		return nil, err
	}

	sm.sessions[config.ID] = sess
	return sess, nil
}

// UpdateSessionName updates the name of a session
func (sm *SessionManager) UpdateSessionName(sessionID string, name string) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	sess, ok := sm.sessions[sessionID]
	if !ok {
		return errors.New("session not found")
	}

	// Type assert to *TerminalSession to access updateName method
	if terminalSess, ok := sess.(*TerminalSession); ok {
		terminalSess.updateName(name)
		return nil
	}

	return errors.New("session is not a TerminalSession")
}
