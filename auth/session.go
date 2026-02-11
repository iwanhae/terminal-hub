package auth

import (
	"crypto/rand"
	"crypto/subtle"
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
	sessions        map[string]*Session
	mu              sync.RWMutex
	ttl             time.Duration
	username        string
	passwordHash    string
	usingPlaintext  bool // true if password is stored as plaintext (from env vars)
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

// NewSessionManager creates a new session manager with plaintext password
// This is the legacy constructor for environment variable-based credentials
func NewSessionManager(username, password string, ttl time.Duration) *SessionManager {
	sm := &SessionManager{
		sessions:       make(map[string]*Session),
		ttl:            ttl,
		username:       username,
		passwordHash:   password, // Store as-is (plaintext for env var case)
		usingPlaintext: true,     // Mark as plaintext for timing-safe comparison
	}
	go sm.cleanupExpired()
	return sm
}

// NewSessionManagerFromHash creates a new session manager with a pre-hashed password
// Use this when loading credentials from a password file with bcrypt hashes
func NewSessionManagerFromHash(username, passwordHash string, ttl time.Duration) *SessionManager {
	sm := &SessionManager{
		sessions:       make(map[string]*Session),
		ttl:            ttl,
		username:       username,
		passwordHash:   passwordHash,
		usingPlaintext: false, // bcrypt hash, use bcrypt comparison
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

// ValidateCredentials checks username/password using timing-safe comparison
func (sm *SessionManager) ValidateCredentials(username, password string) bool {
	// Early exit if not configured
	if sm.username == "" || sm.passwordHash == "" {
		return false
	}

	// Timing-safe username comparison
	if subtle.ConstantTimeCompare([]byte(username), []byte(sm.username)) != 1 {
		return false
	}

	// Password comparison depends on storage format
	if sm.usingPlaintext {
		// Plaintext (from env vars): use timing-safe comparison
		return subtle.ConstantTimeCompare([]byte(password), []byte(sm.passwordHash)) == 1
	}

	// bcrypt hash: use bcrypt's built-in constant-time comparison
	return ValidatePassword(password, sm.passwordHash)
}

// IsConfigured returns true if auth is enabled
func (sm *SessionManager) IsConfigured() bool {
	return sm.username != "" && sm.passwordHash != ""
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
