# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Terminal Hub is a web-based terminal application that provides browser-based access to shell sessions through WebSocket. It consists of:

- **Backend**: Go server using gorilla/websocket for real-time communication and creack/pty for pseudo-terminal management
- **Frontend**: React + TypeScript application using xterm.js for terminal emulation
- **Architecture**: Multi-session support with REST API for session management and WebSocket endpoints for terminal I/O

## Development Commands

### Building the Project
```bash
# Build both frontend and backend (complete build)
make build

# Build only the frontend (React + Vite)
make build-frontend

# Build only the Go backend (includes frontend)
make build-backend
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

**main.go** (`main.go:1-373`)
- HTTP server serving embedded React frontend with SPA routing fallback
- REST API endpoints for session management:
  - `GET /api/sessions` - List all sessions
  - `POST /api/sessions` - Create new session
  - `DELETE /api/sessions/:id` - Delete session
  - `PUT /api/sessions/:id` - Update session name
- WebSocket endpoint (`/ws/:sessionId`) for terminal I/O
- `WebSocketClientImpl` bridges gorilla/websocket to the terminal's WebSocketClient interface
- Session initialization via `InitSessionManager()`

**terminal Package** (`terminal/`)

Core types and interfaces (`terminal/types.go:1-82`):
- `Session`: Interface for terminal session operations (ID, AddClient, RemoveClient, Write, Resize, Close, GetMetadata)
- `WebSocketClient`: Interface for client connections (Send, Close)
- `PTYService`: Interface for PTY operations (Start, StartWithConfig, SetSize)
- `HistoryProvider`: Interface for output history storage (Write, GetHistory)
- `SessionMetadata`: Runtime session information (name, timestamps, client count, working directory)
- `CreateSessionRequest`, `UpdateSessionRequest`: API request types

Session management (`terminal/manager.go:1-160`):
- `SessionManager`: Manages multiple terminal sessions with thread-safe operations
- `GetOrCreate`: Retrieves existing session or creates new one (auto-create behavior)
- `Get`: Retrieves session without auto-creation
- `CreateSession`: Creates session with explicit configuration
- `Remove`, `CloseAll`, `ListSessions`, `ListSessionsInfo`: Session lifecycle management
- `UpdateSessionName`: Updates session metadata

Terminal session implementation (`terminal/session.go:1-456`):
- `TerminalSession`: Core session implementation with PTY management
- `InMemoryHistory`: Circular buffer for terminal output (default 4KB)
- `DefaultPTYService`: Production PTY implementation using creack/pty
- Supports custom shell, working directory, environment variables, and initial commands
- Broadcasts PTY output to all connected clients
- New clients receive historical output on connection
- Tracks session metadata including creation time and last activity

**Key Design Patterns**:
- Dependency injection: PTYService and HistoryProvider are injected for testability
- Interface segregation: Clean separation between WebSocket, PTY, and history concerns
- Thread safety: Mutexes protect all shared state (clients, metadata, terminal size, close state)
- Goroutine coordination: Separate goroutines for PTY reading and client broadcasting

### Frontend Structure

**App.tsx** (`frontend/src/App.tsx:1-38`)
- React Router setup with routes for session grid and terminal view
- SessionProvider context for global session state management
- Sidebar navigation component
- Toast notifications via react-hot-toast

**Key Components**:
- `components/Terminal.tsx`: xterm.js terminal emulator with FitAddon for responsive sizing
- `components/Sidebar.tsx`: Navigation sidebar with session list
- `components/SessionGrid.tsx`: Grid view of all sessions for management
- `components/CreateSessionDialog.tsx`: Dialog for creating new sessions
- `components/RenameSessionDialog.tsx`: Dialog for renaming sessions
- `pages/TerminalPage.tsx`: Page wrapper for terminal view
- `contexts/SessionContext.tsx`: Global state for sessions and API operations

**Terminal.tsx** (`frontend/src/components/Terminal.tsx:1-176`):
- xterm.js terminal emulator with FitAddon for responsive sizing
- WebSocket connection to `/ws/:sessionId` with binary message support
- Sends two message types:
  - `{"type":"input","data":"..."}` - User input to terminal
  - `{"type":"resize","cols":80,"rows":24}` - Terminal resize events
- Automatic resize handling with debouncing (100ms)
- Custom dark theme configuration
- ResizeObserver for responsive terminal sizing

### Build System

The frontend is embedded into the Go binary:
1. Frontend build generates files in `frontend/dist/`
2. `frontend/dist/dist.go` contains embedded filesystem code
3. `main.go` uses `fs.Sub` to create an embedded filesystem from `dist.StaticFS`
4. SPA routing: non-existent files fall back to index.html (`main.go:326-339`)
5. Frontend changes require rebuilding with `make build-frontend` or `npm run build` in the frontend directory

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

1. **Multi-Session Architecture**: The application supports multiple named sessions via REST API. Sessions are created explicitly via POST /api/sessions with configurable shell, working directory, environment variables, and initial commands.

2. **WebSocket Routing**: WebSocket connections use `/ws/:sessionId` URL pattern. The session must exist before connecting (unlike the old auto-create behavior).

3. **Multi-Client Support**: Multiple clients can connect to the same session. New clients receive historical output. Any client can resize the terminal.

4. **PTY Lifecycle**: The PTY is started when the session is created and runs until the session is closed or the shell exits.

5. **WebSocket Binary Messages**: The frontend expects binary WebSocket messages (`arraybuffer`) for terminal output to handle UTF-8 correctly.

6. **Embedding Frontend**: Frontend changes require rebuilding the embedded Go files with `make build-frontend`.

7. **Go Version**: Requires Go 1.25.5+. The project uses modern Go features and recent dependencies.
