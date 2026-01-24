# Terminal Hub

A web-based terminal application that provides browser-based access to shell sessions through WebSocket.

## Features

- **Multi-session support**: Create and manage multiple terminal sessions
- **WebSocket-based**: Real-time terminal I/O using xterm.js
- **RESTful API**: Manage sessions via HTTP endpoints
- **Browser-based**: Access terminals from any modern web browser
- **Authentication**: Optional HTTP Basic Authentication for securing access

## Quick Start

### Using Docker

```bash
docker run -p 8081:8081 iwanhae/terminal-hub
```

### From Source

```bash
# Clone the repository
git clone https://github.com/iwanhae/terminal-hub.git
cd terminal-hub

# Build the application
make build

# Run the server
./build/terminal-hub

# Access the terminal at http://localhost:8081
```

## Authentication

Terminal Hub supports optional HTTP Basic Authentication. When enabled, your browser will prompt for credentials when you access the terminal interface.

### Enabling Authentication

Set the following environment variables:

- `TERMINAL_HUB_USERNAME` - Username for authentication
- `TERMINAL_HUB_PASSWORD` - Password for authentication

If both variables are set, authentication is **required** for all access (web interface, API, and WebSocket connections). If either variable is missing or empty, the application runs in open mode (no authentication).

### Examples

**Using environment variables:**
```bash
export TERMINAL_HUB_USERNAME=admin
export TERMINAL_HUB_PASSWORD=your-secure-password
./build/terminal-hub
```

**Using Docker:**
```bash
docker run -p 8081:8081 \
  -e TERMINAL_HUB_USERNAME=admin \
  -e TERMINAL_HUB_PASSWORD=your-secure-password \
  iwanhae/terminal-hub
```

**Using docker-compose:**
```yaml
services:
  terminal-hub:
    image: iwanhae/terminal-hub
    ports:
      - "8081:8081"
    environment:
      TERMINAL_HUB_USERNAME: admin
      TERMINAL_HUB_PASSWORD: your-secure-password
```

### Testing Authentication

```bash
# Without authentication
curl http://localhost:8081/api/sessions

# With authentication (will prompt for password)
curl -u admin:your-secure-password http://localhost:8081/api/sessions
```

### Security Notes

⚠️ **Important security considerations:**

1. **HTTPS Recommended**: Basic Auth sends credentials in base64 encoding (easily decoded). Always use HTTPS in production environments.
2. **Strong Passwords**: Use strong, unique passwords for `TERMINAL_HUB_PASSWORD`.
3. **Environment Variable Security**: Be careful how you set environment variables:
   - Don't commit credentials to git
   - Use secrets management in production (Docker secrets, Kubernetes secrets, etc.)
   - Use `.env` files with proper file permissions (add to `.gitignore`)
4. **Docker Secrets**: For Docker deployments, consider using Docker secrets instead of environment variables for better security.

## Development

See [CLAUDE.md](CLAUDE.md) for detailed development documentation including:
- Build commands
- Testing instructions
- Architecture overview
- Code organization

## API Endpoints

### Sessions

- `GET /api/sessions` - List all sessions
- `POST /api/sessions` - Create a new session
- `PUT /api/sessions/:id` - Update session name
- `DELETE /api/sessions/:id` - Delete a session

### WebSocket

- `WS /ws/:sessionId` - Connect to a terminal session

## License

[Add your license here]
