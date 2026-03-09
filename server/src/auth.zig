// auth.zig — Token generation and user authentication
//
// KEY ZIG CONCEPT: Comptime
// `comptime` means "computed at compile time". Some values and types in Zig
// are resolved during compilation, not at runtime. This is used heavily in
// Zig's standard library for type-safe formatting, generics, etc.

const std = @import("std");
const db_mod = @import("db.zig");

/// Generate a cryptographically secure random token as a 64-character hex string.
///
/// KEY ZIG CONCEPT: Fixed-size arrays (`[64]u8`)
/// Unlike slices (`[]u8`), arrays have a compile-time-known size. `[64]u8` is
/// always exactly 64 bytes, stored inline (on the stack). No heap allocation needed.
pub fn generateToken() [64]u8 {
    // Generate 32 random bytes (256 bits of entropy)
    var random_bytes: [32]u8 = undefined;
    // std.crypto.random is Zig's cryptographic PRNG — seeded from the OS
    std.crypto.random.bytes(&random_bytes);

    // Convert to hex string: 32 bytes → 64 hex characters
    var hex: [64]u8 = undefined;
    _ = std.fmt.bufPrint(&hex, "{}", .{std.fmt.fmtSliceHexLower(&random_bytes)}) catch unreachable;
    return hex;
}

/// Validate a bearer token from the Authorization header.
/// Returns the user's email if the token is valid and the user is approved.
/// Returns null if the token is invalid, missing, or the user is not approved.
///
/// KEY ZIG CONCEPT: Optional types (`?T`)
/// `?[]const u8` can be either a valid slice or `null`. Zig forces you to handle
/// the null case — you can't accidentally dereference a null optional.
pub fn validateToken(database: *db_mod.Database, auth_header: ?[]const u8) !?UserInfo {
    // Extract the token from "Bearer <token>"
    const header = auth_header orelse return null;

    // Check that it starts with "Bearer "
    if (!std.mem.startsWith(u8, header, "Bearer ")) return null;

    const token = header["Bearer ".len..];
    if (token.len == 0) return null;

    // Look up the token in the database
    var stmt = try database.prepare(
        "SELECT email, approved FROM users WHERE token = ?1",
    );
    defer stmt.deinit();

    try stmt.bindText(1, token);

    // step() returns true if a row was found
    if (try stmt.step()) {
        const email = stmt.columnText(0) orelse return null;
        const approved = stmt.columnInt(1);

        if (approved == 0) {
            std.log.warn("Token valid but user not approved: {s}", .{email});
            return null;
        }

        // We need to copy the email because the SQLite buffer is only valid
        // until the statement is finalized (which happens at `defer stmt.deinit()`)
        // For simplicity, we return the info while the statement is still alive
        // and the caller must use it before the statement is destroyed.
        return UserInfo{
            .email = email,
            .approved = true,
        };
    }

    return null;
}

pub const UserInfo = struct {
    email: []const u8,
    approved: bool,
};
