// db.zig — SQLite wrapper using Zig's C interop (@cImport)
//
// KEY ZIG CONCEPT: @cImport
// Zig can directly import C headers and use C functions. The `c` namespace
// below gives us access to all SQLite C functions (sqlite3_open, sqlite3_exec, etc.)
// as if they were Zig functions. Zig handles the ABI translation automatically.
//
// KEY ZIG CONCEPT: Error unions (`!T`)
// A function returning `!void` can either succeed (return void) or fail (return an error).
// Callers use `try` to propagate the error up, or `catch` to handle it.

const std = @import("std");

// Import the SQLite C header — this makes all sqlite3_* functions available
// under the `c` namespace. Zig compiles sqlite3.c as part of the build (see build.zig).
const c = @cImport({
    @cInclude("sqlite3.h");
});

/// Zig-idiomatic wrapper around a SQLite database connection.
///
/// KEY ZIG CONCEPT: Structs with methods
/// In Zig, structs can have methods (functions that take `self` as first arg).
/// This is Zig's version of OOP — no classes, no inheritance, just structs with functions.
pub const Database = struct {
    // The raw C pointer to the sqlite3 handle.
    // `*c.sqlite3` is a Zig pointer to the C type `sqlite3`.
    db: *c.sqlite3,

    /// Open a database file. Creates it if it doesn't exist.
    ///
    /// KEY ZIG CONCEPT: Sentinel-terminated pointers (`[*:0]const u8`)
    /// C strings are null-terminated. Zig strings (`[]const u8`) are NOT null-terminated —
    /// they're a pointer + length (a "slice"). When calling C functions that expect
    /// null-terminated strings, we use `[*:0]const u8` which guarantees a trailing zero byte.
    pub fn open(path: [*:0]const u8) !Database {
        // `?*c.sqlite3` is an "optional pointer" — it can be null or a valid pointer.
        // SQLite's sqlite3_open writes the handle here.
        var db_handle: ?*c.sqlite3 = null;

        const rc = c.sqlite3_open(path, &db_handle);
        if (rc != c.SQLITE_OK) {
            // sqlite3_open may still allocate a handle even on error — we must close it
            if (db_handle) |d| _ = c.sqlite3_close(d);
            std.log.err("Failed to open database: {s}", .{path});
            return error.SqliteOpenFailed;
        }

        // `.?` unwraps an optional — we've verified it's non-null by checking rc == SQLITE_OK
        const db = db_handle.?;

        // Enable WAL mode for better concurrent read performance
        _ = c.sqlite3_exec(db, "PRAGMA journal_mode=WAL;", null, null, null);
        // Wait up to 5 seconds if the database is locked by another connection
        _ = c.sqlite3_exec(db, "PRAGMA busy_timeout=5000;", null, null, null);

        std.log.info("Database opened: {s}", .{path});
        return Database{ .db = db };
    }

    /// Execute a SQL statement that returns no rows (CREATE TABLE, INSERT, UPDATE, etc.)
    pub fn exec(self: *Database, sql: [*:0]const u8) !void {
        // KEY ZIG CONCEPT: C pointer compatibility (`[*c]`)
        // SQLite's sqlite3_exec expects `[*c][*c]u8` for the error message pointer.
        // `[*c]u8` is a "C pointer" — nullable, no length info, matches C's `char*`.
        var err_msg: [*c]u8 = null;
        const rc = c.sqlite3_exec(self.db, sql, null, null, &err_msg);
        if (rc != c.SQLITE_OK) {
            if (err_msg) |msg| {
                std.log.err("SQLite exec error: {s}", .{msg});
                c.sqlite3_free(msg);
            }
            return error.SqliteExecFailed;
        }
    }

    /// Close the database connection.
    ///
    /// KEY ZIG CONCEPT: defer
    /// You typically call `defer database.close();` right after opening. `defer` runs
    /// the statement when the enclosing scope exits — like a destructor but explicit.
    pub fn close(self: *Database) void {
        _ = c.sqlite3_close(self.db);
        std.log.info("Database closed", .{});
    }

    /// Create all tables if they don't exist. Called on first run.
    pub fn initSchema(self: *Database) !void {
        std.log.info("Initializing database schema...", .{});

        try self.exec(
            \\CREATE TABLE IF NOT EXISTS users (
            \\    id INTEGER PRIMARY KEY AUTOINCREMENT,
            \\    email TEXT UNIQUE NOT NULL,
            \\    token TEXT UNIQUE NOT NULL,
            \\    approved INTEGER NOT NULL DEFAULT 0,
            \\    contribution_count INTEGER NOT NULL DEFAULT 0,
            \\    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            \\);
        );

        try self.exec(
            \\CREATE TABLE IF NOT EXISTS classifications (
            \\    hash TEXT PRIMARY KEY,
            \\    contains_women INTEGER NOT NULL,
            \\    confidence REAL NOT NULL DEFAULT 0.0,
            \\    vote_block INTEGER NOT NULL DEFAULT 0,
            \\    vote_safe INTEGER NOT NULL DEFAULT 0,
            \\    source TEXT NOT NULL DEFAULT 'local',
            \\    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            \\    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
            \\);
        );

        try self.exec(
            \\CREATE TABLE IF NOT EXISTS descriptors (
            \\    id INTEGER PRIMARY KEY AUTOINCREMENT,
            \\    descriptor BLOB NOT NULL,
            \\    label TEXT NOT NULL,
            \\    confidence REAL NOT NULL DEFAULT 1.0,
            \\    contributor_count INTEGER NOT NULL DEFAULT 1,
            \\    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            \\    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
            \\);
        );

        try self.exec(
            \\CREATE TABLE IF NOT EXISTS rate_limits (
            \\    token TEXT NOT NULL,
            \\    window_start DATETIME NOT NULL,
            \\    count INTEGER NOT NULL DEFAULT 0,
            \\    PRIMARY KEY (token, window_start)
            \\);
        );

        std.log.info("Database schema initialized", .{});
    }

    // -----------------------------------------------------------------------
    // Prepared statement helpers
    // -----------------------------------------------------------------------
    //
    // KEY ZIG CONCEPT: Allocators
    // Zig has no global allocator (no hidden malloc). Every function that allocates
    // memory takes an `Allocator` parameter. This makes memory ownership explicit.
    // The caller decides WHERE memory comes from (heap, arena, stack, etc.)

    /// Prepare a SQL statement for execution with bound parameters.
    /// Returns a Statement wrapper that must be finalized with .deinit().
    pub fn prepare(self: *Database, sql: [*:0]const u8) !Statement {
        var stmt: ?*c.sqlite3_stmt = null;
        const rc = c.sqlite3_prepare_v2(self.db, sql, -1, &stmt, null);
        if (rc != c.SQLITE_OK) {
            std.log.err("SQLite prepare error: {s}", .{c.sqlite3_errmsg(self.db)});
            return error.SqlitePrepareFailed;
        }
        return Statement{ .stmt = stmt.?, .db = self.db };
    }
};

/// Wrapper around a prepared SQLite statement.
/// Provides Zig-idiomatic bind/step/column methods.
pub const Statement = struct {
    stmt: *c.sqlite3_stmt,
    db: *c.sqlite3,

    /// Bind a text value to a parameter (1-indexed, like SQLite).
    ///
    /// KEY ZIG CONCEPT: Slices (`[]const u8`)
    /// A slice is a pointer + length pair. Unlike C strings, slices know their length
    /// and are NOT null-terminated. We pass `.len` to SQLite so it knows how many bytes to read.
    /// SQLITE_TRANSIENT tells SQLite to make its own copy of the string.
    pub fn bindText(self: *Statement, col: c_int, value: []const u8) !void {
        // @intCast converts between integer types. SQLite wants c_int for the length.
        // @ptrCast converts between pointer types. SQLite wants [*c]const u8 (a C pointer).
        const rc = c.sqlite3_bind_text(
            self.stmt,
            col,
            @ptrCast(value.ptr),
            @intCast(value.len),
            c.SQLITE_TRANSIENT,
        );
        if (rc != c.SQLITE_OK) return error.SqliteBindFailed;
    }

    /// Bind an integer value to a parameter.
    pub fn bindInt(self: *Statement, col: c_int, value: i64) !void {
        const rc = c.sqlite3_bind_int64(self.stmt, col, value);
        if (rc != c.SQLITE_OK) return error.SqliteBindFailed;
    }

    /// Bind a float value to a parameter.
    pub fn bindFloat(self: *Statement, col: c_int, value: f64) !void {
        const rc = c.sqlite3_bind_double(self.stmt, col, value);
        if (rc != c.SQLITE_OK) return error.SqliteBindFailed;
    }

    /// Bind a blob (binary data) to a parameter.
    pub fn bindBlob(self: *Statement, col: c_int, data: []const u8) !void {
        const rc = c.sqlite3_bind_blob(
            self.stmt,
            col,
            @ptrCast(data.ptr),
            @intCast(data.len),
            c.SQLITE_TRANSIENT,
        );
        if (rc != c.SQLITE_OK) return error.SqliteBindFailed;
    }

    /// Execute one step of the statement.
    /// Returns true if a row is available (SQLITE_ROW), false if done (SQLITE_DONE).
    pub fn step(self: *Statement) !bool {
        const rc = c.sqlite3_step(self.stmt);
        if (rc == c.SQLITE_ROW) return true;
        if (rc == c.SQLITE_DONE) return false;
        std.log.err("SQLite step error: {s}", .{c.sqlite3_errmsg(self.db)});
        return error.SqliteStepFailed;
    }

    /// Read a text column value (0-indexed).
    /// Returns a slice pointing into SQLite's internal buffer — valid until next step() or deinit().
    pub fn columnText(self: *Statement, col: c_int) ?[]const u8 {
        const ptr = c.sqlite3_column_text(self.stmt, col);
        if (ptr == null) return null;
        const len = c.sqlite3_column_bytes(self.stmt, col);
        // Convert C pointer + length to a Zig slice
        // @ptrCast converts [*c]const u8 to [*]const u8
        const zig_ptr: [*]const u8 = @ptrCast(ptr);
        return zig_ptr[0..@intCast(len)];
    }

    /// Read an integer column value (0-indexed).
    pub fn columnInt(self: *Statement, col: c_int) i64 {
        return c.sqlite3_column_int64(self.stmt, col);
    }

    /// Read a float column value (0-indexed).
    pub fn columnFloat(self: *Statement, col: c_int) f64 {
        return c.sqlite3_column_double(self.stmt, col);
    }

    /// Read a blob column value (0-indexed).
    pub fn columnBlob(self: *Statement, col: c_int) ?[]const u8 {
        const ptr = c.sqlite3_column_blob(self.stmt, col);
        if (ptr == null) return null;
        const len = c.sqlite3_column_bytes(self.stmt, col);
        const byte_ptr: [*]const u8 = @ptrCast(ptr);
        return byte_ptr[0..@intCast(len)];
    }

    /// Reset the statement so it can be executed again with new bindings.
    pub fn reset(self: *Statement) void {
        _ = c.sqlite3_reset(self.stmt);
        _ = c.sqlite3_clear_bindings(self.stmt);
    }

    /// Finalize (destroy) the prepared statement. Must be called when done.
    pub fn deinit(self: *Statement) void {
        _ = c.sqlite3_finalize(self.stmt);
    }
};
