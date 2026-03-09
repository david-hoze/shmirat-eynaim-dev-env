// server.zig — HTTP server setup and request routing
//
// KEY ZIG CONCEPT: `std.net` and `std.http`
// Zig's standard library includes a built-in HTTP server. It's lower-level
// than Express.js or Go's net/http — you handle raw connections, parse
// HTTP headers yourself, and manage the response lifecycle explicitly.
// There's no middleware chain or router — just functions.

const std = @import("std");
const db_mod = @import("db.zig");
const handlers = @import("handlers.zig");

/// Start the HTTP server and listen for connections.
///
/// KEY ZIG CONCEPT: Allocators passed explicitly
/// Unlike Go/JS where memory allocation is hidden, Zig requires you to pass
/// an allocator to any function that needs to allocate memory. This makes it
/// clear WHO owns the memory and WHO is responsible for freeing it.
pub fn runServer(allocator: std.mem.Allocator, database: *db_mod.Database, port: u16) !void {
    // Parse the listen address — 0.0.0.0 means "all interfaces"
    const address = std.net.Address.parseIp("0.0.0.0", port) catch unreachable;

    // Start listening. `reuse_address = true` lets us restart the server quickly
    // without waiting for TIME_WAIT sockets to expire.
    var server = try address.listen(.{
        .reuse_address = true,
    });
    defer server.deinit();

    std.log.info("=== Shmirat Eynaim server listening on port {d} ===", .{port});

    // Accept loop — handle one connection at a time (single-threaded).
    // For a production server you'd use std.Thread.spawn to handle connections
    // concurrently, but for our use case single-threaded is fine.
    while (true) {
        // accept() blocks until a client connects, then returns the connection
        const connection = server.accept() catch |err| {
            std.log.err("Accept error: {}", .{err});
            continue;
        };

        // Handle the connection — if it errors, log and continue accepting
        handleConnection(allocator, database, connection) catch |err| {
            std.log.err("Connection handling error: {}", .{err});
        };
    }
}

/// Handle a single HTTP connection: read the request, route it, send a response.
fn handleConnection(
    allocator: std.mem.Allocator,
    database: *db_mod.Database,
    connection: std.net.Server.Connection,
) !void {
    // KEY ZIG CONCEPT: defer
    // `defer` schedules a statement to run when the current scope exits,
    // whether normally or due to an error. It's like a finally block.
    // We always want to close the connection when we're done.
    defer connection.stream.close();

    // Buffer for HTTP parsing. The HTTP server reads into this buffer.
    // 8KB is enough for headers; body is read separately.
    var buf: [8192]u8 = undefined;
    var http_server = std.http.Server.init(connection, &buf);

    // Receive the HTTP request head (method, path, headers)
    var request = http_server.receiveHead() catch |err| {
        // Client may have disconnected or sent garbage
        std.log.debug("Failed to receive request head: {}", .{err});
        return;
    };

    // Read the request body (if any — POST requests have a body)
    const body = readBody(allocator, &request) catch |err| {
        std.log.err("Failed to read request body: {}", .{err});
        return;
    };
    // KEY ZIG CONCEPT: `if` with capture
    // `if (body) |b| allocator.free(b)` — if `body` is not null, capture
    // the non-null value as `b` and free it. This is Zig's pattern for
    // handling optionals safely.
    defer if (body) |b| allocator.free(b);

    // Route the request to the appropriate handler
    const path = request.head.target;
    const method = request.head.method;

    std.log.info("{s} {s}", .{ @tagName(method), path });

    // CORS preflight — browsers send OPTIONS before cross-origin requests
    if (method == .OPTIONS) {
        try handlers.handleCorsOptions(&request);
        return;
    }

    // Route to handlers based on method + path
    if (method == .GET and std.mem.eql(u8, path, "/api/stats")) {
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
        try handlers.handleNotFound(&request);
    }
}

/// Read the full request body into an allocated buffer.
/// Returns null if there's no body (e.g. GET requests).
///
/// KEY ZIG CONCEPT: Optional return (`?[]u8`)
/// This function returns either a byte slice (the body) or null (no body).
/// The caller is responsible for freeing the returned slice with `allocator.free()`.
fn readBody(allocator: std.mem.Allocator, request: *std.http.Server.Request) !?[]u8 {
    // content_length is an optional — it's null for requests without a body
    const content_length = request.head.content_length orelse return null;

    // Sanity limit: don't read more than 1MB
    if (content_length > 1_048_576) return error.BodyTooLarge;

    // Allocate a buffer for the body
    // @intCast converts the content_length (which might be a different int type)
    const buf = try allocator.alloc(u8, @intCast(content_length));
    errdefer allocator.free(buf);

    // Read the body from the request reader
    // reader() can return an error union in Zig 0.14 — unwrap it with try
    const reader = try request.reader();
    var total_read: usize = 0;
    while (total_read < buf.len) {
        const bytes_read = try reader.read(buf[total_read..]);
        if (bytes_read == 0) break; // Connection closed
        total_read += bytes_read;
    }

    return buf[0..total_read];
}
