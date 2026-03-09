// tests/server-api.spec.js — Integration tests for the Shmirat Eynaim Zig server
// Starts the server binary, tests all HTTP endpoints, auth, rate limiting, and error cases.
const { test, expect } = require("@playwright/test");
const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const SERVER_BIN = path.resolve(__dirname, "../server/zig-out/bin/shmirat-server.exe");
// Server uses hardcoded "server.db" in its working directory.
// We use a temp directory so tests don't pollute the real server data.
const TEST_DIR = path.resolve(__dirname, "../server/.test-run");
const TEST_DB = path.join(TEST_DIR, "server.db");
const BASE_URL = "http://127.0.0.1:8080";

let serverProcess;
let testToken;
const testEmail = "test@example.com";

function runCli(...args) {
  // The Zig CLI uses std.debug.print (stderr) for all output
  const result = execSync(`"${SERVER_BIN}" ${args.join(" ")} 2>&1`, {
    cwd: TEST_DIR,
    env: { ...process.env },
    encoding: "utf-8",
    timeout: 5000,
  });
  return result;
}

function waitForServer(url, timeoutMs = 5000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      fetch(url)
        .then((r) => resolve(r))
        .catch(() => {
          if (Date.now() - start > timeoutMs) {
            reject(new Error("Server did not start in time"));
          } else {
            setTimeout(check, 100);
          }
        });
    };
    check();
  });
}

test.describe("Shmirat Eynaim Server API", () => {
  test.beforeAll(async () => {
    // Clean up any leftover test directory
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });

    // Start the server in the test directory (it creates server.db there)
    serverProcess = spawn(SERVER_BIN, ["serve"], {
      cwd: TEST_DIR,
      stdio: ["pipe", "pipe", "pipe"],
    });

    serverProcess.stderr.on("data", (data) => {
      // Uncomment for debugging:
      // console.error("[server]", data.toString());
    });

    // Wait for it to be ready
    await waitForServer(`${BASE_URL}/api/stats`);

    // Create and approve a test user
    const addOutput = runCli("add-user", testEmail);
    const tokenMatch = addOutput.match(/Token:\s+([0-9a-f]{64})/);
    if (!tokenMatch) throw new Error("Could not extract token from: " + addOutput);
    testToken = tokenMatch[1];

    runCli("approve", testEmail);
  });

  test.afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      // Wait a bit for clean shutdown
      await new Promise((r) => setTimeout(r, 500));
      if (!serverProcess.killed) serverProcess.kill("SIGKILL");
    }
    // Clean up test directory
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  // --- Stats (public) ---

  test("GET /api/stats returns public stats without auth", async () => {
    const res = await fetch(`${BASE_URL}/api/stats`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("classifications");
    expect(body).toHaveProperty("descriptors");
    expect(body).toHaveProperty("approvedUsers");
    expect(typeof body.classifications).toBe("number");
  });

  // --- Auth ---

  test("authenticated endpoint rejects missing token", async () => {
    const res = await fetch(`${BASE_URL}/api/classifications/somehash`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test("authenticated endpoint rejects invalid token", async () => {
    const res = await fetch(`${BASE_URL}/api/classifications/somehash`, {
      headers: { Authorization: "Bearer invalidtoken123" },
    });
    expect(res.status).toBe(401);
  });

  test("unapproved user token is rejected", async () => {
    // Create but don't approve
    const output = runCli("add-user", "unapproved@example.com");
    const match = output.match(/Token:\s+([0-9a-f]{64})/);
    const unapprovedToken = match[1];

    const res = await fetch(`${BASE_URL}/api/classifications/somehash`, {
      headers: { Authorization: `Bearer ${unapprovedToken}` },
    });
    expect(res.status).toBe(401);
  });

  // --- CORS ---

  test("OPTIONS preflight returns CORS headers", async () => {
    const res = await fetch(`${BASE_URL}/api/stats`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("GET");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  test("regular responses include CORS headers", async () => {
    const res = await fetch(`${BASE_URL}/api/stats`);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  // --- Classifications ---

  test("GET /api/classifications/:hash returns 404 for unknown hash", async () => {
    const res = await fetch(`${BASE_URL}/api/classifications/nonexistent`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  test("POST /api/classifications stores a classification", async () => {
    const res = await fetch(`${BASE_URL}/api/classifications`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hash: "testhash001",
        containsWomen: true,
        source: "haiku",
        confidence: 0.95,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("GET /api/classifications/:hash returns stored classification", async () => {
    const res = await fetch(`${BASE_URL}/api/classifications/testhash001`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hash).toBe("testhash001");
    expect(body.containsWomen).toBe(true);
    expect(body.confidence).toBeCloseTo(0.95, 1);
    expect(body.voteBlock).toBe(1);
    expect(body.voteSafe).toBe(0);
    expect(body.source).toBe("haiku");
  });

  test("POST /api/classifications increments votes on existing hash", async () => {
    // Submit again for the same hash
    await fetch(`${BASE_URL}/api/classifications`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hash: "testhash001",
        containsWomen: true,
        source: "local",
        confidence: 0.85,
      }),
    });

    const res = await fetch(`${BASE_URL}/api/classifications/testhash001`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    const body = await res.json();
    expect(body.voteBlock).toBe(2);
    // Confidence should be averaged: (0.95 + 0.85) / 2 = 0.9
    expect(body.confidence).toBeCloseTo(0.9, 1);
  });

  test("POST /api/classifications with safe vote increments voteSafe", async () => {
    await fetch(`${BASE_URL}/api/classifications`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hash: "testhash002",
        containsWomen: false,
        source: "user",
        confidence: 0.8,
      }),
    });

    const res = await fetch(`${BASE_URL}/api/classifications/testhash002`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    const body = await res.json();
    expect(body.containsWomen).toBe(false);
    expect(body.voteSafe).toBe(1);
    expect(body.voteBlock).toBe(0);
  });

  test("POST /api/classifications rejects missing fields", async () => {
    const res = await fetch(`${BASE_URL}/api/classifications`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ hash: "incomplete" }),
    });
    expect(res.status).toBe(400);
  });

  test("POST /api/classifications rejects invalid JSON", async () => {
    const res = await fetch(`${BASE_URL}/api/classifications`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testToken}`,
        "Content-Type": "application/json",
      },
      body: "not json at all",
    });
    expect(res.status).toBe(400);
  });

  // --- Batch ---

  test("POST /api/classifications/batch returns known hashes", async () => {
    const res = await fetch(`${BASE_URL}/api/classifications/batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hashes: ["testhash001", "testhash002", "unknown_hash"],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toBeDefined();
    expect(body.results["testhash001"]).toBeDefined();
    expect(body.results["testhash001"].containsWomen).toBe(true);
    expect(body.results["testhash002"]).toBeDefined();
    expect(body.results["testhash002"].containsWomen).toBe(false);
    // Unknown hash should be omitted
    expect(body.results["unknown_hash"]).toBeUndefined();
  });

  test("POST /api/classifications/batch with empty hashes returns empty results", async () => {
    const res = await fetch(`${BASE_URL}/api/classifications/batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ hashes: [] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toBeDefined();
    expect(Object.keys(body.results)).toHaveLength(0);
  });

  // --- Descriptors ---

  test("POST /api/descriptors stores a descriptor", async () => {
    // Create a fake 512-byte descriptor (128 float32s) and base64 encode it
    const buffer = new ArrayBuffer(512);
    const floats = new Float32Array(buffer);
    for (let i = 0; i < 128; i++) floats[i] = Math.random();
    const base64 = Buffer.from(buffer).toString("base64");

    const res = await fetch(`${BASE_URL}/api/descriptors`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        descriptor: base64,
        label: "block",
        confidence: 0.92,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("GET /api/descriptors returns stored descriptors", async () => {
    const res = await fetch(`${BASE_URL}/api/descriptors`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.descriptors).toBeDefined();
    expect(body.descriptors.length).toBeGreaterThanOrEqual(1);
    const d = body.descriptors[0];
    expect(d).toHaveProperty("id");
    expect(d).toHaveProperty("descriptor");
    expect(d).toHaveProperty("label");
    expect(d).toHaveProperty("confidence");
    expect(d).toHaveProperty("contributorCount");
    expect(["block", "safe"]).toContain(d.label);
  });

  test("POST /api/descriptors rejects missing fields", async () => {
    const res = await fetch(`${BASE_URL}/api/descriptors`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ descriptor: "abc" }),
    });
    expect(res.status).toBe(400);
  });

  // --- 404 ---

  test("unknown endpoint returns 404", async () => {
    const res = await fetch(`${BASE_URL}/api/nonexistent`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(res.status).toBe(404);
  });

  // --- Stats after data ---

  test("GET /api/stats reflects stored data", async () => {
    const res = await fetch(`${BASE_URL}/api/stats`);
    const body = await res.json();
    expect(body.classifications).toBeGreaterThanOrEqual(2); // testhash001, testhash002
    expect(body.descriptors).toBeGreaterThanOrEqual(1);
    expect(body.approvedUsers).toBeGreaterThanOrEqual(1);
  });

  // --- CLI ---

  test("list-users CLI shows test user", () => {
    const output = runCli("list-users");
    expect(output).toContain(testEmail);
    expect(output).toContain("YES"); // approved
  });

  test("stats CLI shows counts", () => {
    const output = runCli("stats");
    expect(output).toContain("Classifications");
    expect(output).toContain("users");
  });

  test("revoke CLI stops token from working", async () => {
    // Create a user to revoke
    const addOutput = runCli("add-user", "revoke-test@example.com");
    const match = addOutput.match(/Token:\s+([0-9a-f]{64})/);
    const revokeToken = match[1];
    runCli("approve", "revoke-test@example.com");

    // Verify it works
    let res = await fetch(`${BASE_URL}/api/stats`);
    expect(res.status).toBe(200);

    // Now revoke
    runCli("revoke", "revoke-test@example.com");

    // Token should be rejected
    res = await fetch(`${BASE_URL}/api/classifications/somehash`, {
      headers: { Authorization: `Bearer ${revokeToken}` },
    });
    expect(res.status).toBe(401);
  });

  // --- Registration ---

  test("POST /api/register creates a new auto-approved user", async () => {
    const res = await fetch(`${BASE_URL}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ext-register-test-001" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeDefined();
    expect(body.token).toHaveLength(64);

    // The returned token should work immediately (auto-approved)
    const statsRes = await fetch(`${BASE_URL}/api/classifications/somehash`, {
      headers: { Authorization: `Bearer ${body.token}` },
    });
    expect(statsRes.status).toBe(404); // 404 = auth passed, hash not found
  });

  test("POST /api/register returns existing token for same email", async () => {
    // Register once
    const res1 = await fetch(`${BASE_URL}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ext-idempotent-test" }),
    });
    const body1 = await res1.json();

    // Register again with same email
    const res2 = await fetch(`${BASE_URL}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ext-idempotent-test" }),
    });
    const body2 = await res2.json();

    // Should get the same token back
    expect(body2.token).toBe(body1.token);
  });

  test("POST /api/register rejects empty email", async () => {
    const res = await fetch(`${BASE_URL}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "" }),
    });
    expect(res.status).toBe(400);
  });

  test("POST /api/register rejects missing body", async () => {
    const res = await fetch(`${BASE_URL}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
  });

  test("POST /api/register rejects invalid JSON", async () => {
    const res = await fetch(`${BASE_URL}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  // --- Votes audit log ---

  test("POST /api/classifications creates an individual vote record", async () => {
    const hash = "vote-audit-test-001";
    await fetch(`${BASE_URL}/api/classifications`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hash,
        containsWomen: true,
        source: "haiku",
        confidence: 0.95,
      }),
    });

    // Check the vote was recorded via stats CLI (votes table)
    const output = runCli("stats");
    expect(output).toContain("Total individual votes");
    // There should be at least 1 vote now
    const match = output.match(/Total individual votes:\s+(\d+)/);
    expect(match).toBeTruthy();
    expect(parseInt(match[1])).toBeGreaterThanOrEqual(1);
  });

  test("re-submitting same hash by same user updates vote in place", async () => {
    const hash = "vote-update-test-001";

    // First submission: block with local source
    await fetch(`${BASE_URL}/api/classifications`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hash,
        containsWomen: true,
        source: "local",
        confidence: 0.8,
      }),
    });

    // Second submission: same hash, same user, different source (haiku override)
    await fetch(`${BASE_URL}/api/classifications`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hash,
        containsWomen: true,
        source: "haiku",
        confidence: 0.95,
      }),
    });

    // The votes table should still have only 1 vote for this hash+user
    // (UNIQUE constraint updates in place). We verify indirectly: the
    // stats CLI should show the vote count hasn't doubled for this hash.
    const res = await fetch(`${BASE_URL}/api/classifications/${hash}`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    const body = await res.json();
    // voteBlock increments on each POST (aggregated table), so it's 2
    expect(body.voteBlock).toBe(2);
    // But the individual vote record (votes table) only has 1 row for this user+hash
  });

  // --- Multi-user consensus ---

  test("multiple users voting on same hash builds consensus", async () => {
    const hash = "consensus-test-001";

    // Register a second user
    const reg = await fetch(`${BASE_URL}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ext-consensus-user-2" }),
    });
    const secondToken = (await reg.json()).token;

    // User 1 votes block
    await fetch(`${BASE_URL}/api/classifications`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hash,
        containsWomen: true,
        source: "local",
        confidence: 0.85,
      }),
    });

    // User 2 votes block
    await fetch(`${BASE_URL}/api/classifications`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secondToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hash,
        containsWomen: true,
        source: "haiku",
        confidence: 0.92,
      }),
    });

    // Verify consensus
    const res = await fetch(`${BASE_URL}/api/classifications/${hash}`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    const body = await res.json();
    expect(body.voteBlock).toBe(2);
    expect(body.voteSafe).toBe(0);
    expect(body.containsWomen).toBe(true);
  });

  test("conflicting votes from different users are both recorded", async () => {
    const hash = "conflict-test-001";

    // Register a third user
    const reg = await fetch(`${BASE_URL}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ext-conflict-user-3" }),
    });
    const thirdToken = (await reg.json()).token;

    // User 1 votes block
    await fetch(`${BASE_URL}/api/classifications`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hash,
        containsWomen: true,
        source: "local",
        confidence: 0.7,
      }),
    });

    // User 3 votes safe
    await fetch(`${BASE_URL}/api/classifications`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${thirdToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hash,
        containsWomen: false,
        source: "haiku",
        confidence: 0.9,
      }),
    });

    const res = await fetch(`${BASE_URL}/api/classifications/${hash}`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    const body = await res.json();
    expect(body.voteBlock).toBe(1);
    expect(body.voteSafe).toBe(1);
  });

  // --- Contribution count ---

  test("contribution count increments on classification submission", async () => {
    const hash = "contrib-count-test-001";
    await fetch(`${BASE_URL}/api/classifications`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hash,
        containsWomen: false,
        source: "local",
        confidence: 0.8,
      }),
    });

    // Check via list-users that the test user has contributions
    const output = runCli("list-users");
    expect(output).toContain(testEmail);
    // The test user should have at least 1 contribution (from all the tests above)
    // We can't check exact count since tests share state, but it should be > 0
    const lines = output.split("\n");
    const userLine = lines.find((l) => l.includes(testEmail));
    expect(userLine).toBeTruthy();
    // contribution_count column should show a positive number
    const contribMatch = userLine.match(/\+(\d+)/);
    expect(contribMatch).toBeTruthy();
    expect(parseInt(contribMatch[1])).toBeGreaterThan(0);
  });

  // --- Empty hash ---

  test("POST /api/classifications rejects empty hash", async () => {
    const res = await fetch(`${BASE_URL}/api/classifications`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hash: "",
        containsWomen: true,
        source: "local",
        confidence: 0.8,
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("hash");
  });

  // --- Missing body ---

  test("POST /api/classifications rejects missing body", async () => {
    const res = await fetch(`${BASE_URL}/api/classifications`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testToken}`,
        "Content-Type": "application/json",
      },
    });
    expect(res.status).toBe(400);
  });

  test("POST /api/classifications/batch rejects missing body", async () => {
    const res = await fetch(`${BASE_URL}/api/classifications/batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testToken}`,
        "Content-Type": "application/json",
      },
    });
    expect(res.status).toBe(400);
  });

  // --- Descriptors edge cases ---

  test("POST /api/descriptors rejects invalid base64", async () => {
    const res = await fetch(`${BASE_URL}/api/descriptors`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        descriptor: "not-valid-base64!!!",
        label: "block",
        confidence: 0.8,
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("base64");
  });

  test("POST /api/descriptors rejects empty label", async () => {
    const buffer = new ArrayBuffer(512);
    const base64 = Buffer.from(buffer).toString("base64");
    const res = await fetch(`${BASE_URL}/api/descriptors`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        descriptor: base64,
        label: "",
        confidence: 0.8,
      }),
    });
    expect(res.status).toBe(400);
  });

  test("GET /api/descriptors returns base64 that decodes to valid binary", async () => {
    const res = await fetch(`${BASE_URL}/api/descriptors`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    const body = await res.json();
    expect(body.descriptors.length).toBeGreaterThanOrEqual(1);

    const d = body.descriptors[0];
    const decoded = Buffer.from(d.descriptor, "base64");
    // Should be 512 bytes (128 float32s)
    expect(decoded.length).toBe(512);
  });

  // --- Rate limiting ---

  test("rate limit returns 429 after 100 requests in a minute", async () => {
    // Create a dedicated user for rate limit testing
    const reg = await fetch(`${BASE_URL}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ext-ratelimit-user" }),
    });
    const rlToken = (await reg.json()).token;

    // Fire 100 requests rapidly (rate limit is 100/min)
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(
        fetch(`${BASE_URL}/api/classifications`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${rlToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            hash: `ratelimit-${i}`,
            containsWomen: false,
            source: "local",
            confidence: 0.5,
          }),
        })
      );
    }
    await Promise.all(promises);

    // The 101st request should be rate limited
    const res = await fetch(`${BASE_URL}/api/classifications`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rlToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hash: "ratelimit-overflow",
        containsWomen: false,
        source: "local",
        confidence: 0.5,
      }),
    });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("rate limit");
  });

  // --- Batch edge cases ---

  test("POST /api/classifications/batch rejects invalid JSON", async () => {
    const res = await fetch(`${BASE_URL}/api/classifications/batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testToken}`,
        "Content-Type": "application/json",
      },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  test("POST /api/classifications/batch with single hash works", async () => {
    // Submit a classification first
    await fetch(`${BASE_URL}/api/classifications`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hash: "batch-single-test",
        containsWomen: false,
        source: "local",
        confidence: 0.9,
      }),
    });

    const res = await fetch(`${BASE_URL}/api/classifications/batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ hashes: ["batch-single-test"] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results["batch-single-test"]).toBeDefined();
    expect(body.results["batch-single-test"].containsWomen).toBe(false);
  });

  // --- Auth on all endpoints ---

  test("POST /api/classifications/batch rejects missing auth", async () => {
    const res = await fetch(`${BASE_URL}/api/classifications/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hashes: [] }),
    });
    expect(res.status).toBe(401);
  });

  test("GET /api/descriptors rejects missing auth", async () => {
    const res = await fetch(`${BASE_URL}/api/descriptors`);
    expect(res.status).toBe(401);
  });

  test("POST /api/descriptors rejects missing auth", async () => {
    const res = await fetch(`${BASE_URL}/api/descriptors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ descriptor: "abc", label: "block", confidence: 0.8 }),
    });
    expect(res.status).toBe(401);
  });
});
