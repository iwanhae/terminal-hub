package main

import (
	"encoding/json"
	"flag"
	"io/fs"
	"log"
	"net/http"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/iwanhae/terminal-hub/frontend/dist"
	"github.com/iwanhae/terminal-hub/terminal"
)

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

	select {
	case c.send <- data:
		return nil
	default:
		return c.Close()
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
		for {
			message, ok := <-wsClient.send
			if !ok {
				if writeErr := conn.WriteMessage(websocket.CloseMessage, []byte{}); writeErr != nil {
					log.Printf("Error writing close message: %v", writeErr)
				}
				return
			}
			w, err := conn.NextWriter(websocket.BinaryMessage)
			if err != nil {
				return
			}
			if _, err := w.Write(message); err != nil {
				log.Printf("Error writing to WebSocket: %v", err)
				return
			}
			if err := w.Close(); err != nil {
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

	// Serve the embedded React frontend with SPA fallback
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
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
	})

	// REST API routes
	http.HandleFunc("/api/sessions", func(w http.ResponseWriter, r *http.Request) {
		// Handle /api/sessions (GET list, POST create)
		switch r.Method {
		case http.MethodGet:
			handleListSessions(w, r)
		case http.MethodPost:
			handleCreateSession(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Handle /api/sessions/:id (DELETE)
	http.HandleFunc("/api/sessions/", func(w http.ResponseWriter, r *http.Request) {
		// Only handle DELETE operations on specific sessions
		if r.Method == http.MethodDelete {
			handleDeleteSession(w, r)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// WebSocket route - handle /ws/:sessionId
	http.HandleFunc("/ws/", handleWebSocket)

	log.Printf("Server starting on %s", *addr)
	log.Fatal(http.ListenAndServe(*addr, nil))
}
