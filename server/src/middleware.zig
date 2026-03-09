// middleware.zig — CORS headers and rate limiting
//
// KEY ZIG CONCEPT: Pointers vs Values
// In Zig, `*T` is a single-item pointer (like C's `T*`).
// `[]T` is a slice (pointer + length).
// `[*]T` is a many-item pointer (like C's `T*` when used as array).
// Functions that modify a struct take `*Self` (pointer to self).

const std = @import("std");
const db_mod = @import("db.zig");

/// Check rate limit for a token. Returns true if the request is allowed.
/// Limits to 100 requests per minute per token.
pub fn checkRateLimit(database: *db_mod.Database, token: []const u8) !bool {
    const MAX_REQUESTS_PER_MINUTE = 100;

    // Get the current minute as a window key (e.g., "2024-01-15 12:30")
    // We use SQLite's datetime functions for consistency
    var check_stmt = try database.prepare(
        "SELECT count FROM rate_limits WHERE token = ?1 AND window_start = strftime('%Y-%m-%d %H:%M', 'now')",
    );
    defer check_stmt.deinit();

    try check_stmt.bindText(1, token);

    if (try check_stmt.step()) {
        const count = check_stmt.columnInt(0);
        if (count >= MAX_REQUESTS_PER_MINUTE) {
            std.log.warn("Rate limit exceeded for token: {s}...", .{token[0..@min(token.len, 8)]});
            return false;
        }
    }

    // Increment the counter (INSERT or UPDATE)
    var upsert_stmt = try database.prepare(
        \\INSERT INTO rate_limits (token, window_start, count)
        \\VALUES (?1, strftime('%Y-%m-%d %H:%M', 'now'), 1)
        \\ON CONFLICT(token, window_start) DO UPDATE SET count = count + 1
    );
    defer upsert_stmt.deinit();

    try upsert_stmt.bindText(1, token);
    _ = try upsert_stmt.step();

    return true;
}

/// Clean up old rate limit entries (older than 5 minutes).
/// Call this periodically to prevent the table from growing forever.
pub fn cleanupRateLimits(database: *db_mod.Database) !void {
    try database.exec(
        "DELETE FROM rate_limits WHERE window_start < strftime('%Y-%m-%d %H:%M', 'now', '-5 minutes')",
    );
}
