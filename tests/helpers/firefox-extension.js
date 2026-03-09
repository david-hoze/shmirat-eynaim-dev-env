// tests/helpers/firefox-extension.js
// Helper for loading a Firefox extension in Playwright via Remote Debugging Protocol
//
// Strategy: Launch Firefox with -start-debugger-server, connect via TCP,
// and use installTemporaryAddon to load the extension.

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const net = require("net");

const EXTENSION_DIR = path.resolve(__dirname, "../../shmirat-eynaim");
const RDP_PORT = 12345;

/**
 * Send a message to Firefox RDP and wait for response
 */
function rdpSend(socket, message) {
  return new Promise((resolve, reject) => {
    const json = JSON.stringify(message);
    const payload = `${json.length}:${json}`;

    let buffer = "";
    const onData = (data) => {
      buffer += data.toString();
      // RDP messages are length:json format
      const colonIdx = buffer.indexOf(":");
      if (colonIdx === -1) return;
      const len = parseInt(buffer.substring(0, colonIdx), 10);
      const jsonStart = colonIdx + 1;
      if (buffer.length >= jsonStart + len) {
        socket.removeListener("data", onData);
        try {
          const response = JSON.parse(buffer.substring(jsonStart, jsonStart + len));
          resolve(response);
        } catch (e) {
          reject(new Error("Failed to parse RDP response: " + buffer.substring(jsonStart, jsonStart + len)));
        }
      }
    };

    socket.on("data", onData);
    socket.write(payload);

    // Timeout after 10 seconds
    setTimeout(() => {
      socket.removeListener("data", onData);
      reject(new Error("RDP timeout"));
    }, 10000);
  });
}

/**
 * Connect to Firefox RDP and install the extension as a temporary addon
 */
async function installExtensionViaRDP(extensionPath, port = RDP_PORT) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let resolved = false;

    socket.connect(port, "127.0.0.1", async () => {
      try {
        // Read the initial greeting/handshake
        await new Promise((res) => {
          let buf = "";
          const onData = (data) => {
            buf += data.toString();
            const colonIdx = buf.indexOf(":");
            if (colonIdx === -1) return;
            const len = parseInt(buf.substring(0, colonIdx), 10);
            if (buf.length >= colonIdx + 1 + len) {
              socket.removeListener("data", onData);
              res();
            }
          };
          socket.on("data", onData);
        });

        // Get root actor to find addons actor
        const root = await rdpSend(socket, { to: "root", type: "getRoot" });
        const addonsActor = root.addonsActor;

        if (!addonsActor) {
          throw new Error("No addons actor found in RDP root: " + JSON.stringify(root));
        }

        // Install the temporary addon
        const result = await rdpSend(socket, {
          to: addonsActor,
          type: "installTemporaryAddon",
          addonPath: extensionPath,
        });

        if (result.error) {
          throw new Error("Failed to install addon: " + JSON.stringify(result));
        }

        console.log("[Extension Helper] Extension installed via RDP:", result.addon?.id || "ok");
        resolved = true;
        socket.destroy();
        resolve(result);
      } catch (err) {
        socket.destroy();
        if (!resolved) reject(err);
      }
    });

    socket.on("error", (err) => {
      if (!resolved) reject(err);
    });
  });
}

/**
 * Wait for the RDP port to become available
 */
async function waitForRDP(port = RDP_PORT, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await new Promise((resolve, reject) => {
        const socket = new net.Socket();
        socket.connect(port, "127.0.0.1", () => {
          socket.destroy();
          resolve();
        });
        socket.on("error", reject);
        socket.setTimeout(1000, () => {
          socket.destroy();
          reject(new Error("timeout"));
        });
      });
      return; // Connected successfully
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`RDP port ${port} not available after ${timeout}ms`);
}

/**
 * Get launch options for Firefox with debugger server enabled.
 * After launching, call installExtensionViaRDP() to load the extension.
 */
function getFirefoxLaunchOptions(port = RDP_PORT) {
  return {
    firefoxUserPrefs: {
      "xpinstall.signatures.required": false,
      "extensions.autoDisableScopes": 0,
      "extensions.enabledScopes": 15,
      "devtools.debugger.remote-enabled": true,
      "devtools.debugger.prompt-connection": false,
      "devtools.chrome.enabled": true,
    },
    args: ["-start-debugger-server", String(port), "-no-remote"],
  };
}

/**
 * Recursively copy a directory
 */
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Keep createProfileWithExtension for backward compat but it's no longer primary
function createProfileWithExtension() {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "fx-profile-"));
  const manifest = JSON.parse(
    fs.readFileSync(path.join(EXTENSION_DIR, "manifest.json"), "utf-8")
  );
  const extId =
    manifest?.browser_specific_settings?.gecko?.id ||
    manifest?.applications?.gecko?.id ||
    "shmirat-eynaim@example.com";

  return { profileDir, extId };
}

module.exports = {
  EXTENSION_DIR,
  RDP_PORT,
  getFirefoxLaunchOptions,
  installExtensionViaRDP,
  waitForRDP,
  createProfileWithExtension,
  copyDirSync,
};
