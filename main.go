package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/iwanhae/terminal-hub/auth"
	"github.com/iwanhae/terminal-hub/frontend/dist"
	"github.com/iwanhae/terminal-hub/terminal"
)

var Version string // Set via ldflags during build

// WebSocketClientImpl implements terminal.WebSocketClient for gorilla/websocket
type WebSocketClientImpl struct {
	conn *websocket.Conn
	send chan []byte
	mu   sync.Mutex
}

// Send sends data to the WebSocket client
func (c *WebSocketClientImpl) Send(data []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.send == nil {
		return websocket.ErrCloseSent
	}

	select {
	case c.send <- data:
		return nil
	case <-time.After(2 * time.Second):
		return os.ErrDeadlineExceeded
	}
}

// Close closes the WebSocket connection
func (c *WebSocketClientImpl) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.send != nil {
		close(c.send)
		c.send = nil
	}
	return c.conn.Close()
}

var sessionManager *terminal.SessionManager

// -- WebSocket --

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all for demo
	},
}

// sessionAuthMiddleware validates session cookies
func sessionAuthMiddleware(next http.HandlerFunc, sm *auth.SessionManager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Skip auth if not configured
		if !sm.IsConfigured() {
			next(w, r)
			return
		}

		// Extract session cookie
		cookie, err := r.Cookie("session_token")
		if err != nil {
			if isAPIRequest(r) {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
			} else {
				http.Redirect(w, r, "/login", http.StatusSeeOther)
			}
			return
		}

		// Validate session
		_, valid := sm.ValidateSession(cookie.Value)
		if !valid {
			// Clear invalid cookie
			http.SetCookie(w, &http.Cookie{
				Name:     "session_token",
				Value:    "",
				MaxAge:   -1,
				HttpOnly: true,
				Secure:   isSecure(r),
				SameSite: http.SameSiteLaxMode,
				Path:     "/",
			})

			if isAPIRequest(r) {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
			} else {
				http.Redirect(w, r, "/login", http.StatusSeeOther)
			}
			return
		}

		next(w, r)
	}
}

// isPublicPath checks if a path should bypass authentication
// This includes the login page and static assets needed for the SPA
func isPublicPath(path string) bool {
	// Trim trailing slashes for consistent comparison
	trimmedPath := strings.TrimSuffix(path, "/")

	// Login page (client-side React route)
	if trimmedPath == "/login" {
		return true
	}

	// Static assets required for SPA
	publicPrefixes := []string{"/assets/"}
	for _, prefix := range publicPrefixes {
		if strings.HasPrefix(path, prefix) {
			return true
		}
	}

	// Public files (from frontend/dist/)
	// NOTE: This list should be kept in sync with frontend build output.
	// These are root-level files that don't fall under /assets/ but are needed
	// for PWA support (manifest, service worker) and branding (icons).
	publicFiles := []string{"/manifest.webmanifest", "/sw.js", "/vite.svg", "/terminal-hub-icon.svg", "/terminal-hub-icon-180.png", "/terminal-hub-icon-192.png", "/terminal-hub-icon-512.png"}
	for _, file := range publicFiles {
		if path == file {
			return true
		}
	}

	return false
}

// isAPIRequest checks if request is for API/WebSocket
func isAPIRequest(r *http.Request) bool {
	return strings.HasPrefix(r.URL.Path, "/api/") ||
		strings.HasPrefix(r.URL.Path, "/ws/")
}

// isSecure checks if using HTTPS
func isSecure(r *http.Request) bool {
	return r.URL.Scheme == "https" ||
		r.Header.Get("X-Forwarded-Proto") == "https"
}

// handleLogin handles POST /api/auth/login
func handleLogin(w http.ResponseWriter, r *http.Request, sm *auth.SessionManager) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req auth.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	// Validate credentials
	if !sm.ValidateCredentials(req.Username, req.Password) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(auth.LoginResponse{
			Success: false,
			Message: "Invalid username or password",
		})
		return
	}

	// Create session
	session, err := sm.CreateSession(req.Username)
	if err != nil {
		log.Printf("Error creating session: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Set secure cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    session.ID,
		Expires:  time.Now().Add(24 * time.Hour),
		HttpOnly: true,
		Secure:   isSecure(r),
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(auth.LoginResponse{
		Success: true,
		Message: "Login successful",
	})
}

// handleLogout handles POST /api/auth/logout
func handleLogout(w http.ResponseWriter, r *http.Request, sm *auth.SessionManager) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Delete session
	if cookie, err := r.Cookie("session_token"); err == nil {
		sm.DeleteSession(cookie.Value)
	}

	// Clear cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    "",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   isSecure(r),
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// handleAuthStatus handles GET /api/auth/status
func handleAuthStatus(w http.ResponseWriter, r *http.Request, sm *auth.SessionManager) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// If authentication is not configured, allow access without a session
	if !sm.IsConfigured() {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"authenticated": true,
			"username":      "",
		})
		return
	}

	cookie, err := r.Cookie("session_token")
	authenticated := false
	username := ""

	if err == nil {
		if session, valid := sm.ValidateSession(cookie.Value); valid {
			authenticated = true
			username = session.Username
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"authenticated": authenticated,
		"username":      username,
	})
}

// InitSessionManager initializes the global session manager
func InitSessionManager() error {
	sessionManager = terminal.NewSessionManager()
	return nil
}

// -- REST API Handlers --

// handleListSessions handles GET /api/sessions
func handleListSessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sessions := sessionManager.ListSessionsInfo()

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(sessions); err != nil {
		log.Printf("Error encoding sessions: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
	}
}

// handleCreateSession handles POST /api/sessions
func handleCreateSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req terminal.CreateSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("Error decoding request: %v", err)
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	// Validate request
	if req.Name == "" {
		http.Error(w, "Name is required", http.StatusBadRequest)
		return
	}

	// Generate a unique session ID
	sessionID := uuid.New().String()

	// Create session config
	config := terminal.SessionConfig{
		ID:               sessionID,
		Name:             req.Name,
		WorkingDirectory: req.WorkingDirectory,
		Command:          req.Command,
		EnvVars:          req.EnvVars,
		Shell:            req.ShellPath,
		HistorySize:      4096,
	}

	// Create the session
	sess, err := sessionManager.CreateSession(config)
	if err != nil {
		log.Printf("Error creating session: %v", err)
		http.Error(w, "Failed to create session", http.StatusInternalServerError)
		return
	}

	// Prepare response
	resp := terminal.CreateSessionResponse{
		ID:       sess.ID(),
		Metadata: sess.GetMetadata(),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("Error encoding response: %v", err)
	}
}

// handleDeleteSession handles DELETE /api/sessions/:id
func handleDeleteSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract session ID from URL path
	// URL format: /api/sessions/:id
	path := strings.TrimPrefix(r.URL.Path, "/api/sessions/")
	sessionID := strings.TrimSuffix(path, "/")

	if sessionID == "" {
		http.Error(w, "Session ID is required", http.StatusBadRequest)
		return
	}

	// Remove the session
	if err := sessionManager.Remove(sessionID); err != nil {
		log.Printf("Error removing session: %v", err)
		http.Error(w, "Session not found", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// handleUpdateSession handles PUT /api/sessions/:id
func handleUpdateSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract session ID from URL path
	// URL format: /api/sessions/:id
	path := strings.TrimPrefix(r.URL.Path, "/api/sessions/")
	sessionID := strings.TrimSuffix(path, "/")

	if sessionID == "" {
		http.Error(w, "Session ID is required", http.StatusBadRequest)
		return
	}

	var req terminal.UpdateSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("Error decoding request: %v", err)
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	// Validate request
	if req.Name == "" {
		http.Error(w, "Name is required", http.StatusBadRequest)
		return
	}

	// Update the session
	if err := sessionManager.UpdateSessionName(sessionID, req.Name); err != nil {
		log.Printf("Error updating session: %v", err)
		http.Error(w, "Session not found", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// handleFileDownload handles GET /api/download
func handleFileDownload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get file path from query parameter
	filePath := r.URL.Query().Get("path")
	if filePath == "" {
		http.Error(w, "File path is required", http.StatusBadRequest)
		return
	}

	// Get optional custom filename
	filename := r.URL.Query().Get("filename")
	if filename == "" {
		filename = filepath.Base(filePath)
	}

	// Security: Clean the path to prevent directory traversal
	cleanPath := filepath.Clean(filePath)

	// Additional security: Ensure path is absolute
	if !filepath.IsAbs(cleanPath) {
		http.Error(w, "File path must be absolute", http.StatusBadRequest)
		return
	}

	// Get file info
	fileInfo, err := os.Stat(cleanPath)
	if os.IsNotExist(err) {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("Error accessing file: %v", err)
		http.Error(w, "Failed to access file", http.StatusInternalServerError)
		return
	}

	// Security: Don't allow downloading directories
	if fileInfo.IsDir() {
		http.Error(w, "Cannot download directory", http.StatusBadRequest)
		return
	}

	// File size limit check (default 100MB)
	maxFileSize := int64(100 * 1024 * 1024)
	if maxSizeStr := os.Getenv("TERMINAL_HUB_MAX_DOWNLOAD_SIZE"); maxSizeStr != "" {
		if maxSize, err := strconv.ParseInt(maxSizeStr, 10, 64); err == nil {
			maxFileSize = maxSize
		}
	}
	if fileInfo.Size() > maxFileSize {
		http.Error(w, fmt.Sprintf("File too large (max %d MB)", maxFileSize/(1024*1024)),
			http.StatusRequestEntityTooLarge)
		return
	}

	// Open the file
	file, err := os.Open(cleanPath)
	if err != nil {
		log.Printf("Error opening file: %v", err)
		http.Error(w, "Failed to open file", http.StatusInternalServerError)
		return
	}
	defer file.Close()

	// Detect content type
	contentType := mime.TypeByExtension(filepath.Ext(cleanPath))
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	// Set headers for download
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition",
		fmt.Sprintf("attachment; filename=\"%s\"", sanitizeFilename(filename)))
	w.Header().Set("Content-Length", strconv.FormatInt(fileInfo.Size(), 10))
	w.Header().Set("Cache-Control", "no-cache")

	// Stream file to client
	http.ServeContent(w, r, filename, fileInfo.ModTime(), file)

	log.Printf("File downloaded: path=%s, size=%d, filename=%s",
		cleanPath, fileInfo.Size(), filename)
}

// sanitizeFilename removes dangerous characters from filename
func sanitizeFilename(name string) string {
	name = filepath.Base(name)
	name = strings.ReplaceAll(name, "..", "")
	name = strings.ReplaceAll(name, "/", "")
	name = strings.ReplaceAll(name, "\\", "")
	reg := regexp.MustCompile(`[^a-zA-Z0-9._\s-]`)
	return reg.ReplaceAllString(name, "")
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Extract session ID from URL path
	// URL format: /ws/:sessionId
	path := strings.TrimPrefix(r.URL.Path, "/ws/")
	sessionID := strings.TrimSuffix(path, "/")

	if sessionID == "" {
		log.Println("Session ID is required")
		http.Error(w, "Session ID is required", http.StatusBadRequest)
		return
	}

	// Get the session (don't auto-create)
	sess, ok := sessionManager.Get(sessionID)
	if !ok {
		log.Printf("Session not found: %s", sessionID)
		http.Error(w, "Session not found", http.StatusNotFound)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}

	// Create WebSocket client wrapper
	wsClient := &WebSocketClientImpl{
		conn: conn,
		send: make(chan []byte, 256),
	}

	// Register client with session
	if err := sess.AddClient(wsClient); err != nil {
		log.Printf("Error adding client: %v", err)
		if closeErr := conn.Close(); closeErr != nil {
			log.Printf("Error closing connection: %v", closeErr)
		}
		return
	}

	// Handle cleanup on close
	defer func() {
		sess.RemoveClient(wsClient)
		if closeErr := wsClient.Close(); closeErr != nil {
			log.Printf("Error closing WebSocket client: %v", closeErr)
		}
		log.Printf("Client disconnected from session %s", sessionID)
	}()

	// Write pump
	go func() {
		// Set write timeout to prevent hanging on slow clients
		conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
		for {
			message, ok := <-wsClient.send
			if !ok {
				if writeErr := conn.WriteMessage(websocket.CloseMessage, []byte{}); writeErr != nil {
					log.Printf("Error writing close message: %v", writeErr)
				}
				return
			}

			// Reset write deadline before each message
			conn.SetWriteDeadline(time.Now().Add(5 * time.Second))

			w, err := conn.NextWriter(websocket.BinaryMessage)
			if err != nil {
				log.Printf("Error getting writer: %v", err)
				return
			}
			if _, err := w.Write(message); err != nil {
				log.Printf("Error writing to WebSocket: %v", err)
				return
			}
			if err := w.Close(); err != nil {
				log.Printf("Error closing writer: %v", err)
				return
			}
		}
	}()

	// Read pump
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var msg terminal.ClientMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Println("JSON parse error:", err)
			continue
		}

		switch msg.Type {
		case "input":
			if _, err := sess.Write([]byte(msg.Data)); err != nil {
				log.Printf("Error writing to session: %v", err)
			}
		case "resize":
			if err := sess.Resize(wsClient, msg.Cols, msg.Rows); err != nil {
				log.Printf("Error resizing session: %v", err)
			}
		default:
			log.Printf("Unknown message type: %s", msg.Type)
		}
	}
}

func main() {
	var addr = flag.String("addr", ":8081", "http service address")
	flag.Parse()

	// Load authentication credentials from environment
	username := os.Getenv("TERMINAL_HUB_USERNAME")
	password := os.Getenv("TERMINAL_HUB_PASSWORD")

	// Session TTL (default 24h)
	sessionTTL := 24 * time.Hour
	if ttlStr := os.Getenv("TERMINAL_HUB_SESSION_TTL"); ttlStr != "" {
		if ttl, err := time.ParseDuration(ttlStr); err == nil {
			sessionTTL = ttl
		}
	}

	// Initialize session manager
	sessionAuthManager := auth.NewSessionManager(username, password, sessionTTL)

	if sessionAuthManager.IsConfigured() {
		log.Printf("Cookie-based authentication enabled")
	} else {
		log.Printf("WARNING: No authentication configured")
	}

	if err := InitSessionManager(); err != nil {
		log.Fatal("Failed to initialize session manager:", err)
	}

	// Create a filesystem from the embedded dist files
	embeddedFS, err := fs.Sub(dist.StaticFS, ".")
	if err != nil {
		log.Fatal("Failed to create sub filesystem:", err)
	}

	// Create a file server for the embedded files
	fileServer := http.FileServer(http.FS(embeddedFS))

	// Public routes (no auth)
	http.HandleFunc("/api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		handleLogin(w, r, sessionAuthManager)
	})
	http.HandleFunc("/api/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		handleLogout(w, r, sessionAuthManager)
	})
	http.HandleFunc("/api/auth/status", func(w http.ResponseWriter, r *http.Request) {
		handleAuthStatus(w, r, sessionAuthManager)
	})

	// Serve the embedded React frontend with SPA fallback
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Check if this is a public path that should bypass authentication
		// This is safe because:
		// 1. Static assets (JS, CSS) don't contain sensitive data
		// 2. The SPA needs these files to render the login page
		// 3. Actual data protection happens at the API level
		if isPublicPath(r.URL.Path) {
			// For /login route, serve index.html for React SPA routing
			trimmedPath := strings.TrimSuffix(r.URL.Path, "/")
			if trimmedPath == "/login" {
				r.URL.Path = "/"
			}
			fileServer.ServeHTTP(w, r)
			return
		}

		// Apply authentication middleware for all other routes
		sessionAuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
			// Try to serve the requested file
			path := r.URL.Path

			// Check if the file exists in the embedded filesystem
			if _, err := embeddedFS.Open(strings.TrimPrefix(path, "/")); err == nil {
				fileServer.ServeHTTP(w, r)
				return
			}

			// If not found, serve index.html for SPA routing
			r.URL.Path = "/"
			fileServer.ServeHTTP(w, r)
		}, sessionAuthManager)(w, r)
	})

	// REST API routes
	http.HandleFunc("/api/sessions", sessionAuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		// Handle /api/sessions (GET list, POST create)
		switch r.Method {
		case http.MethodGet:
			handleListSessions(w, r)
		case http.MethodPost:
			handleCreateSession(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}, sessionAuthManager))

	// Handle /api/sessions/:id (DELETE, PUT)
	http.HandleFunc("/api/sessions/", sessionAuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		// Handle operations on specific sessions
		switch r.Method {
		case http.MethodDelete:
			handleDeleteSession(w, r)
		case http.MethodPut:
			handleUpdateSession(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}, sessionAuthManager))

	// File download endpoint (session-independent)
	http.HandleFunc("/api/download", sessionAuthMiddleware(handleFileDownload, sessionAuthManager))

	// WebSocket route - handle /ws/:sessionId
	http.HandleFunc("/ws/", sessionAuthMiddleware(handleWebSocket, sessionAuthManager))

	log.Printf("Server starting on %s", *addr)
	log.Fatal(http.ListenAndServe(*addr, nil))
}
