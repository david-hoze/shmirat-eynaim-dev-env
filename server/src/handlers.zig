// handlers.zig — HTTP request handlers for each API endpoint
//
// KEY ZIG CONCEPT: Error unions and `try`
// Every function that can fail returns `!void` (or `!T`). The `try` keyword
// is syntactic sugar for "if this returns an error, return that error from
// this function too". It's like Go's `if err != nil { return err }` but cleaner.

const std = @import("std");
const db_mod = @import("db.zig");
const auth_mod = @import("auth.zig");
const middleware = @import("middleware.zig");

// -----------------------------------------------------------------------
// Response helpers
// -----------------------------------------------------------------------

/// Send an HTTP response with CORS headers.
///
/// KEY ZIG CONCEPT: `std.http.Server.Request`
/// This is Zig's built-in HTTP request type. It's lower-level than Express or
/// Go's http.ResponseWriter — you write raw headers and body bytes.
fn sendResponse(request: *std.http.Server.Request, status: std.http.Status, body: []const u8) !void {
    // Zig 0.14 API: respond(content, options) — content first, options second
    try request.respond(body, .{
        .status = status,
        .extra_headers = &.{
            .{ .name = "Content-Type", .value = "application/json" },
            .{ .name = "Access-Control-Allow-Origin", .value = "*" },
            .{ .name = "Access-Control-Allow-Headers", .value = "Authorization, Content-Type" },
            .{ .name = "Access-Control-Allow-Methods", .value = "GET, POST, OPTIONS" },
        },
    });
}

fn sendError(request: *std.http.Server.Request, status: std.http.Status, message: []const u8) !void {
    // Build a JSON error response manually
    var buf: [256]u8 = undefined;
    const json = std.fmt.bufPrint(&buf, "{{\"error\":\"{s}\"}}", .{message}) catch
        "{\"error\":\"internal error\"}";
    try sendResponse(request, status, json);
}

// -----------------------------------------------------------------------
// GET /api/stats — Public endpoint, no auth required
// -----------------------------------------------------------------------

pub fn handleStats(allocator: std.mem.Allocator, database: *db_mod.Database, request: *std.http.Server.Request) !void {
    std.log.info("GET /api/stats", .{});

    // Count classifications
    var class_stmt = try database.prepare("SELECT COUNT(*) FROM classifications");
    defer class_stmt.deinit();

    var classification_count: i64 = 0;
    if (try class_stmt.step()) {
        classification_count = class_stmt.columnInt(0);
    }

    // Count descriptors
    var desc_stmt = try database.prepare("SELECT COUNT(*) FROM descriptors");
    defer desc_stmt.deinit();

    var descriptor_count: i64 = 0;
    if (try desc_stmt.step()) {
        descriptor_count = desc_stmt.columnInt(0);
    }

    // Count approved users
    var user_stmt = try database.prepare("SELECT COUNT(*) FROM users WHERE approved = 1");
    defer user_stmt.deinit();

    var user_count: i64 = 0;
    if (try user_stmt.step()) {
        user_count = user_stmt.columnInt(0);
    }

    // Build JSON response
    var buf = std.ArrayList(u8).init(allocator);
    defer buf.deinit();

    try std.fmt.format(buf.writer(),
        \\{{"classifications":{d},"descriptors":{d},"approvedUsers":{d}}}
    , .{ classification_count, descriptor_count, user_count });

    try sendResponse(request, .ok, buf.items);
}

// -----------------------------------------------------------------------
// GET /api/classifications/:hash — Look up a classification by image hash
// -----------------------------------------------------------------------

pub fn handleGetClassification(allocator: std.mem.Allocator, database: *db_mod.Database, request: *std.http.Server.Request) !void {
    // Extract hash from path: "/api/classifications/abc123" → "abc123"
    const path = request.head.target;
    const prefix = "/api/classifications/";
    if (!std.mem.startsWith(u8, path, prefix) or path.len <= prefix.len) {
        try sendError(request, .bad_request, "missing hash parameter");
        return;
    }
    const hash = path[prefix.len..];
    std.log.info("GET /api/classifications/{s}", .{hash});

    // Auth check
    const auth_header = getHeader(request, "authorization");
    const user = try auth_mod.validateToken(database, auth_header);
    if (user == null) {
        try sendError(request, .unauthorized, "invalid or missing token");
        return;
    }

    // Query
    var stmt = try database.prepare(
        "SELECT hash, contains_women, confidence, vote_block, vote_safe, source FROM classifications WHERE hash = ?1",
    );
    defer stmt.deinit();

    try stmt.bindText(1, hash);

    if (try stmt.step()) {
        const result_hash = stmt.columnText(0) orelse "";
        const contains_women = stmt.columnInt(1);
        const confidence = stmt.columnFloat(2);
        const vote_block = stmt.columnInt(3);
        const vote_safe = stmt.columnInt(4);
        const source = stmt.columnText(5) orelse "unknown";

        var buf = std.ArrayList(u8).init(allocator);
        defer buf.deinit();

        try std.fmt.format(buf.writer(),
            \\{{"hash":"{s}","containsWomen":{s},"confidence":{d:.4},"voteBlock":{d},"voteSafe":{d},"source":"{s}"}}
        , .{
            result_hash,
            if (contains_women != 0) "true" else "false",
            confidence,
            vote_block,
            vote_safe,
            source,
        });

        try sendResponse(request, .ok, buf.items);
    } else {
        try sendError(request, .not_found, "classification not found");
    }
}

// -----------------------------------------------------------------------
// POST /api/classifications — Submit a new classification
// -----------------------------------------------------------------------

pub fn handlePostClassification(allocator: std.mem.Allocator, database: *db_mod.Database, request: *std.http.Server.Request, body: ?[]const u8) !void {
    std.log.info("POST /api/classifications", .{});

    // Auth check
    const auth_header = getHeader(request, "authorization");
    const user = try auth_mod.validateToken(database, auth_header);
    if (user == null) {
        try sendError(request, .unauthorized, "invalid or missing token");
        return;
    }

    // Rate limit check
    if (auth_header) |h| {
        if (std.mem.startsWith(u8, h, "Bearer ")) {
            const allowed = try middleware.checkRateLimit(database, h["Bearer ".len..]);
            if (!allowed) {
                try sendError(request, .too_many_requests, "rate limit exceeded");
                return;
            }
        }
    }

    const request_body = body orelse {
        try sendError(request, .bad_request, "missing request body");
        return;
    };

    // Parse JSON body
    //
    // KEY ZIG CONCEPT: std.json.parseFromSlice
    // This parses a JSON byte slice into a Zig struct. The struct fields must
    // match the JSON keys. `.ignore_unknown_fields = true` means extra JSON
    // keys won't cause an error (like Go's json.Unmarshal).
    const parsed = std.json.parseFromSlice(ClassificationRequest, allocator, request_body, .{
        .ignore_unknown_fields = true,
    }) catch {
        try sendError(request, .bad_request, "invalid JSON");
        return;
    };
    defer parsed.deinit();
    const req = parsed.value;

    if (req.hash.len == 0) {
        try sendError(request, .bad_request, "hash is required");
        return;
    }

    // Upsert classification
    // If it already exists, update vote counts and confidence
    var stmt = try database.prepare(
        \\INSERT INTO classifications (hash, contains_women, confidence, vote_block, vote_safe, source, last_updated)
        \\VALUES (?1, ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP)
        \\ON CONFLICT(hash) DO UPDATE SET
        \\    vote_block = vote_block + ?4,
        \\    vote_safe = vote_safe + ?5,
        \\    confidence = (?3 + confidence) / 2.0,
        \\    last_updated = CURRENT_TIMESTAMP
    );
    defer stmt.deinit();

    try stmt.bindText(1, req.hash);
    try stmt.bindInt(2, if (req.containsWomen) 1 else 0);
    try stmt.bindFloat(3, req.confidence);
    try stmt.bindInt(4, if (req.containsWomen) 1 else 0); // vote_block
    try stmt.bindInt(5, if (!req.containsWomen) 1 else 0); // vote_safe
    try stmt.bindText(6, req.source);

    _ = try stmt.step();

    // Log individual vote and increment contribution count
    if (auth_header) |h| {
        if (std.mem.startsWith(u8, h, "Bearer ")) {
            const token = h["Bearer ".len..];

            // Get user ID for the vote record
            var user_stmt = try database.prepare("SELECT id FROM users WHERE token = ?1");
            defer user_stmt.deinit();
            try user_stmt.bindText(1, token);
            if (try user_stmt.step()) {
                const user_id = user_stmt.columnInt(0);

                // Insert individual vote (UNIQUE(hash, user_id) prevents exact duplicates,
                // but allows updating if the same user re-classifies)
                var vote_stmt = try database.prepare(
                    \\INSERT INTO votes (hash, user_id, contains_women, confidence, source)
                    \\VALUES (?1, ?2, ?3, ?4, ?5)
                    \\ON CONFLICT(hash, user_id) DO UPDATE SET
                    \\    contains_women = ?3,
                    \\    confidence = ?4,
                    \\    source = ?5,
                    \\    created_at = CURRENT_TIMESTAMP
                );
                defer vote_stmt.deinit();
                try vote_stmt.bindText(1, req.hash);
                try vote_stmt.bindInt(2, user_id);
                try vote_stmt.bindInt(3, if (req.containsWomen) 1 else 0);
                try vote_stmt.bindFloat(4, req.confidence);
                try vote_stmt.bindText(5, req.source);
                _ = vote_stmt.step() catch {};
            }

            // Increment contribution count
            var contrib_stmt = try database.prepare(
                "UPDATE users SET contribution_count = contribution_count + 1 WHERE token = ?1",
            );
            defer contrib_stmt.deinit();
            try contrib_stmt.bindText(1, token);
            _ = try contrib_stmt.step();
        }
    }

    std.log.info("Classification stored: hash={s} containsWomen={} source={s}", .{ req.hash, req.containsWomen, req.source });
    try sendResponse(request, .ok, "{\"success\":true}");

    // Periodically clean up rate limits (every request is fine for low traffic)
    middleware.cleanupRateLimits(database) catch {};
}

// -----------------------------------------------------------------------
// POST /api/classifications/batch — Batch lookup of classifications
// -----------------------------------------------------------------------

pub fn handleBatchClassifications(allocator: std.mem.Allocator, database: *db_mod.Database, request: *std.http.Server.Request, body: ?[]const u8) !void {
    std.log.info("POST /api/classifications/batch", .{});

    // Auth check
    const auth_header = getHeader(request, "authorization");
    const user = try auth_mod.validateToken(database, auth_header);
    if (user == null) {
        try sendError(request, .unauthorized, "invalid or missing token");
        return;
    }

    const request_body = body orelse {
        try sendError(request, .bad_request, "missing request body");
        return;
    };

    // Parse the batch request
    const parsed = std.json.parseFromSlice(BatchRequest, allocator, request_body, .{
        .ignore_unknown_fields = true,
    }) catch {
        try sendError(request, .bad_request, "invalid JSON");
        return;
    };
    defer parsed.deinit();
    const req = parsed.value;

    // Build response — look up each hash
    var buf = std.ArrayList(u8).init(allocator);
    defer buf.deinit();

    try buf.appendSlice("{\"results\":{");

    var first = true;
    for (req.hashes) |hash| {
        var stmt = try database.prepare(
            "SELECT hash, contains_women, confidence, vote_block, vote_safe, source FROM classifications WHERE hash = ?1",
        );
        defer stmt.deinit();

        try stmt.bindText(1, hash);

        if (try stmt.step()) {
            if (!first) try buf.appendSlice(",");
            first = false;

            const result_hash = stmt.columnText(0) orelse "";
            const contains_women = stmt.columnInt(1);
            const confidence = stmt.columnFloat(2);
            const vote_block = stmt.columnInt(3);
            const vote_safe = stmt.columnInt(4);
            const source = stmt.columnText(5) orelse "unknown";

            try std.fmt.format(buf.writer(),
                \\"{s}":{{"containsWomen":{s},"confidence":{d:.4},"voteBlock":{d},"voteSafe":{d},"source":"{s}"}}
            , .{
                result_hash,
                if (contains_women != 0) "true" else "false",
                confidence,
                vote_block,
                vote_safe,
                source,
            });
        }
    }

    try buf.appendSlice("}}");

    try sendResponse(request, .ok, buf.items);
}

// -----------------------------------------------------------------------
// GET /api/descriptors — Get face descriptors for learning
// -----------------------------------------------------------------------

pub fn handleGetDescriptors(allocator: std.mem.Allocator, database: *db_mod.Database, request: *std.http.Server.Request) !void {
    std.log.info("GET /api/descriptors", .{});

    // Auth check
    const auth_header = getHeader(request, "authorization");
    const user = try auth_mod.validateToken(database, auth_header);
    if (user == null) {
        try sendError(request, .unauthorized, "invalid or missing token");
        return;
    }

    // Return recent descriptors (limited to 100)
    var stmt = try database.prepare(
        "SELECT id, descriptor, label, confidence, contributor_count FROM descriptors ORDER BY last_updated DESC LIMIT 100",
    );
    defer stmt.deinit();

    var buf = std.ArrayList(u8).init(allocator);
    defer buf.deinit();

    try buf.appendSlice("{\"descriptors\":[");

    var first = true;
    while (try stmt.step()) {
        if (!first) try buf.appendSlice(",");
        first = false;

        const id = stmt.columnInt(0);
        const blob = stmt.columnBlob(1);
        const label = stmt.columnText(2) orelse "unknown";
        const confidence = stmt.columnFloat(3);
        const contributor_count = stmt.columnInt(4);

        // Encode blob as base64
        if (blob) |b| {
            const base64_len = std.base64.standard.Encoder.calcSize(b.len);
            const base64_buf = try allocator.alloc(u8, base64_len);
            defer allocator.free(base64_buf);
            _ = std.base64.standard.Encoder.encode(base64_buf, b);

            try std.fmt.format(buf.writer(),
                \\{{"id":{d},"descriptor":"{s}","label":"{s}","confidence":{d:.4},"contributorCount":{d}}}
            , .{ id, base64_buf, label, confidence, contributor_count });
        }
    }

    try buf.appendSlice("]}");

    try sendResponse(request, .ok, buf.items);
}

// -----------------------------------------------------------------------
// POST /api/descriptors — Submit a face descriptor
// -----------------------------------------------------------------------

pub fn handlePostDescriptor(allocator: std.mem.Allocator, database: *db_mod.Database, request: *std.http.Server.Request, body: ?[]const u8) !void {
    std.log.info("POST /api/descriptors", .{});

    // Auth check
    const auth_header = getHeader(request, "authorization");
    const user = try auth_mod.validateToken(database, auth_header);
    if (user == null) {
        try sendError(request, .unauthorized, "invalid or missing token");
        return;
    }

    const request_body = body orelse {
        try sendError(request, .bad_request, "missing request body");
        return;
    };

    // Parse JSON
    const parsed = std.json.parseFromSlice(DescriptorRequest, allocator, request_body, .{
        .ignore_unknown_fields = true,
    }) catch {
        try sendError(request, .bad_request, "invalid JSON");
        return;
    };
    defer parsed.deinit();
    const req = parsed.value;

    if (req.descriptor.len == 0 or req.label.len == 0) {
        try sendError(request, .bad_request, "descriptor and label are required");
        return;
    }

    // Decode base64 descriptor to raw bytes
    const decoded_len = std.base64.standard.Decoder.calcSizeForSlice(req.descriptor) catch {
        try sendError(request, .bad_request, "invalid base64 descriptor");
        return;
    };
    const decoded = try allocator.alloc(u8, decoded_len);
    defer allocator.free(decoded);
    std.base64.standard.Decoder.decode(decoded, req.descriptor) catch {
        try sendError(request, .bad_request, "invalid base64 descriptor");
        return;
    };

    // Insert the descriptor
    var stmt = try database.prepare(
        "INSERT INTO descriptors (descriptor, label, confidence) VALUES (?1, ?2, ?3)",
    );
    defer stmt.deinit();

    try stmt.bindBlob(1, decoded);
    try stmt.bindText(2, req.label);
    try stmt.bindFloat(3, req.confidence);

    _ = try stmt.step();

    std.log.info("Descriptor stored: label={s} size={d} bytes", .{ req.label, decoded.len });
    try sendResponse(request, .ok, "{\"success\":true}");
}

// -----------------------------------------------------------------------
// POST /api/register — Self-registration, returns a new token
// -----------------------------------------------------------------------

pub fn handleRegister(allocator: std.mem.Allocator, database: *db_mod.Database, request: *std.http.Server.Request, body: ?[]const u8) !void {
    std.log.info("POST /api/register", .{});

    const request_body = body orelse {
        try sendError(request, .bad_request, "missing request body");
        return;
    };

    const parsed = std.json.parseFromSlice(RegisterRequest, allocator, request_body, .{
        .ignore_unknown_fields = true,
    }) catch {
        try sendError(request, .bad_request, "invalid JSON");
        return;
    };
    defer parsed.deinit();
    const req = parsed.value;

    if (req.email.len == 0) {
        try sendError(request, .bad_request, "email is required");
        return;
    }

    // Check if user already exists
    var check_stmt = try database.prepare("SELECT token FROM users WHERE email = ?1");
    defer check_stmt.deinit();
    try check_stmt.bindText(1, req.email);

    if (try check_stmt.step()) {
        // User exists — return their existing token
        const existing_token = check_stmt.columnText(0) orelse "";
        var buf = std.ArrayList(u8).init(allocator);
        defer buf.deinit();
        try std.fmt.format(buf.writer(),
            \\{{"token":"{s}"}}
        , .{existing_token});
        try sendResponse(request, .ok, buf.items);
        return;
    }

    // Generate token and create user (auto-approved)
    const token = auth_mod.generateToken();

    var stmt = try database.prepare(
        "INSERT INTO users (email, token, approved) VALUES (?1, ?2, 1)",
    );
    defer stmt.deinit();

    try stmt.bindText(1, req.email);
    try stmt.bindText(2, &token);
    _ = try stmt.step();

    std.log.info("User self-registered: {s}", .{req.email});

    var buf = std.ArrayList(u8).init(allocator);
    defer buf.deinit();
    try std.fmt.format(buf.writer(),
        \\{{"token":"{s}"}}
    , .{token});

    try sendResponse(request, .ok, buf.items);
}

// -----------------------------------------------------------------------
// CORS preflight handler
// -----------------------------------------------------------------------

pub fn handleCorsOptions(request: *std.http.Server.Request) !void {
    try request.respond("", .{
        .status = .no_content,
        .extra_headers = &.{
            .{ .name = "Access-Control-Allow-Origin", .value = "*" },
            .{ .name = "Access-Control-Allow-Headers", .value = "Authorization, Content-Type" },
            .{ .name = "Access-Control-Allow-Methods", .value = "GET, POST, OPTIONS" },
            .{ .name = "Access-Control-Max-Age", .value = "86400" },
        },
    });
}

// -----------------------------------------------------------------------
// 404 handler
// -----------------------------------------------------------------------

pub fn handleNotFound(request: *std.http.Server.Request) !void {
    try sendError(request, .not_found, "not found");
}

// -----------------------------------------------------------------------
// Request/response types
// -----------------------------------------------------------------------

const ClassificationRequest = struct {
    hash: []const u8,
    containsWomen: bool,
    source: []const u8,
    confidence: f64,
};

const BatchRequest = struct {
    hashes: []const []const u8,
};

const DescriptorRequest = struct {
    descriptor: []const u8, // base64-encoded
    label: []const u8, // "block" or "safe"
    confidence: f64,
};

const RegisterRequest = struct {
    email: []const u8,
};

// -----------------------------------------------------------------------
// Header helper
// -----------------------------------------------------------------------

/// Extract a header value from the request by name (case-insensitive).
///
/// KEY ZIG CONCEPT: Iterators
/// Zig uses iterators heavily. `request.head.iterateHeaders()` returns
/// an iterator that yields (name, value) pairs. We call `.next()` in a
/// while loop until it returns null.
fn getHeader(request: *std.http.Server.Request, name: []const u8) ?[]const u8 {
    var it = request.iterateHeaders();
    while (it.next()) |header| {
        if (std.ascii.eqlIgnoreCase(header.name, name)) {
            return header.value;
        }
    }
    return null;
}
