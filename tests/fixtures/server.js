// tests/fixtures/server.js — Serves test HTML pages on port 3999
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3999;
const FIXTURES_DIR = __dirname;

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  // Serve files from fixtures directory
  let filePath = path.join(FIXTURES_DIR, req.url === "/" ? "index.html" : req.url);

  // Security: prevent directory traversal
  if (!filePath.startsWith(FIXTURES_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404);
        res.end("Not Found: " + req.url);
      } else {
        res.writeHead(500);
        res.end("Server Error");
      }
      return;
    }
    // CORS headers for cross-origin image fetching in tests
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`[Test Fixture Server] Running on http://localhost:${PORT}`);
});
