## Shared Learning Backend — Zig Server

Build a simple HTTP server in Zig with SQLite that stores shared image classifications and face descriptors. Single binary, zero runtime dependencies.

### Why Zig Specifics Matter

This is a learning project for the developer. When writing the code:
- **Add clear comments explaining Zig concepts** (comptime, optionals, error unions, slices vs pointers, allocators)
- **Prefer explicit over clever** — use verbose patterns even when shorter alternatives exist
- **When something fails to compile**, explain WHY in a comment before fixing it
- **Use `std.log` liberally** so the developer can trace execution

### Project Structure

```
server/
??? build.zig              # Build configuration
??? build.zig.zon          # Package manifest
??? src/
?   ??? main.zig           # Entry point, arg parsing, server or CLI
?   ??? server.zig         # HTTP server setup, routing
?   ??? handlers.zig       # Request handlers for each endpoint
?   ??? db.zig             # SQLite wrapper, schema init, queries
?   ??? auth.zig           # Token validation, user lookup
?   ??? middleware.zig      # CORS, rate limiting
?   ??? admin.zig          # CLI commands: add-user, approve, revoke, stats
??? deps/
?   ??? sqlite3.c          # SQLite amalgamation (single file)
?   ??? sqlite3.h          # SQLite header
??? README.md
```

### Dependencies

**Zero external Zig packages.** Use only:
- Zig standard library (`std.http.Server`, `std.json`, `std.mem`, `std.fmt`, `std.crypto.random`)
- SQLite amalgamation compiled directly via Zig's C interop (`@cImport`)

### Setting Up SQLite

1. Download the SQLite amalgamation from https://sqlite.org/download.html (the "sqlite-amalgamation" zip). It contains `sqlite3.c` and `sqlite3.h`. Place them in `deps/`.

2. In `build.zig`, compile SQLite as a C source:
   ```zig
   const std = @import("std");

   pub fn build(b: *std.Build) void {
       const target = b.standardTargetOptions(.{});
       const optimize = b.standardOptimizeOption(.{});

       const exe = b.addExecutable(.{
           .name = "shmirat-server",
           .root_source_file = b.path("src/main.zig"),
           .target = target,
           .optimize = optimize,
       });

       // Compile SQLite from C source
       exe.addCSourceFile(.{
           .file = b.path("deps/sqlite3.c"),
           .flags = &.{
               "-DSQLITE_THREADSAFE=1",
               "-DSQLITE_ENABLE_WAL=1",
           },
       });
       exe.addIncludePath(b.path("deps"));
       exe.linkLibC();

       b.installArtifact(exe);

       // Run step
       const run_cmd = b.addRunArtifact(exe);
       run_cmd.step.dependOn(b.getInstallStep());
       if (b.args) |args| {
           run_cmd.addArgs(args);
       }
       const run_step = b.step("run", "Run the server");
       run_step.dependOn(&run_cmd.step);
   }
   ```

3. In `db.zig`, import SQLite via C interop:
   ```zig
   const c = @cImport({
       @cInclude("sqlite3.h");
   });

   // Now use c.sqlite3_open, c.sqlite3_exec, c.sqlite3_prepare_v2, etc.
   ```

### Database Schema

Same as before, created in `db.zig` on first run:

```sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    token TEXT UNIQUE NOT NULL,
    approved INTEGER NOT NULL DEFAULT 0,
    contribution_count INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS classifications (
    hash TEXT PRIMARY KEY,
    contains_women INTEGER NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.0,
    vote_block INTEGER NOT NULL DEFAULT 0,
    vote_safe INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'local',
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS descriptors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descriptor BLOB NOT NULL,
    label TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 1.0,
    contributor_count INTEGER NOT NULL DEFAULT 1,
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rate_limits (
    token TEXT NOT NULL,
    window_start DATETIME NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (token, window_start)
);
```

### SQLite Wrapper Pattern

Wrap the C SQLite API in Zig-idiomatic code. This is the most important learning part — it shows Zig's C interop:

```zig
// db.zig

const std = @import("std");
const c = @cImport({
    @cInclude("sqlite3.h");
});

pub const Database = struct {
    db: *c.sqlite3,

    // Open a database connection
    pub fn open(path: [*:0]const u8) !Database {
        var db: ?*c.sqlite3 = null;
        const rc = c.sqlite3_open(path, &db);
        if (rc != c.SQLITE_OK) {
            // sqlite3_open may still allocate a handle on error
            if (db) |d| c.sqlite3_close(d);
            return error.SqliteOpenFailed;
        }
        // Enable WAL mode for better concurrent read performance
        _ = c.sqlite3_exec(db.?, "PRAGMA journal_mode=WAL;", null, null, null);
        _ = c.sqlite3_exec(db.?, "PRAGMA busy_timeout=5000;", null, null, null);
        return Database{ .db = db.? };
    }

    // Execute a statement with no result rows
    pub fn exec(self: *Database, sql: [*:0]const u8) !void {
        var err_msg: ?[*:0]u8 = null;
        const rc = c.sqlite3_exec(self.db, sql, null, null, &err_msg);
        if (rc != c.SQLITE_OK) {
            if (err_msg) |msg| {
                std.log.err("SQLite error: {s}", .{msg});
                c.sqlite3_free(msg);
            }
            return error.SqliteExecFailed;
        }
    }

    pub fn close(self: *Database) void {
        _ = c.sqlite3_close(self.db);
    }

    // ... add prepare/step/bind wrappers as needed
};
```

### HTTP Server

Use `std.http.Server`. This is Zig's built-in HTTP server. It's lower-level than Express or Go's net/http — you handle raw requests:

```zig
// server.zig

const std = @import("std");
const db_mod = @import("db.zig");
const handlers = @import("handlers.zig");

pub fn runServer(allocator: std.mem.Allocator, database: *db_mod.Database, port: u16) !void {
    const address = std.net.Address.parseIp("0.0.0.0", port) catch unreachable;

    var server = try address.listen(.{
        .reuse_address = true,
    });
    defer server.deinit();

    std.log.info("Shmirat Eynaim server listening on port {d}", .{port});

    // Accept loop
    while (true) {
        const connection = try server.accept();
        // Handle each connection
        // For simplicity, handle synchronously (single-threaded)
        // For production, use std.Thread or an async pattern
        handleConnection(allocator, database, connection) catch |err| {
            std.log.err("Connection error: {}", .{err});
        };
    }
}

fn handleConnection(
    allocator: std.mem.Allocator,
    database: *db_mod.Database,
    connection: std.net.Server.Connection,
) !void {
    defer connection.stream.close();

    var buf: [8192]u8 = undefined;
    var http_server = std.http.Server.init(connection, &buf);

    var request = try http_server.receiveHead();

    // Read body if present
    const body = try readBody(allocator, &request);
    defer if (body) |b| allocator.free(b);

    // Route the request
    const path = request.head.target;
    const method = request.head.method;

    // CORS preflight
    if (method == .OPTIONS) {
        try sendCorsResponse(&request, "204", "");
        return;
    }

    // Route to handlers
    if (method == .GET and std.mem.startsWith(u8, path, "/api/stats")) {
        try handlers.handleStats(allocator, database, &request);
    } else if (method == .GET and std.mem.startsWith(u8, path, "/api/classifications/")) {
        try handlers.handleGetClassification(allocator, database, &request);
    } else if (method == .POST and std.mem.eql(u8, path, "/api/classifications/batch")) {
        try handlers.handleBatchClassifications(allocator, database, &request, body);
    } else if (method == .POST and std.mem.eql(u8, path, "/api/classifications")) {
        try handlers.handlePostClassification(allocator, database, &request, body);
    } else if (method == .GET and std.mem.startsWith(u8, path, "/api/descriptors")) {
        try handlers.handleGetDescriptors(allocator, database, &request);
    } else if (method == .POST and std.mem.eql(u8, path, "/api/descriptors")) {
        try handlers.handlePostDescriptor(allocator, database, &request, body);
    } else {
        try sendResponse(&request, .not_found, "{\"error\":\"not found\"}");
    }
}
```

### JSON Handling

Use `std.json` for parsing and serialization:

```zig
// Parsing a request body
const parsed = try std.json.parseFromSlice(
    ClassificationRequest,
    allocator,
    body,
    .{ .ignore_unknown_fields = true },
);
defer parsed.deinit();
const req = parsed.value;

// Serializing a response
var buf = std.ArrayList(u8).init(allocator);
defer buf.deinit();
try std.json.stringify(response_data, .{}, buf.writer());
try sendResponse(&request, .ok, buf.items);
```

Define request/response structs:

```zig
const ClassificationRequest = struct {
    hash: []const u8,
    containsWomen: bool,
    source: []const u8,
    confidence: f64,
};

const ClassificationResponse = struct {
    hash: []const u8,
    containsWomen: bool,
    confidence: f64,
    voteBlock: i64,
    voteSafe: i64,
    source: []const u8,
};

const BatchRequest = struct {
    hashes: []const []const u8,
};
```

### Token Generation

Use Zig's crypto for secure random tokens:

```zig
// auth.zig
const std = @import("std");

pub fn generateToken() [64]u8 {
    var random_bytes: [32]u8 = undefined;
    std.crypto.random.bytes(&random_bytes);

    var hex: [64]u8 = undefined;
    _ = std.fmt.bufPrint(&hex, "{}", .{std.fmt.fmtSliceHexLower(&random_bytes)}) catch unreachable;
    return hex;
}
```

### CLI Entry Point

```zig
// main.zig

const std = @import("std");
const db_mod = @import("db.zig");
const server_mod = @import("server.zig");
const admin = @import("admin.zig");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    const args = try std.process.argsAlloc(allocator);
    defer std.process.argsFree(allocator, args);

    // Default database path
    const db_path = "server.db";

    if (args.len < 2) {
        // Default: run server
        try runServerCommand(allocator, db_path);
        return;
    }

    const command = args[1];

    if (std.mem.eql(u8, command, "serve")) {
        try runServerCommand(allocator, db_path);
    } else if (std.mem.eql(u8, command, "add-user")) {
        if (args.len < 3) {
            std.debug.print("Usage: shmirat-server add-user <email>\n", .{});
            return;
        }
        try admin.addUser(allocator, db_path, args[2]);
    } else if (std.mem.eql(u8, command, "approve")) {
        if (args.len < 3) {
            std.debug.print("Usage: shmirat-server approve <email>\n", .{});
            return;
        }
        try admin.approveUser(db_path, args[2]);
    } else if (std.mem.eql(u8, command, "revoke")) {
        if (args.len < 3) {
            std.debug.print("Usage: shmirat-server revoke <email>\n", .{});
            return;
        }
        try admin.revokeUser(db_path, args[2]);
    } else if (std.mem.eql(u8, command, "list-users")) {
        try admin.listUsers(allocator, db_path);
    } else if (std.mem.eql(u8, command, "stats")) {
        try admin.showStats(db_path);
    } else {
        std.debug.print("Unknown command: {s}\n", .{command});
        std.debug.print("Commands: serve, add-user, approve, revoke, list-users, stats\n", .{});
    }
}

fn runServerCommand(allocator: std.mem.Allocator, db_path: [*:0]const u8) !void {
    var database = try db_mod.Database.open(db_path);
    defer database.close();
    try database.initSchema();

    const port: u16 = 8080;
    try server_mod.runServer(allocator, &database, port);
}
```

### Important Zig Patterns to Follow

**Memory management**: Use the `GeneralPurposeAllocator` in main, pass allocators down. Free everything. Zig doesn't have garbage collection — every allocation needs a corresponding free. Use `defer` immediately after allocation.

**Error handling**: Zig uses error unions (`!T`). Use `try` to propagate errors up, `catch` to handle them. Never ignore errors silently.

**Strings**: Zig strings are just `[]const u8` slices. They're not null-terminated by default. When passing to C functions (SQLite), use `[*:0]const u8` (null-terminated pointer) or convert with `std.mem.span()`.

**No hidden allocations**: Unlike Go or JS, nothing allocates behind your back. Every allocation is explicit. This means you manage buffer lifetimes yourself.

### Build & Run

```bash
cd server

# Download SQLite amalgamation (one-time)
curl -O https://sqlite.org/2024/sqlite-amalgamation-3450000.zip
unzip sqlite-amalgamation-3450000.zip
cp sqlite-amalgamation-3450000/sqlite3.c deps/
cp sqlite-amalgamation-3450000/sqlite3.h deps/

# Build
zig build

# Run server
./zig-out/bin/shmirat-server

# Admin commands
./zig-out/bin/shmirat-server add-user test@example.com
./zig-out/bin/shmirat-server approve test@example.com
./zig-out/bin/shmirat-server list-users
./zig-out/bin/shmirat-server stats
```

### Testing

Test with curl:

```bash
TOKEN="the-token-from-add-user"

# Submit a classification
curl -X POST http://localhost:8080/api/classifications \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"hash":"abc123","containsWomen":true,"source":"haiku","confidence":0.9}'

# Look it up
curl http://localhost:8080/api/classifications/abc123 \
  -H "Authorization: Bearer $TOKEN"

# Batch lookup
curl -X POST http://localhost:8080/api/classifications/batch \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"hashes":["abc123","def456"]}'

# Get stats (no auth needed)
curl http://localhost:8080/api/stats
```

### What Claude Code Might Struggle With

Be prepared for:
- **Zig version differences**: `std.http.Server` API changes between Zig versions. Use Zig 0.13.0 or 0.14.0 (latest stable). If the API doesn't match, check the Zig stdlib source.
- **C interop edge cases**: Passing Zig slices to C functions requires conversion. The SQLite C API expects null-terminated strings and raw pointers.
- **Allocator threading**: If you later add multithreading, the GPA needs a mutex. For single-threaded, it's fine.
- **JSON serialization of optional fields**: `std.json` can be finicky with optionals and custom types. If it fails, fall back to manual JSON string building with `std.fmt`.

If Claude Code gets stuck on a Zig compilation error for more than 3 attempts, it should:
1. Read the exact compiler error message carefully
2. Check if it's a Zig version mismatch
3. Simplify the failing code to the minimum reproduction
4. If still stuck, write that one function in a simpler way (even if less elegant)

Extension-Side Changes
Update the shared learning instructions in CLAUDE.md. Replace all Firebase references with fetch calls:
javascript// In background.js

const SERVER_URL = "https://your-server.example.com"; // User configures in popup

async function checkSharedCache(imageHash) {
  const { serverUrl, userToken } = await browser.storage.local.get(["serverUrl", "userToken"]);
  if (!serverUrl || !userToken) return null;

  try {
    const resp = await fetch(`${serverUrl}/api/classifications/${imageHash}`, {
      headers: { "Authorization": `Bearer ${userToken}` },
    });
    if (!resp.ok) return null;
    const data = await resp.json();

    const totalVotes = data.voteBlock + data.voteSafe;
    if (totalVotes < 2) return null;

    return {
      containsWomen: data.containsWomen,
      confidence: data.confidence,
      source: "shared",
      votes: totalVotes,
    };
  } catch {
    return null;
  }
}

async function checkSharedCacheBatch(hashes) {
  const { serverUrl, userToken } = await browser.storage.local.get(["serverUrl", "userToken"]);
  if (!serverUrl || !userToken || hashes.length === 0) return new Map();

  try {
    const resp = await fetch(`${serverUrl}/api/classifications/batch`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${userToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ hashes }),
    });
    if (!resp.ok) return new Map();
    const data = await resp.json();
    return new Map(Object.entries(data.results));
  } catch {
    return new Map();
  }
}

async function pushToSharedCache(imageHash, containsWomen, source) {
  const { serverUrl, userToken } = await browser.storage.local.get(["serverUrl", "userToken"]);
  if (!serverUrl || !userToken) return;

  try {
    await fetch(`${serverUrl}/api/classifications`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${userToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ hash: imageHash, containsWomen, source, confidence: 0.9 }),
    });
  } catch {
    // Silently fail — shared cache is best-effort
  }
}
Popup Settings Addition
Add to popup:
?? Server Connection ???????????
Server URL: [ https://your-server.com ]
User Token: [ ???????????????? ] [paste]
Status: Connected ? (approved)
Shared DB: 12,847 images classified

### Zig Installation

Before building the server, install Zig:

```bash
# Download latest stable Zig (0.14.0) — single tarball, no package manager needed
curl -L https://ziglang.org/download/0.14.0/zig-linux-x86_64-0.14.0.tar.xz | tar -xJ
sudo mv zig-linux-x86_64-0.14.0 /opt/zig
sudo ln -s /opt/zig/zig /usr/local/bin/zig

# Verify
zig version
```

Zig has no installer, no dependencies, no runtime. It's a single directory with a binary. If the version above is outdated, check https://ziglang.org/download/ for the latest.
```

That's it — Zig is one of the easiest toolchains to install. No `apt`, no `brew`, no `nvm`-style version manager. Download, extract, put it on PATH. Claude Code can do this in one bash command before building.

One thing to watch: check what architecture your machine is. If you're on ARM (Apple Silicon Mac, Raspberry Pi), change `x86_64` to `aarch64` in the URL. You might want to tell Claude Code your system so it picks the right download.
