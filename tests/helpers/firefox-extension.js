// tests/helpers/firefox-extension.js
// Helper for loading a temporary Firefox extension in Playwright
//
// Firefox extension loading in Playwright:
// Unlike Chromium (which supports --load-extension), Firefox requires
// installing extensions via the browser's internal APIs. We use
// Playwright's CDP-free approach: create a profile with the extension
// pre-installed, or use the web-ext tool to load it temporarily.
//
// Strategy: Use `web-ext run` to launch Firefox with the extension,
// then connect Playwright to the existing browser. Alternatively,
// install the extension via the about:debugging API.

const { execSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const EXTENSION_DIR = path.resolve(__dirname, "../../shmirat-eynaim");

/**
 * Create a Firefox profile with the extension pre-installed.
 * This copies the extension to the profile's extensions directory.
 */
function createProfileWithExtension() {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "fx-profile-"));
  const extensionsDir = path.join(profileDir, "extensions");
  fs.mkdirSync(extensionsDir, { recursive: true });

  // Read the extension ID from manifest.json
  const manifest = JSON.parse(
    fs.readFileSync(path.join(EXTENSION_DIR, "manifest.json"), "utf-8")
  );

  // The extension ID from manifest's browser_specific_settings.gecko.id
  // or fall back to a generated one
  const extId =
    manifest?.browser_specific_settings?.gecko?.id ||
    manifest?.applications?.gecko?.id ||
    "shmirat-eynaim@example.com";

  // Copy extension directory as {id} directory in the profile
  const extDest = path.join(extensionsDir, extId);
  copyDirSync(EXTENSION_DIR, extDest);

  // Create user.js with required prefs
  const userPrefs = `
user_pref("xpinstall.signatures.required", false);
user_pref("extensions.autoDisableScopes", 0);
user_pref("extensions.enabledScopes", 15);
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.startup.homepage_override.mstone", "ignore");
user_pref("datareporting.policy.dataSubmissionEnabled", false);
user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);
user_pref("app.update.enabled", false);
user_pref("browser.startup.page", 0);
user_pref("browser.startup.homepage", "about:blank");
`;
  fs.writeFileSync(path.join(profileDir, "user.js"), userPrefs);

  return { profileDir, extId };
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

/**
 * Launch Firefox with the extension using Playwright.
 * Returns a configured browser launch options object.
 */
function getFirefoxLaunchOptions() {
  const { profileDir, extId } = createProfileWithExtension();

  return {
    firefoxUserPrefs: {
      "xpinstall.signatures.required": false,
      "extensions.autoDisableScopes": 0,
      "extensions.enabledScopes": 15,
    },
    args: ["-profile", profileDir, "-no-remote"],
    _profileDir: profileDir,  // For cleanup
    _extId: extId,
  };
}

/**
 * Install extension via web-ext (alternative approach).
 * Requires: npm install -g web-ext
 */
function installViaWebExt(port) {
  try {
    execSync(
      `web-ext run --source-dir="${EXTENSION_DIR}" --firefox-port=${port} --no-reload`,
      { timeout: 10_000 }
    );
  } catch (err) {
    console.warn("web-ext installation failed:", err.message);
  }
}

module.exports = {
  EXTENSION_DIR,
  createProfileWithExtension,
  getFirefoxLaunchOptions,
  copyDirSync,
};
