package auth

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

// Session represents an authenticated user session
type Session struct {
	ID           string
	Username     string
	CreatedAt    time.Time
	LastActivity time.Time
}

// SessionManager manages authenticated sessions
type SessionManager struct {
	sessions      map[string]*Session
	mu            sync.RWMutex
	ttl           time.Duration
	username      string
	password      string
}

// LoginRequest/Response types for JSON API
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// NewSessionManager creates a new session manager
func NewSessionManager(username, password string, ttl time.Duration) *SessionManager {
	sm := &SessionManager{
		sessions: make(map[string]*Session),
		ttl:      ttl,
		username: username,
		password: password,
	}
	go sm.cleanupExpired()
	return sm
}

// CreateSession creates a new session for a user
func (sm *SessionManager) CreateSession(username string) (*Session, error) {
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return nil, err
	}
	token := hex.EncodeToString(tokenBytes)

	session := &Session{
		ID:           token,
		Username:     username,
		CreatedAt:    time.Now(),
		LastActivity: time.Now(),
	}

	sm.mu.Lock()
	sm.sessions[token] = session
	sm.mu.Unlock()

	return session, nil
}

// ValidateSession checks if a session token is valid
func (sm *SessionManager) ValidateSession(token string) (*Session, bool) {
	sm.mu.RLock()
	session, exists := sm.sessions[token]
	sm.mu.RUnlock()

	if !exists || time.Since(session.LastActivity) > sm.ttl {
		return nil, false
	}

	// Update last activity (sliding expiration)
	sm.mu.Lock()
	session.LastActivity = time.Now()
	sm.mu.Unlock()

	return session, true
}

// DeleteSession removes a session
func (sm *SessionManager) DeleteSession(token string) {
	sm.mu.Lock()
	delete(sm.sessions, token)
	sm.mu.Unlock()
}

// ValidateCredentials checks username/password
func (sm *SessionManager) ValidateCredentials(username, password string) bool {
	return sm.username != "" && sm.password != "" &&
		username == sm.username && password == sm.password
}

// IsConfigured returns true if auth is enabled
func (sm *SessionManager) IsConfigured() bool {
	return sm.username != "" && sm.password != ""
}

// cleanupExpired removes stale sessions periodically
func (sm *SessionManager) cleanupExpired() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		sm.mu.Lock()
		for token, session := range sm.sessions {
			if time.Since(session.LastActivity) > sm.ttl {
				delete(sm.sessions, token)
			}
		}
		sm.mu.Unlock()
	}
}
