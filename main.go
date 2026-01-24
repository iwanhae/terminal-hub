package main

import (
	"encoding/json"
	"flag"
	"io/fs"
	"log"
	"net/http"
	"strings"
	"sync"

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

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Get or create default session
	sessionID := "default" // For now, use a single default session
	sess, err := sessionManager.GetOrCreate(sessionID)
	if err != nil {
		log.Printf("Error creating session: %v", err)
		http.Error(w, "Failed to create session", http.StatusInternalServerError)
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
		conn.Close()
		return
	}

	// Handle cleanup on close
	defer func() {
		sess.RemoveClient(wsClient)
		wsClient.Close()
		log.Printf("Client disconnected from session %s", sessionID)
	}()

	// Write pump
	go func() {
		for {
			message, ok := <-wsClient.send
			if !ok {
				conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			w, err := conn.NextWriter(websocket.BinaryMessage)
			if err != nil {
				return
			}
			w.Write(message)
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

	http.HandleFunc("/ws", handleWebSocket)

	log.Printf("Server starting on %s", *addr)
	log.Fatal(http.ListenAndServe(*addr, nil))
}
