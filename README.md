# Terminal Hub

A web-based terminal application that provides browser-based access to shell sessions through WebSocket.

## Features

- **Multi-session support**: Create and manage multiple terminal sessions
- **Default session on startup**: A `default` session is created automatically at server start
- **WebSocket-based**: Real-time terminal I/O using xterm.js
- **RESTful API**: Manage sessions via HTTP endpoints
- **Browser-based**: Access terminals from any modern web browser
- **Cookie-based Authentication**: Secure session management with web login
- **File downloads**: Download files directly from the terminal using OSC escape sequences

## Quick Start

### One-Liner (Download & Run)

**Linux/macOS:**
```bash
curl -sL "https://github.com/iwanhae/terminal-hub/releases/download/v1.1.0/terminal-hub_1.1.0_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/').tar.gz" | tar xz && ./terminal-hub
```

**Windows (PowerShell):**
```powershell
Invoke-WebRequest -Uri "https://github.com/iwanhae/terminal-hub/releases/download/v1.1.0/terminal-hub_1.1.0_windows_amd64.zip" -OutFile "terminal-hub.zip"
Expand-Archive -Path "terminal-hub.zip" -DestinationPath .
.\terminal-hub.exe
```

**Note:** This command detects your OS/architecture, downloads the release version embedded in the URL, and runs it. Access the terminal at http://localhost:8081.

### Using Docker

```bash
docker run -p 8081:8081 ghcr.io/iwanhae/terminal-hub:latest
```

### Docker Persistence Guide

Terminal Hub Docker image is designed to persist data via the container user's `HOME` directory (`/home/ubuntu`).
Mount a volume to `/home/ubuntu` to keep files, tool installations, and shell config across container recreation.

**Recommended (named volume):**
```bash
docker volume create terminal-hub-home

docker run -d --name terminal-hub \
  -p 8081:8081 \
  -v terminal-hub-home:/home/ubuntu \
  ghcr.io/iwanhae/terminal-hub:latest
```

**Bind mount (host directory):**
```bash
mkdir -p ./terminal-hub-home

docker run -d --name terminal-hub \
  -p 8081:8081 \
  -v "$(pwd)/terminal-hub-home:/home/ubuntu" \
  ghcr.io/iwanhae/terminal-hub:latest
```

**docker-compose example:**
```yaml
services:
  terminal-hub:
    image: ghcr.io/iwanhae/terminal-hub:latest
    ports:
      - "8081:8081"
    volumes:
      - terminal-hub-home:/home/ubuntu

volumes:
  terminal-hub-home:
```

**Important notes:**
1. Persisted: files under `/home/ubuntu` (shell profile, git config, downloaded files, user-installed tools).
2. Not persisted: in-memory terminal sessions themselves (session processes end when container/app stops).
3. First run initializes the volume from image defaults. If you need re-initialization, remove `/home/ubuntu/.terminal-hub-initialized` inside the volume and restart with care.
4. If no volume is mounted, data is ephemeral and lost when the container is removed.
5. If you have any suggestion on default supported tools, PR is welcomed.

**PATH tip (`${HOME}/.local/bin`):**
The image includes `${HOME}/.local/bin` in `PATH`. If you want binaries to be available permanently across restarts, place them in:
```bash
/home/ubuntu/.local/bin
```
This works best with a persistent `/home/ubuntu` volume.

### From Source

```bash
# Clone repository
git clone https://github.com/iwanhae/terminal-hub.git
cd terminal-hub

# Build the application
make build

# Run the server
./build/terminal-hub

# Access the terminal at http://localhost:8081
```

## Authentication

Terminal Hub supports cookie-based session authentication for secure access. When enabled, users must log in via a web form to access the terminal interface.

### Enabling Authentication

Set the following environment variables:

- `TERMINAL_HUB_USERNAME` - Username for authentication
- `TERMINAL_HUB_PASSWORD` - Password for authentication
- `TERMINAL_HUB_SESSION_TTL` (optional) - Session duration (default: "24h")

If both username and password are set, authentication is **required** for all access. If either is missing or empty, the application runs in open mode.

### Examples

**Using environment variables:**
```bash
export TERMINAL_HUB_USERNAME=admin
export TERMINAL_HUB_PASSWORD=your-secure-password
./build/terminal-hub
```

**With custom session duration:**
```bash
export TERMINAL_HUB_SESSION_TTL=12h
./build/terminal-hub
```

**Using Docker:**
```bash
docker run -p 8081:8081 \
  -e TERMINAL_HUB_USERNAME=admin \
  -e TERMINAL_HUB_PASSWORD=your-secure-password \
  ghcr.io/iwanhae/terminal-hub:latest
```

**Using docker-compose:**
```yaml
services:
  terminal-hub:
    image: ghcr.io/iwanhae/terminal-hub:latest
    ports:
      - "8081:8081"
    environment:
      TERMINAL_HUB_USERNAME: admin
      TERMINAL_HUB_PASSWORD: your-secure-password
      TERMINAL_HUB_SESSION_TTL: "24h"
```

### Security Features

1. **HttpOnly Cookies**: Prevents JavaScript access (XSS protection)
2. **Secure Flag**: Only sent over HTTPS when available
3. **SameSite=Strict**: Prevents CSRF attacks
4. **Sliding Expiration**: Sessions extend with activity (up to TTL)
5. **Cryptographic Tokens**: 256-bit random session tokens
6. **Background Cleanup**: Expired sessions removed every 5 minutes

### Security Notes

⚠️ **Important security considerations:**

1. **HTTPS Recommended**: Session cookies are more secure over HTTPS. Enable HTTPS in production environments.
2. **Strong Passwords**: Use strong, unique passwords for `TERMINAL_HUB_PASSWORD`.
3. **Environment Variable Security**: Be careful how you set environment variables:
   - Don't commit credentials to git
   - Use secrets management in production (Docker secrets, Kubernetes secrets, etc.)
   - Use `.env` files with proper file permissions (add to `.gitignore`)
4. **Session Management**: Users are automatically logged out after the session TTL period of inactivity.

## File Downloads

Terminal Hub supports downloading files directly from the terminal to your browser using OSC (Operating System Command) escape sequences. The terminal uses REST API endpoints for the actual file transmission, providing browser-native download support with progress indicators.

### How It Works

1. An OSC escape sequence is emitted in the terminal output
2. The frontend detects the sequence and extracts the file path
3. A REST API call is made to `/api/download` to retrieve the file
4. The browser downloads the file using its native download manager

### Triggering Downloads

#### Method 1: Using OSC Escape Sequence (Direct)

You can emit the OSC sequence directly from your shell:

```bash
# Syntax: printf '\033]FILE;download:path=<absolute-path>,name=<filename>\007'
printf '\033]FILE;download:path=/tmp/myfile.txt,name=myfile.txt\007'
```

#### Method 2: Using the Helper Script

Source the helper script in your shell:

```bash
source /path/to/scripts/download-helper.sh

# Download with default filename (uses original filename)
download-file /path/to/file.txt

# Download with custom filename
download-file /path/to/file.txt custom-name.txt

# Using the alias
dl /path/to/file.txt custom-name.txt
```

### API Endpoint

- `GET /api/download?path=<file-path>&filename=<optional-filename>` - Download a file

### Security Features

1. **Path validation**: Only absolute paths are allowed
2. **Path traversal protection**: Directory traversal attacks are blocked
3. **File size limits**: Configurable via `TERMINAL_HUB_MAX_DOWNLOAD_SIZE` (default: 100MB)
4. **Directory prevention**: Cannot download directories
5. **Filename sanitization**: Dangerous characters are removed from filenames
6. **Authentication**: Uses the same authentication as other endpoints

### Configuration

```bash
# Maximum download size in bytes (default: 100MB)
export TERMINAL_HUB_MAX_DOWNLOAD_SIZE=104857600
```

### Example Usage

```bash
# Create a test file
echo "Hello World" > /tmp/test.txt

# Trigger download
printf '\033]FILE;download:path=/tmp/test.txt,name=test.txt\007'

# The file will appear in your browser's download manager
```

### Troubleshooting

**Download not starting:**
- Verify the file exists and is readable by the server
- Check that the path is absolute (starts with `/`)
- Ensure the file size is within the configured limit
- Check browser console for errors

**Error message in terminal:**
- Red `[Download Error]` messages indicate server-side errors
- Check the server logs for details

## Development

See [CLAUDE.md](CLAUDE.md) for detailed development documentation including:
- Build commands
- Testing instructions
- Architecture overview
- Code organization

## API Endpoints

### Authentication

- `POST /api/auth/login` - Login with username/password (sets session cookie)
- `POST /api/auth/logout` - Logout (clears session cookie)
- `GET /api/auth/status` - Get current authentication status

### Sessions

- `GET /api/sessions` - List all sessions
- `POST /api/sessions` - Create a new session
- `PUT /api/sessions/:id` - Update session name
- `DELETE /api/sessions/:id` - Delete a session

### File Download

- `GET /api/download?path=<file-path>&filename=<optional-name>` - Download a file

### WebSocket

- `WS /ws/:sessionId` - Connect to a terminal session

## Changelog

### v1.0.1 (2026-02-06)

**Bug Fixes:**
- Fixed authentication status API to correctly return `authenticated: true` when authentication is not configured. Users were incorrectly redirected to the login page when running in open mode (without `TERMINAL_HUB_USERNAME` and `TERMINAL_HUB_PASSWORD` set).

### v1.0.0 (2026-02-06)

**Initial Release:**
- Multi-session terminal support via WebSocket
- Cookie-based authentication with session management
- RESTful API for session management
- File download support via OSC escape sequences
- Embedded React frontend with xterm.js

## License

[Add your license here]
