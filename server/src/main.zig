// main.zig — Entry point for the Shmirat Eynaim shared learning server
//
// This binary serves two purposes:
// 1. `shmirat-server serve` — runs the HTTP API server
// 2. `shmirat-server <command>` — CLI admin commands (add-user, approve, etc.)
//
// KEY ZIG CONCEPT: GeneralPurposeAllocator (GPA)
// Zig has no garbage collector. Memory allocation is explicit. The GPA is a
// general-purpose heap allocator that tracks allocations and detects leaks
// in debug builds. You create it in main() and pass it down to everything.
//
// KEY ZIG CONCEPT: `defer`
// `defer` runs a statement when the enclosing scope exits. We use it to
// ensure cleanup happens even if a function returns an error partway through.
// Think of it as a deterministic destructor — it always runs, in reverse order.

const std = @import("std");
const db_mod = @import("db.zig");
const server_mod = @import("server.zig");
const admin = @import("admin.zig");

pub fn main() !void {
    // Create the allocator. In debug builds, GPA tracks all allocations and
    // reports leaks when .deinit() is called. In release builds, it's fast.
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit(); // Check for leaks on exit
    const allocator = gpa.allocator();

    // Parse command-line arguments
    //
    // KEY ZIG CONCEPT: `try`
    // `try` is shorthand for: "if this returns an error, return that error
    // from THIS function too." It's like Go's `if err != nil { return err }`
    // but in one keyword.
    const args = try std.process.argsAlloc(allocator);
    defer std.process.argsFree(allocator, args);

    // Default database path
    const db_path: [*:0]const u8 = "server.db";

    // If no command given, default to running the server
    if (args.len < 2) {
        try runServerCommand(allocator, db_path);
        return;
    }

    // Dispatch to the right command
    //
    // KEY ZIG CONCEPT: String comparison
    // Zig strings are `[]const u8` (byte slices). You compare them with
    // `std.mem.eql(u8, a, b)`, NOT with `==`. The `==` operator on slices
    // compares pointers, not contents (like Java's == vs .equals()).
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
        std.debug.print("Unknown command: {s}\n\n", .{command});
        std.debug.print("Commands:\n", .{});
        std.debug.print("  serve        Start the HTTP server (default)\n", .{});
        std.debug.print("  add-user     Add a new user: add-user <email>\n", .{});
        std.debug.print("  approve      Approve a user: approve <email>\n", .{});
        std.debug.print("  revoke       Revoke a user: revoke <email>\n", .{});
        std.debug.print("  list-users   List all users\n", .{});
        std.debug.print("  stats        Show database statistics\n", .{});
    }
}

/// Open the database, init schema, and start the HTTP server.
fn runServerCommand(allocator: std.mem.Allocator, db_path: [*:0]const u8) !void {
    var database = try db_mod.Database.open(db_path);
    defer database.close();

    // Create tables if they don't exist
    try database.initSchema();

    // Start listening on port 8080
    const port: u16 = 8080;
    try server_mod.runServer(allocator, &database, port);
}
