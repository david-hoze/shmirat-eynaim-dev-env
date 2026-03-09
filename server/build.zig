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

    // Compile SQLite from C source — Zig's C interop lets us include C code
    // directly in our build without a separate C compiler or build system.
    exe.addCSourceFile(.{
        .file = b.path("deps/sqlite3.c"),
        .flags = &.{
            "-DSQLITE_THREADSAFE=1",
            "-DSQLITE_ENABLE_WAL=1",
        },
    });
    // Tell Zig where to find sqlite3.h when we @cImport it
    exe.addIncludePath(b.path("deps"));
    // SQLite needs libc (malloc, pthread, etc.)
    exe.linkLibC();

    b.installArtifact(exe);

    // "zig build run" step — lets you do `zig build run -- serve` etc.
    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());
    if (b.args) |args| {
        run_cmd.addArgs(args);
    }
    const run_step = b.step("run", "Run the server");
    run_step.dependOn(&run_cmd.step);
}
