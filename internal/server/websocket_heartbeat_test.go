package server

import (
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"net/http"
	"net/http/httptest"

	"github.com/gorilla/websocket"
	"github.com/iwanhae/terminal-hub/terminal"
)

type pipePTYService struct {
	reader *os.File
}

func (p *pipePTYService) Start(_ string) (*os.File, error) {
	return p.reader, nil
}

func (p *pipePTYService) StartWithConfig(_ string, _ string, _ map[string]string) (*os.File, *exec.Cmd, error) {
	return p.reader, nil, nil
}

func (p *pipePTYService) SetSize(_ *os.File, _ int, _ int) error {
	return nil
}

func createWebSocketHeartbeatTestServer(t *testing.T) (*httptest.Server, string, *os.File) {
	t.Helper()

	ptyReader, ptyWriter, err := os.Pipe()
	if err != nil {
		t.Fatalf("failed to create PTY pipe: %v", err)
	}

	sessionManager = terminal.NewSessionManager()
	sessionID := "ws-heartbeat-test"
	_, err = sessionManager.CreateSession(terminal.SessionConfig{
		ID:         sessionID,
		Name:       "ws-heartbeat-test",
		Backend:    terminal.SessionBackendPTY,
		PTYService: &pipePTYService{reader: ptyReader},
	})
	if err != nil {
		_ = ptyReader.Close()
		_ = ptyWriter.Close()
		t.Fatalf("failed to create test session: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/ws/", handleWebSocket)
	server := httptest.NewServer(mux)

	t.Cleanup(func() {
		server.Close()
		_ = sessionManager.CloseAll()
		_ = ptyWriter.Close()
		_ = ptyReader.Close()
	})

	return server, sessionID, ptyWriter
}

func configureHeartbeatForTest(t *testing.T, writeWait, pongWait, pingPeriod time.Duration) {
	t.Helper()

	prevWriteWait := websocketWriteWait
	prevPongWait := websocketPongWait
	prevPingPeriod := websocketPingPeriod

	websocketWriteWait = writeWait
	websocketPongWait = pongWait
	websocketPingPeriod = pingPeriod

	t.Cleanup(func() {
		websocketWriteWait = prevWriteWait
		websocketPongWait = prevPongWait
		websocketPingPeriod = prevPingPeriod
	})
}

func dialWebSocketTestConn(t *testing.T, serverURL string, sessionID string) *websocket.Conn {
	t.Helper()

	wsURL := "ws" + strings.TrimPrefix(serverURL, "http") + "/ws/" + sessionID
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("failed to dial websocket: %v", err)
	}

	t.Cleanup(func() {
		_ = conn.Close()
	})

	return conn
}

func TestWebSocketHeartbeatClosesConnectionWithoutPong(t *testing.T) {
	configureHeartbeatForTest(t, 500*time.Millisecond, 350*time.Millisecond, 100*time.Millisecond)
	server, sessionID, _ := createWebSocketHeartbeatTestServer(t)
	conn := dialWebSocketTestConn(t, server.URL, sessionID)

	// Override ping behavior to simulate clients that stop responding while still connected.
	conn.SetPingHandler(func(_ string) error {
		return nil
	})

	readErrCh := make(chan error, 1)
	go func() {
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				readErrCh <- err
				return
			}
		}
	}()

	select {
	case err := <-readErrCh:
		if err == nil {
			t.Fatalf("expected read error after heartbeat timeout")
		}
	case <-time.After(3 * time.Second):
		t.Fatalf("expected websocket to close when client does not send pong")
	}
}

func TestWebSocketHeartbeatKeepsResponsiveClientConnected(t *testing.T) {
	configureHeartbeatForTest(t, 500*time.Millisecond, 350*time.Millisecond, 100*time.Millisecond)
	server, sessionID, _ := createWebSocketHeartbeatTestServer(t)
	conn := dialWebSocketTestConn(t, server.URL, sessionID)

	readErrCh := make(chan error, 1)
	go func() {
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				readErrCh <- err
				return
			}
		}
	}()

	// Stay connected well past pong wait while the client read loop handles ping frames.
	time.Sleep(900 * time.Millisecond)

	if err := conn.WriteJSON(terminal.ClientMessage{
		Type: "resize",
		Cols: 80,
		Rows: 24,
	}); err != nil {
		t.Fatalf("expected responsive client to remain connected, got write error: %v", err)
	}

	select {
	case err := <-readErrCh:
		t.Fatalf("unexpected websocket closure for responsive client: %v", err)
	default:
	}
}
