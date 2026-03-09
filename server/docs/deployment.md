# Deployment

## Prerequisites

- Zig 0.14.0 ([download](https://ziglang.org/download/))
- SQLite amalgamation (bundled in `deps/`)

## Building

```bash
cd server
zig build
```

The binary is at `zig-out/bin/shmirat-server` (or `shmirat-server.exe` on Windows).

For an optimized build:

```bash
zig build -Doptimize=ReleaseFast
```

## Cross-compilation

Zig can cross-compile to any target without extra toolchains:

```bash
# Build for Linux from any platform
zig build -Dtarget=x86_64-linux-gnu

# Build for Linux ARM (e.g., Raspberry Pi, cloud ARM instances)
zig build -Dtarget=aarch64-linux-gnu
```

The output is a fully static binary with no runtime dependencies.

## Running

```bash
# Start the server (listens on port 8080)
./shmirat-server serve

# Or just (serve is the default):
./shmirat-server
```

The server creates `server.db` in the current working directory on first run.

## Configuration

Currently hardcoded:
- **Port**: 8080
- **Database path**: `server.db` (current directory)
- **Rate limit**: 100 requests per minute per token
- **Body size limit**: 1 MB

## Production considerations

- **HTTPS**: Put the server behind a reverse proxy (nginx, caddy) that terminates TLS. The server itself speaks plain HTTP.
- **Backups**: Copy `server.db` periodically. WAL mode makes live copies safe.
- **Monitoring**: The server logs to stderr. Redirect to a file or use systemd journal.
- **Persistence**: The server is single-threaded and stateless between requests. It can be restarted at any time without data loss.

### Example systemd unit

```ini
[Unit]
Description=Shmirat Eynaim Shared Learning Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/shmirat-server
ExecStart=/opt/shmirat-server/shmirat-server serve
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Example nginx reverse proxy

```nginx
server {
    listen 443 ssl;
    server_name shmirat.example.com;

    ssl_certificate /etc/letsencrypt/live/shmirat.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/shmirat.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Extension-side setup

Users configure the server connection in the extension popup:

1. Enter the server URL (e.g., `https://shmirat.example.com`)
2. Paste the API token provided by the admin
3. The extension verifies the connection by calling `GET /api/stats`
