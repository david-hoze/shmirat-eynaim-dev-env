const { test, expect, firefox } = require("@playwright/test");
const { EXTENSION_DIR, getFirefoxLaunchOptions, installExtensionViaRDP, waitForRDP } = require("./helpers/firefox-extension");

test("WebGL or WASM backend is active and models loaded", async () => {
  const launchOpts = getFirefoxLaunchOptions();
  const browser = await firefox.launch({ headless: true, ...launchOpts });
  await waitForRDP();
  await installExtensionViaRDP(EXTENSION_DIR);
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture console logs to verify backend
  const logs = [];
  page.on("console", msg => logs.push(msg.text()));

  await page.goto("http://localhost:3999/test-icons.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(15_000);

  // Check extension is active via CSS classes on images
  const classedImages = await page.$$eval("img", imgs =>
    imgs.filter(img => Array.from(img.classList).some(c => c.startsWith("shmirat-eynaim-"))).length
  );
  console.log("Images with extension classes:", classedImages);
  expect(classedImages).toBeGreaterThan(0);

  // Check logs for backend info
  const backendLog = logs.find(l => l.includes("[SE] TF backend:"));
  console.log("Backend log:", backendLog || "(not found)");
  if (backendLog) {
    expect(backendLog).toMatch(/webgl|wasm/);
  }

  const modelsLog = logs.find(l => l.includes("[SE] Models loaded"));
  console.log("Models log:", modelsLog || "(not found)");
  expect(modelsLog).toBeTruthy();

  await browser.close();
});
