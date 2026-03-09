// playwright.config.js — Firefox extension testing configuration
const { defineConfig } = require("@playwright/test");
const path = require("path");

// Path to the unpacked extension directory
const EXTENSION_PATH = path.resolve(__dirname, "shmirat-eynaim");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 60_000,          // 60s per test (ML models need time to load)
  retries: 1,               // Retry flaky tests once
  workers: 1,               // Sequential — one browser instance at a time
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "test-results/html-report" }],
  ],

  // Screenshot and video settings for debugging
  use: {
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "firefox",
      use: {
        browserName: "firefox",
        // Launch Firefox with the extension pre-loaded
        launchOptions: {
          // Firefox loads extensions via a temporary profile
          // We use the Playwright Firefox extension loading approach
          firefoxUserPrefs: {
            // Allow unsigned extensions (needed for development)
            "xpinstall.signatures.required": false,
            // Disable various Firefox UI elements that interfere with testing
            "browser.shell.checkDefaultBrowser": false,
            "browser.startup.homepage_override.mstone": "ignore",
            "datareporting.policy.dataSubmissionEnabled": false,
            "toolkit.telemetry.reportingpolicy.firstRun": false,
            // Enable extension debugging
            "devtools.chrome.enabled": true,
            "devtools.debugger.remote-enabled": true,
          },
          args: [],
        },
      },
    },
  ],

  // Serve local test fixture pages
  webServer: {
    command: "node tests/fixtures/server.js",
    port: 3999,
    reuseExistingServer: true,
    timeout: 10_000,
  },

  // Output directories
  outputDir: "test-results/artifacts",
});
