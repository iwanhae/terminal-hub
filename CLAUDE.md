# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Terminal Hub is a web-based terminal application that provides browser-based access to a shell session through WebSocket. It consists of:

- **Backend**: Go server using gorilla/websocket for real-time communication and creack/pty for pseudo-terminal management
- **Frontend**: React + TypeScript application using xterm.js for terminal emulation
- **Architecture**: Single shared terminal session with support for multiple WebSocket clients (read-only for non-primary clients)

## Development Commands

### Building the Project
```bash
# Build both frontend and backend
make all

# Build only the frontend (React + Vite)
cd frontend && npm run build

# Build only the Go backend
make build
```

### Running the Application
```bash
# Build and run
make run

# Or run the built binary directly
./build/terminal-hub

# The server defaults to :8081, override with:
./build/terminal-hub -addr :3000
```

### Frontend Development
```bash
cd frontend
npm run dev          # Start Vite dev server (for frontend-only development)
npm run build        # Production build (generates embedded Go files)
npm run lint         # Run ESLint
```

### Testing
```bash
make test              # Run all Go tests
make test-short        # Run short tests only
make test-coverage     # Run tests with coverage report (generates coverage.html)
make test-ginkgo       # Run tests using Ginkgo test framework
make test-watch        # Watch mode for tests (requires Ginkgo)
```

### Code Quality
```bash
make fmt               # Format Go code with gofmt and goimports
make lint              # Run golangci-lint
make vet               # Run go vet
make check             # Run all checks (fmt, vet, lint, test)
```

### Dependencies
```bash
make deps              # Install Go dependencies
make deps-tools        # Install development tools (ginkgo, air, goimports, golangci-lint)
```

## Architecture

### Backend Structure

The backend follows a clean architecture with interface-based design for testability:

**main.go** (`main.go:1-186`)
- HTTP server serving embedded React frontend
- WebSocket endpoint (`/ws`) handling client connections
- `WebSocketClientImpl` bridges gorilla/websocket to the terminal's WebSocketClient interface
- Uses default session "default" for all clients (currently single-session design)

**terminal Package** (`terminal/`)

Core types and interfaces (`terminal/types.go:1-43`):
- `Session`: Interface for terminal session operations (ID, AddClient, RemoveClient, Write, Resize, Close)
- `WebSocketClient`: Interface for client connections (Send, Close)
- `PTYService`: Interface for PTY operations (Start, SetSize)
- `HistoryProvider`: Interface for output history storage (Write, GetHistory)

Session management (`terminal/manager.go:1-105`):
- `SessionManager`: Manages multiple terminal sessions with thread-safe operations
- `GetOrCreate`: Retrieves existing session or creates new one
- `Remove`, `CloseAll`, `ListSessions`: Session lifecycle management

Terminal session implementation (`terminal/session.go:1-328`):
- `TerminalSession`: Core session implementation with PTY management
- `InMemoryHistory`: Circular buffer for terminal output (default 4KB)
- `DefaultPTYService`: Production PTY implementation using creack/pty
- Broadcasts PTY output to all connected clients
- Only the first (primary) client can resize the terminal
- New clients receive historical output on connection

**Key Design Patterns**:
- Dependency injection: PTYService and HistoryProvider are injected for testability
- Interface segregation: Clean separation between WebSocket, PTY, and history concerns
- Thread safety: Mutexes protect all shared state
- Goroutine coordination: Separate goroutines for PTY reading and client broadcasting

### Frontend Structure

**App.tsx** (`frontend/src/App.tsx:1-17`)
- Determines WebSocket URL from current location (ws:// or wss:// based on protocol)
- Renders Terminal component

**Terminal.tsx** (`frontend/src/components/Terminal.tsx:1-147`)
- xterm.js terminal emulator with FitAddon for responsive sizing
- WebSocket connection with binary message support
- Sends two message types:
  - `{"type":"input","data":"..."}` - User input to terminal
  - `{"type":"resize","cols":80,"rows":24}` - Terminal resize events
- Automatic resize handling with debouncing (100ms)
- Custom dark theme configuration

### Build System

The frontend is embedded into the Go binary:
1. `frontend/dist/` contains generated Go embedding code
2. `main.go` uses `fs.Sub` to create an embedded filesystem
3. SPA routing: non-existent files fall back to index.html (`main.go:166-179`)
4. Use `make frontend-build` to regenerate embedded files after frontend changes

## Testing Framework

The project uses **Ginkgo** (BDD-style testing) with **Gomega** assertions:
- Test files: `terminal/session_test.go`
- Mock implementations: `MockWebSocketClient`, `MockPTYService`
- Run with: `make test-ginkgo`

Key test coverage:
- `InMemoryHistory`: Buffer size limits, truncation behavior
- `SessionManager`: Session lifecycle, concurrent access
- `MockWebSocketClient`: Send/receive operations, close handling

## Important Implementation Details

1. **Session Management**: Currently uses a single "default" session. The architecture supports multiple sessions via `SessionManager`, but the WebSocket handler only creates one session.

2. **Multi-Client Support**: Multiple clients can connect to the same session. New clients receive historical output. Only the first client can resize the terminal (prevents resize conflicts).

3. **PTY Lifecycle**: The PTY is started when the session is created and runs until the session is closed or the shell exits.

4. **WebSocket Binary Messages**: The frontend expects binary WebSocket messages (`arraybuffer`) for terminal output to handle UTF-8 correctly.

5. **Embedding Frontend**: Frontend changes require rebuilding the embedded Go files with `make frontend-build`.

6. **Go Version**: Requires Go 1.25.5+. The project uses modern Go features and recent dependencies.
