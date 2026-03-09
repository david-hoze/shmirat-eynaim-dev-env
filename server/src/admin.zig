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

    // Vote distribution
    std.debug.print("--- Vote Distribution ---\n\n", .{});

    var single_stmt = try database.prepare(
        "SELECT COUNT(*) FROM classifications WHERE (vote_block + vote_safe) = 1",
    );
    defer single_stmt.deinit();
    if (try single_stmt.step()) {
        std.debug.print("  Single vote:     {d}\n", .{single_stmt.columnInt(0)});
    }

    var consensus_stmt = try database.prepare(
        "SELECT COUNT(*) FROM classifications WHERE (vote_block + vote_safe) >= 2",
    );
    defer consensus_stmt.deinit();
    if (try consensus_stmt.step()) {
        std.debug.print("  2+ votes (consensus): {d}\n", .{consensus_stmt.columnInt(0)});
    }

    var strong_stmt = try database.prepare(
        "SELECT COUNT(*) FROM classifications WHERE (vote_block + vote_safe) >= 3",
    );
    defer strong_stmt.deinit();
    if (try strong_stmt.step()) {
        std.debug.print("  3+ votes (strong):    {d}\n", .{strong_stmt.columnInt(0)});
    }

    var max_stmt = try database.prepare(
        "SELECT MAX(vote_block + vote_safe) FROM classifications",
    );
    defer max_stmt.deinit();
    if (try max_stmt.step()) {
        std.debug.print("  Max votes on single image: {d}\n", .{max_stmt.columnInt(0)});
    }

    // Consensus agreement
    std.debug.print("\n--- Consensus Quality ---\n\n", .{});

    var agree_stmt = try database.prepare(
        \\SELECT COUNT(*) FROM classifications
        \\WHERE (vote_block + vote_safe) >= 2
        \\AND (vote_block = 0 OR vote_safe = 0)
    );
    defer agree_stmt.deinit();
    if (try agree_stmt.step()) {
        std.debug.print("  Unanimous (all agree): {d}\n", .{agree_stmt.columnInt(0)});
    }

    var conflict_stmt = try database.prepare(
        \\SELECT COUNT(*) FROM classifications
        \\WHERE vote_block > 0 AND vote_safe > 0
    );
    defer conflict_stmt.deinit();
    if (try conflict_stmt.step()) {
        std.debug.print("  Conflicted (mixed votes): {d}\n", .{conflict_stmt.columnInt(0)});
    }

    // Top contributors
    std.debug.print("\n--- Top Contributors ---\n\n", .{});

    var contrib_stmt = try database.prepare(
        "SELECT email, contribution_count FROM users WHERE contribution_count > 0 ORDER BY contribution_count DESC LIMIT 10",
    );
    defer contrib_stmt.deinit();

    while (try contrib_stmt.step()) {
        const email = contrib_stmt.columnText(0) orelse "(unknown)";
        const count = contrib_stmt.columnInt(1);
        std.debug.print("  {s:<40} {d} contributions\n", .{ email, count });
    }

    // Source breakdown (from individual votes table for accuracy)
    std.debug.print("\n--- Vote Sources ---\n\n", .{});

    var total_votes_count = try database.prepare("SELECT COUNT(*) FROM votes");
    defer total_votes_count.deinit();
    if (try total_votes_count.step()) {
        std.debug.print("  Total individual votes: {d}\n", .{total_votes_count.columnInt(0)});
    }

    var vsrc_local = try database.prepare("SELECT COUNT(*) FROM votes WHERE source = 'local'");
    defer vsrc_local.deinit();
    if (try vsrc_local.step()) {
        std.debug.print("  local (ML):    {d}\n", .{vsrc_local.columnInt(0)});
    }

    var vsrc_haiku = try database.prepare("SELECT COUNT(*) FROM votes WHERE source = 'haiku'");
    defer vsrc_haiku.deinit();
    if (try vsrc_haiku.step()) {
        std.debug.print("  haiku (AI):    {d}\n", .{vsrc_haiku.columnInt(0)});
    }

    var vsrc_user = try database.prepare("SELECT COUNT(*) FROM votes WHERE source = 'user'");
    defer vsrc_user.deinit();
    if (try vsrc_user.step()) {
        std.debug.print("  user (manual): {d}\n", .{vsrc_user.columnInt(0)});
    }

    var vsrc_other = try database.prepare("SELECT COUNT(*) FROM votes WHERE source NOT IN ('local', 'haiku', 'user')");
    defer vsrc_other.deinit();
    if (try vsrc_other.step()) {
        std.debug.print("  other:         {d}\n", .{vsrc_other.columnInt(0)});
    }

    // Cache efficiency — how many images would be served from cache
    std.debug.print("\n--- Cache Efficiency ---\n\n", .{});

    var total_votes_stmt = try database.prepare(
        "SELECT SUM(vote_block + vote_safe) FROM classifications",
    );
    defer total_votes_stmt.deinit();
    if (try total_votes_stmt.step()) {
        const total_votes = total_votes_stmt.columnInt(0);
        if (try class_stmt.step()) {
            // class_stmt already stepped, we have the count from above
        }
        // Total votes - total unique hashes = cache hits saved
        var unique_stmt2 = try database.prepare("SELECT COUNT(*) FROM classifications");
        defer unique_stmt2.deinit();
        if (try unique_stmt2.step()) {
            const unique_count = unique_stmt2.columnInt(0);
            const cache_hits = total_votes - unique_count;
            std.debug.print("  Total votes cast:     {d}\n", .{total_votes});
            std.debug.print("  Unique images hashed: {d}\n", .{unique_count});
            std.debug.print("  Redundant lookups saved: {d}\n", .{cache_hits});
        }
    }

    std.debug.print("\n", .{});
}
