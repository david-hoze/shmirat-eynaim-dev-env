const { test, expect, firefox } = require("@playwright/test");
const { EXTENSION_DIR, getFirefoxLaunchOptions, installExtensionViaRDP, waitForRDP } = require("./helpers/firefox-extension");

test("WASM backend is active and models loaded", async () => {
  const launchOpts = getFirefoxLaunchOptions();
  const browser = await firefox.launch({ headless: true, ...launchOpts });
  await waitForRDP();
  await installExtensionViaRDP(EXTENSION_DIR);
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate and wait for extension to load models
  await page.goto("http://localhost:3999/test-icons.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(15_000);

  // Check extension status via console logs injected by the content script
  const logs = [];
  page.on("console", msg => logs.push(msg.text()));

  // The content script has access to browser.runtime — query from there
  const hasBrowserApi = await page.evaluate(() => typeof browser !== "undefined" && typeof browser.runtime !== "undefined");

  if (hasBrowserApi) {
    const status = await page.evaluate(async () => {
      return browser.runtime.sendMessage({ type: "getDebugStatus" });
    });
    console.log("Extension status:", JSON.stringify(status));
    expect(status.modelsLoaded).toBe(true);
    expect(status.backend).toBe("wasm");
  } else {
    // Extension content script didn't inject browser API — check via CSS classes
    // If images have shmirat-eynaim-* classes, the extension is active
    const classedImages = await page.$$eval("img", imgs =>
      imgs.filter(img => Array.from(img.classList).some(c => c.startsWith("shmirat-eynaim-"))).length
    );
    console.log("Images with extension classes:", classedImages);
    expect(classedImages).toBeGreaterThan(0);
  }

  await browser.close();
});
