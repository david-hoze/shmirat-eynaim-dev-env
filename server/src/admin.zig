// admin.zig — CLI commands for user management and stats
//
// These commands are run from the terminal, not via HTTP.
// Example: `./shmirat-server add-user test@example.com`
//
// KEY ZIG CONCEPT: `std.debug.print` vs `std.log`
// - `std.debug.print` writes directly to stderr — good for CLI output to the user
// - `std.log.info` writes structured log messages — good for server runtime logging
// We use `std.debug.print` here because these are CLI commands, not server operations.

const std = @import("std");
const db_mod = @import("db.zig");
const auth_mod = @import("auth.zig");

/// Add a new user and generate their API token.
/// Usage: shmirat-server add-user <email>
pub fn addUser(allocator: std.mem.Allocator, db_path: [*:0]const u8, email: []const u8) !void {
    _ = allocator;

    var database = try db_mod.Database.open(db_path);
    defer database.close();
    try database.initSchema();

    // Generate a secure random token
    const token = auth_mod.generateToken();

    // Insert the user
    var stmt = try database.prepare(
        "INSERT INTO users (email, token, approved) VALUES (?1, ?2, 0)",
    );
    defer stmt.deinit();

    try stmt.bindText(1, email);
    try stmt.bindText(2, &token);

    _ = stmt.step() catch {
        std.debug.print("Error: user '{s}' already exists\n", .{email});
        return;
    };

    std.debug.print("User added: {s}\n", .{email});
    std.debug.print("Token: {s}\n", .{token});
    std.debug.print("Note: user is NOT approved yet. Run: shmirat-server approve {s}\n", .{email});
}

/// Approve a user so they can use the API.
/// Usage: shmirat-server approve <email>
pub fn approveUser(db_path: [*:0]const u8, email: []const u8) !void {
    var database = try db_mod.Database.open(db_path);
    defer database.close();
    try database.initSchema();

    var stmt = try database.prepare(
        "UPDATE users SET approved = 1 WHERE email = ?1",
    );
    defer stmt.deinit();

    try stmt.bindText(1, email);
    _ = try stmt.step();

    std.debug.print("User approved: {s}\n", .{email});
}

/// Revoke a user's access.
/// Usage: shmirat-server revoke <email>
pub fn revokeUser(db_path: [*:0]const u8, email: []const u8) !void {
    var database = try db_mod.Database.open(db_path);
    defer database.close();
    try database.initSchema();

    var stmt = try database.prepare(
        "UPDATE users SET approved = 0 WHERE email = ?1",
    );
    defer stmt.deinit();

    try stmt.bindText(1, email);
    _ = try stmt.step();

    std.debug.print("User revoked: {s}\n", .{email});
}

/// List all users and their status.
/// Usage: shmirat-server list-users
pub fn listUsers(allocator: std.mem.Allocator, db_path: [*:0]const u8) !void {
    _ = allocator;

    var database = try db_mod.Database.open(db_path);
    defer database.close();
    try database.initSchema();

    var stmt = try database.prepare(
        "SELECT email, approved, contribution_count, created_at FROM users ORDER BY created_at",
    );
    defer stmt.deinit();

    std.debug.print("\n{s:<30} {s:<10} {s:<15} {s}\n", .{ "EMAIL", "APPROVED", "CONTRIBUTIONS", "CREATED" });
    std.debug.print("{s}\n", .{"-" ** 80});

    var count: u32 = 0;
    while (try stmt.step()) {
        const e = stmt.columnText(0) orelse "(unknown)";
        const approved = stmt.columnInt(1);
        const contributions = stmt.columnInt(2);
        const created = stmt.columnText(3) orelse "(unknown)";

        std.debug.print("{s:<30} {s:<10} {d:<15} {s}\n", .{
            e,
            if (approved != 0) "YES" else "NO",
            contributions,
            created,
        });
        count += 1;
    }

    std.debug.print("\nTotal: {d} users\n", .{count});
}

/// Show database statistics.
/// Usage: shmirat-server stats
pub fn showStats(db_path: [*:0]const u8) !void {
    var database = try db_mod.Database.open(db_path);
    defer database.close();
    try database.initSchema();

    std.debug.print("\n=== Shmirat Eynaim Server Stats ===\n\n", .{});

    // Users
    var user_stmt = try database.prepare("SELECT COUNT(*) FROM users");
    defer user_stmt.deinit();
    if (try user_stmt.step()) {
        std.debug.print("Total users:       {d}\n", .{user_stmt.columnInt(0)});
    }

    var approved_stmt = try database.prepare("SELECT COUNT(*) FROM users WHERE approved = 1");
    defer approved_stmt.deinit();
    if (try approved_stmt.step()) {
        std.debug.print("Approved users:    {d}\n", .{approved_stmt.columnInt(0)});
    }

    // Classifications
    var class_stmt = try database.prepare("SELECT COUNT(*) FROM classifications");
    defer class_stmt.deinit();
    if (try class_stmt.step()) {
        std.debug.print("Classifications:   {d}\n", .{class_stmt.columnInt(0)});
    }

    var block_stmt = try database.prepare("SELECT COUNT(*) FROM classifications WHERE contains_women = 1");
    defer block_stmt.deinit();
    if (try block_stmt.step()) {
        std.debug.print("  - blocked:       {d}\n", .{block_stmt.columnInt(0)});
    }

    var safe_stmt = try database.prepare("SELECT COUNT(*) FROM classifications WHERE contains_women = 0");
    defer safe_stmt.deinit();
    if (try safe_stmt.step()) {
        std.debug.print("  - safe:          {d}\n", .{safe_stmt.columnInt(0)});
    }

    // Descriptors
    var desc_stmt = try database.prepare("SELECT COUNT(*) FROM descriptors");
    defer desc_stmt.deinit();
    if (try desc_stmt.step()) {
        std.debug.print("Face descriptors:  {d}\n", .{desc_stmt.columnInt(0)});
    }

    std.debug.print("\n", .{});
}
