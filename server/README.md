# Shmirat Eynaim — Shared Learning Server

A Zig HTTP server with SQLite that stores shared image classifications and face descriptors. Single binary, zero runtime dependencies.

## Build

```bash
# Install Zig 0.14.0 (if not already installed)
# Download from https://ziglang.org/download/

cd server
zig build
```

## Usage

```bash
# Start the server (port 8080)
./zig-out/bin/shmirat-server serve

# Or just (serve is the default):
./zig-out/bin/shmirat-server
```

## Admin Commands

```bash
# Add a user (generates an API token)
./zig-out/bin/shmirat-server add-user user@example.com

# Approve a user (required before they can use the API)
./zig-out/bin/shmirat-server approve user@example.com

# Revoke a user's access
./zig-out/bin/shmirat-server revoke user@example.com

# List all users
./zig-out/bin/shmirat-server list-users

# Show database statistics
./zig-out/bin/shmirat-server stats
```

## API Endpoints

All endpoints except `/api/stats` require `Authorization: Bearer <token>`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stats` | Public stats (no auth) |
| GET | `/api/classifications/:hash` | Look up a classification |
| POST | `/api/classifications` | Submit a classification |
| POST | `/api/classifications/batch` | Batch lookup |
| GET | `/api/descriptors` | Get face descriptors |
| POST | `/api/descriptors` | Submit a face descriptor |

### Examples

```bash
TOKEN="your-token-here"

# Submit a classification
curl -X POST http://localhost:8080/api/classifications \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"hash":"abc123","containsWomen":true,"source":"haiku","confidence":0.9}'

# Look up a classification
curl http://localhost:8080/api/classifications/abc123 \
  -H "Authorization: Bearer $TOKEN"

# Batch lookup
curl -X POST http://localhost:8080/api/classifications/batch \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"hashes":["abc123","def456"]}'
```

## Project Structure

```
server/
├── build.zig          # Build configuration
├── build.zig.zon      # Package manifest
├── src/
│   ├── main.zig       # Entry point, arg parsing
│   ├── server.zig     # HTTP server, routing
│   ├── handlers.zig   # Request handlers
│   ├── db.zig         # SQLite wrapper
│   ├── auth.zig       # Token validation
│   ├── middleware.zig  # Rate limiting
│   └── admin.zig      # CLI commands
└── deps/
    ├── sqlite3.c      # SQLite amalgamation
    └── sqlite3.h
```
