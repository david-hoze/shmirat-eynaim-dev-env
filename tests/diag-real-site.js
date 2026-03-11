const { firefox } = require("@playwright/test");
const { EXTENSION_DIR, getFirefoxLaunchOptions, installExtensionViaRDP, waitForRDP, createProfileWithExtension } = require("./helpers/firefox-extension");

(async () => {
  const extensionProfile = createProfileWithExtension();
  const launchOpts = getFirefoxLaunchOptions();
  const browser = await firefox.launch({ headless: true, ...launchOpts });
  await waitForRDP();
  await installExtensionViaRDP(EXTENSION_DIR);
  const context = await browser.newContext();

  const initPage = await context.newPage();
  await initPage.goto("about:blank");
  await initPage.waitForTimeout(3000);
  await initPage.close();

  const page = await context.newPage();
  const logs = [];
  page.on("console", msg => logs.push(msg.text()));
  page.on("pageerror", err => logs.push("PAGEERROR: " + err.message));

  try {
    await page.goto("https://www.ynet.co.il", { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch(e) {
    console.log("Nav:", e.message.substring(0, 100));
  }

  await page.waitForTimeout(30000);

  const states = await page.evaluate(() => {
    const imgs = document.querySelectorAll("img");
    const noClass = Array.from(imgs).filter(i => {
      return !i.className.includes("shmirat-eynaim");
    }).length;
    return {
      total: imgs.length,
      pending: document.querySelectorAll(".shmirat-eynaim-pending").length,
      safe: document.querySelectorAll(".shmirat-eynaim-safe").length,
      blocked: document.querySelectorAll(".shmirat-eynaim-blocked").length,
      noExtClass: noClass,
      hasSe: !!window.__se,
      pipelineDisabled: !!window.__sePipelineDisabled,
    };
  });
  console.log("Stats:", JSON.stringify(states));

  const seLogs = logs.filter(l => l.includes("[SE]"));
  console.log("SE logs (" + seLogs.length + " total, showing first 40):");
  seLogs.slice(0, 40).forEach(l => console.log("  " + l));

  const errors = logs.filter(l => l.startsWith("PAGEERROR"));
  if (errors.length > 0) {
    console.log("Page errors (" + errors.length + "):");
    errors.slice(0, 5).forEach(l => console.log("  " + l));
  }

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
