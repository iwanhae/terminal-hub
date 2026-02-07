# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Terminal Hub is a web-based terminal application that provides browser-based access to shell sessions through WebSocket. It consists of:

- **Backend**: Go server using gorilla/websocket for real-time communication and creack/pty for pseudo-terminal management
- **Frontend**: React + TypeScript application using xterm.js for terminal emulation
- **Architecture**: Multi-session support with REST API for session management and WebSocket endpoints for terminal I/O
- **Authentication**: Cookie-based session authentication with configurable credentials (optional)
- **File Downloads**: OSC escape sequence-based file download functionality

## Development Commands

### Building the Project
```bash
# Preferred: run full project build flow
make build

# Build only the frontend (React + Vite)
make build-frontend

# Build only the Go backend (includes frontend)
make build-backend
```

**Important**: Use `make build` as the default build entrypoint in all normal cases, including frontend-only changes.

### Running the Application
```bash
# Build and run
make run

# Or run the built binary directly
./build/terminal-hub

# The server defaults to :8081, override with:
./build/terminal-hub -addr :3000

# Enable authentication via environment variables:
export TERMINAL_HUB_USERNAME=admin
export TERMINAL_HUB_PASSWORD=secret
./build/terminal-hub

# Set custom session TTL (default: 24h)
export TERMINAL_HUB_SESSION_TTL=12h
./build/terminal-hub
```

### Frontend Development
```bash
# Default command (also for frontend-only code changes)
make build
```

Use `make build` even when only frontend files are changed. `npm run ...` commands should be avoided unless the user explicitly asks for npm-based workflows.

### Testing
```bash
make test              # Run all Go tests
make test-short        # Run short tests only
make test-coverage     # Run tests with coverage report (generates coverage.html)
make test-ginkgo       # Run tests using Ginkgo test framework
make test-watch        # Watch mode for tests (requires Ginkgo)
```

**Running a single test**:
```bash
# Run a specific test suite by description
ginkgo -v --focus="Session Manager"

# Run tests in a specific file
go test -v ./terminal -run TestTerminalHub
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

### Release Process (GoReleaser + Git Tag)
```bash
# 1) Ensure working tree is clean and tests pass
go test ./...

# 2) Create and push a semantic version tag (example: v1.2.3)
git tag v1.2.3
git push origin v1.2.3

# 3) Run GoReleaser for the tagged release
goreleaser release --clean
```

After publishing the release:
1. Update `README.md` **One-Liner (Download & Run)** commands to the new version.
2. Create a **separate follow-up commit** for the README One-Liner update.

## Architecture

### Backend Structure

The backend follows a clean architecture with interface-based design for testability:

**main.go** (`main.go:1-686`)
- HTTP server serving embedded React frontend with SPA routing fallback
- REST API endpoints:
  - **Authentication**:
    - `POST /api/auth/login` - Login and set session cookie
    - `POST /api/auth/logout` - Logout and clear session cookie
    - `GET /api/auth/status` - Get authentication status
  - **Sessions**:
    - `GET /api/sessions` - List all sessions
    - `POST /api/sessions` - Create new session
    - `DELETE /api/sessions/:id` - Delete session
    - `PUT /api/sessions/:id` - Update session name
  - **File Download**:
    - `GET /api/download?path=<path>&filename=<name>` - Download files
- WebSocket endpoint (`/ws/:sessionId`) for terminal I/O
- `WebSocketClientImpl` bridges gorilla/websocket to the terminal's WebSocketClient interface
- `sessionAuthMiddleware` provides cookie-based authentication when configured
- Session initialization via `InitSessionManager()`

**auth Package** (`auth/session.go:1-121`)
- `SessionManager`: Manages authentication sessions with sliding expiration
- Cryptographic session tokens (256-bit random)
- Background cleanup of expired sessions (every 5 minutes)
- Configurable via environment variables (`TERMINAL_HUB_USERNAME`, `TERMINAL_HUB_PASSWORD`, `TERMINAL_HUB_SESSION_TTL`)
- Authentication is optional - if credentials not set, application runs in open mode

**terminal Package** (`terminal/`)

Core types and interfaces (`terminal/types.go:1-82`):
- `Session`: Interface for terminal session operations (ID, AddClient, RemoveClient, Write, Resize, Close, GetMetadata)
- `WebSocketClient`: Interface for client connections (Send, Close)
- `PTYService`: Interface for PTY operations (Start, StartWithConfig, SetSize)
- `HistoryProvider`: Interface for output history storage (Write, GetHistory)
- `SessionMetadata`: Runtime session information (name, timestamps, client count, working directory)
- `CreateSessionRequest`, `UpdateSessionRequest`: API request types

Session management (`terminal/manager.go:1-167`):
- `SessionManager`: Manages multiple terminal sessions with thread-safe operations
- `GetOrCreate`: Retrieves existing session or creates new one (auto-create behavior)
- `Get`: Retrieves session without auto-creation
- `CreateSession`: Creates session with explicit configuration
- `Remove`, `CloseAll`, `ListSessions`, `ListSessionsInfo`: Session lifecycle management
- `UpdateSessionName`: Updates session metadata via type assertion to `*TerminalSession`

Terminal session implementation (`terminal/session.go:1-530`):
- `TerminalSession`: Core session implementation with PTY management
- `InMemoryHistory`: Circular buffer for terminal output (default 4KB)
- `DefaultPTYService`: Production PTY implementation using creack/pty
- Supports custom shell, working directory, environment variables, and initial commands
- Broadcasts PTY output to all connected clients via `broadcastLoop` goroutine
- New clients receive historical output on connection
- Tracks session metadata including creation time and last activity
- Rate limiting: 500 messages/second with periodic token refill
- Primary client tracking for PTY resize coordination

**Key Design Patterns**:
- **Dependency injection**: PTYService and HistoryProvider are injected for testability
- **Interface segregation**: Clean separation between WebSocket, PTY, and history concerns
- **Thread safety**: Mutexes protect all shared state (clients, metadata, terminal size, close state)
- **Goroutine coordination**: Separate goroutines for PTY reading (`readPTY`) and client broadcasting (`broadcastLoop`)
- **Backpressure**: Blocking broadcast channel creates backpressure from slow clients to PTY reader

### Frontend Structure

**App.tsx** (`frontend/src/App.tsx:1-38`)
- React Router setup with routes for session grid and terminal view
- SessionProvider context for global session state management
- Sidebar navigation component
- Toast notifications via react-hot-toast
- Protected routes via `ProtectedRoute` component for authentication

**Key Components**:
- `components/Terminal.tsx`: xterm.js terminal emulator with FitAddon for responsive sizing
- `components/Sidebar.tsx`: Navigation sidebar with session list
- `components/SessionGrid.tsx`: Grid view of all sessions for management
- `components/CreateSessionDialog.tsx`: Dialog for creating new sessions
- `components/RenameSessionDialog.tsx`: Dialog for renaming sessions
- `components/ProtectedRoute.tsx`: Authentication wrapper for protected routes
- `pages/TerminalPage.tsx`: Page wrapper for terminal view
- `contexts/SessionContext.tsx`: Global state for sessions and API operations

**Terminal.tsx** (`frontend/src/components/Terminal.tsx:1-314`):
- xterm.js terminal emulator with FitAddon for responsive sizing
- WebSocket connection to `/ws/:sessionId` with binary message support (`arraybuffer`)
- Sends two message types:
  - `{"type":"input","data":"..."}` - User input to terminal
  - `{"type":"resize","cols":80,"rows":24}` - Terminal resize events
- Automatic resize handling with debouncing (100ms)
- Custom dark theme configuration (One Dark theme colors)
- ResizeObserver for responsive terminal sizing
- **OSC escape sequence parsing**: Detects file download sequences in terminal output
  - Pattern: `\x1b]FILE;download:path=<path>,name=<name>\x07`
  - Strips sequences from terminal output
  - Triggers REST API download via `/api/download` endpoint

### Build System

The frontend is embedded into the Go binary:
1. Frontend build generates files in `frontend/dist/` (via `make build`)
2. `frontend/dist/dist.go` contains embedded filesystem code (generated by Vite)
3. `main.go` uses `fs.Sub` to create an embedded filesystem from `dist.StaticFS`
4. SPA routing: non-existent files fall back to index.html (`main.go:637-650`)
5. Frontend changes should be rebuilt with `make build` (default policy, including frontend-only edits)

**Note**: The `npm run build` script includes `git restore dist` to prevent committing built files.

## Testing Framework

The project uses **Ginkgo** (BDD-style testing) with **Gomega** assertions:
- Test files: `terminal/session_test.go`
- Mock implementations: `MockWebSocketClient`, `MockPTYService`
- Run with: `make test-ginkgo`

Key test coverage:
- `InMemoryHistory`: Buffer size limits, truncation behavior
- `SessionManager`: Session lifecycle, concurrent access
- `MockWebSocketClient`: Send/receive operations, close handling

### Frontend Testing
- **Playwright** for end-to-end testing
- Test scripts in `frontend/` (not visible in current structure)
- No default Makefile targets are provided for Playwright; use `npm run ...` test commands only when explicitly requested by the user.

## Important Implementation Details

### Backend
1. **Multi-Session Architecture**: The application supports multiple named sessions via REST API. On server startup, a `default` session is auto-created, and additional sessions can be created via POST /api/sessions with configurable shell, working directory, environment variables, and initial commands.

2. **WebSocket Routing**: WebSocket connections use `/ws/:sessionId` URL pattern. The session must exist before connecting (uses `sessionManager.Get()`, not `GetOrCreate()`).

3. **Multi-Client Support**: Multiple clients can connect to the same session. New clients receive historical output. Any client can resize the terminal. The first (primary) client is tracked separately for resize coordination.

4. **PTY Lifecycle**: The PTY is started when the session is created and runs until the session is closed or the shell exits. Initial commands are executed after a 100ms delay to ensure PTY readiness.

5. **WebSocket Binary Messages**: The frontend expects binary WebSocket messages (`arraybuffer`) for terminal output to handle UTF-8 correctly. Backend sends via `websocket.BinaryMessage`.

6. **Rate Limiting**: Session output is rate-limited to 500 messages/second to prevent overload. The rate limiter uses a buffered channel with periodic token refill.

7. **Backpressure**: The broadcast channel is blocking, creating backpressure from slow clients to the PTY reader. Slow clients are automatically removed.

8. **SIGWINCH Handling**: When a new client connects, SIGWINCH is sent to the shell process to trigger a redraw for applications like htop.

9. **Authentication**: Cookie-based authentication is optional. When configured, all routes except `/api/auth/*` require authentication. API requests receive 401 responses; web requests redirect to `/login`.

10. **File Downloads**: The `/api/download` endpoint is session-independent (accessible from any session). Path validation prevents directory traversal. File size limit configurable via `TERMINAL_HUB_MAX_DOWNLOAD_SIZE` (default: 100MB).

### Frontend
11. **Embedding Frontend**: Frontend changes require rebuilding the embedded Go files with `make build`, even for frontend-only edits.

12. **OSC Escape Sequences**: The terminal parses OSC escape sequences for file downloads. These sequences are stripped from the output before display but trigger browser downloads via REST API.

13. **Terminal Resize**: Resize is debounced (100ms) and uses `ResizeObserver` for responsive sizing. Initial resize is sent with a 100ms delay after WebSocket connection.

14. **Mobile Support**: On mobile devices (<768px width), the terminal automatically focuses after 200ms delay.

15. **Session Management**: The frontend uses React Context for global session state. API calls include credentials for cookie-based authentication.

### Development
16. **Go Version**: Requires Go 1.25.5+. The project uses modern Go features and recent dependencies.

17. **Build Command Policy**: Use `make build` as the default command, including frontend-only work. Avoid `npm run ...` unless the user explicitly asks for npm-based execution.

18. **Code Quality**: The project uses ESLint with TypeScript, Prettier, and multiple plugins (unicorn, sonarjs, etc.) for frontend code quality. Go code uses golangci-lint.
