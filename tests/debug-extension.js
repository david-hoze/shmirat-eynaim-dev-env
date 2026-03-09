// tests/debug-extension.js — Diagnostic: Why does Firefox DELETE our extension files?
const { firefox } = require("playwright");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { createProfileWithExtension, EXTENSION_DIR, copyDirSync } = require("./helpers/firefox-extension");

const SCREENSHOTS_DIR = path.resolve(__dirname, "../test-results/screenshots");
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const { execSync } = require("child_process");

function createXpiFromDir(sourceDir, destXpiPath) {
  const tempZip = destXpiPath + ".zip";
  try { fs.unlinkSync(tempZip); } catch {}
  try { fs.unlinkSync(destXpiPath); } catch {}
  try {
    execSync(`cd "${sourceDir}" && zip -r "${destXpiPath}" .`, { stdio: "pipe" });
  } catch {
    const psSrc = sourceDir.replace(/\//g, "\\");
    const psZip = tempZip.replace(/\//g, "\\");
    execSync(`powershell -Command "Compress-Archive -Path '${psSrc}\\*' -DestinationPath '${psZip}' -Force"`, { stdio: "pipe" });
    fs.renameSync(tempZip, destXpiPath);
  }
}

// ============================================================
// KEY FINDING: Firefox deletes sideloaded extensions!
// The prefs show extensions.enabledScopes=5 (profile+application)
// but the XPI files are DELETED from extensions/ during startup.
//
// This is likely because Playwright's Firefox 146 treats sideloaded
// extensions as needing signature verification, and since xpinstall.signatures.required
// may not be actually taking effect (could be locked in playwright.cfg).
//
// Let's verify:
// 1. Is xpinstall.signatures.required being overridden?
// 2. Is there a way to use Playwright's own extension loading API?
// 3. Can we use the temporary addon loading API via about:debugging?
// ============================================================

async function testSignatureEnforcement() {
  console.log("\n========================================");
  console.log("TEST 1: Check if xpinstall.signatures.required is being overridden");
  console.log("========================================\n");

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "fx-sig-"));
  const extensionsDir = path.join(profileDir, "extensions");
  fs.mkdirSync(extensionsDir, { recursive: true });

  // Create minimal extension XPI
  const tinyDir = fs.mkdtempSync(path.join(os.tmpdir(), "tiny-"));
  fs.writeFileSync(path.join(tinyDir, "manifest.json"), JSON.stringify({
    manifest_version: 2,
    name: "Sig Test",
    version: "1.0",
    browser_specific_settings: { gecko: { id: "sig-test@example.com" } },
    content_scripts: [{ matches: ["<all_urls>"], js: ["c.js"], run_at: "document_start" }]
  }));
  fs.writeFileSync(path.join(tinyDir, "c.js"), 'console.log("SIG_TEST_RUNNING");');

  createXpiFromDir(tinyDir, path.join(extensionsDir, "sig-test@example.com.xpi"));
  console.log("XPI created. Extensions dir:", fs.readdirSync(extensionsDir));

  // Write a watcher script to detect when the file disappears
  fs.writeFileSync(path.join(profileDir, "user.js"), `
user_pref("xpinstall.signatures.required", false);
user_pref("extensions.autoDisableScopes", 0);
user_pref("extensions.enabledScopes", 15);
`);

  let context;
  try {
    // Monitor the extensions dir
    const extDirBefore = fs.readdirSync(extensionsDir);
    console.log("Extensions dir BEFORE launch:", extDirBefore);

    context = await firefox.launchPersistentContext(profileDir, {
      headless: true,
      firefoxUserPrefs: {
        "xpinstall.signatures.required": false,
        "extensions.autoDisableScopes": 0,
        "extensions.enabledScopes": 15,
        "extensions.experiments.enabled": true,
      },
      args: ["-no-remote"],
    });

    const extDirAfter = fs.readdirSync(extensionsDir);
    console.log("Extensions dir AFTER launch:", extDirAfter);

    // Check if there's a staged/ or trash/ dir
    for (const sub of ["staged", "trash", "pending"]) {
      const subDir = path.join(extensionsDir, sub);
      if (fs.existsSync(subDir)) {
        console.log(`${sub}/ dir contents:`, fs.readdirSync(subDir));
      }
    }

    // Read prefs.js to check actual pref values
    const prefsPath = path.join(profileDir, "prefs.js");
    if (fs.existsSync(prefsPath)) {
      const prefs = fs.readFileSync(prefsPath, "utf-8");
      const sigPref = prefs.split("\n").find(l => l.includes("xpinstall.signatures.required"));
      const scopePref = prefs.split("\n").find(l => l.includes("enabledScopes"));
      const autoDisable = prefs.split("\n").find(l => l.includes("autoDisableScopes"));
      console.log("\nActual prefs:");
      console.log("  xpinstall.signatures.required:", sigPref || "(not set)");
      console.log("  enabledScopes:", scopePref || "(not set)");
      console.log("  autoDisableScopes:", autoDisable || "(not set)");
    }

    // Check about:config via page
    const page = await context.newPage();
    await page.goto("about:blank");
    const sigValue = await page.evaluate(() => {
      try {
        // In Firefox, we can check prefs via about:config internals
        // But from content, we can't access chrome APIs
        return "cannot access from content";
      } catch { return "error"; }
    });
    console.log("xpinstall.signatures.required from page:", sigValue);

    // Check extensions.json for clues
    const extJsonPath = path.join(profileDir, "extensions.json");
    if (fs.existsSync(extJsonPath)) {
      const raw = fs.readFileSync(extJsonPath, "utf-8");
      if (raw.includes("sig-test")) {
        console.log("\nExtension FOUND in extensions.json!");
        const extJson = JSON.parse(raw);
        const addon = extJson.addons.find(a => a.id === "sig-test@example.com");
        console.log("Addon:", JSON.stringify(addon, null, 2));
      } else {
        console.log("\nExtension NOT in extensions.json - Firefox rejected it entirely");
      }
    }

    await page.close();
  } finally {
    if (context) await context.close();
  }
}

async function testPlaywrightCfgOverrides() {
  console.log("\n\n========================================");
  console.log("TEST 2: Check playwright.cfg lockPref/pref behavior");
  console.log("========================================\n");

  // Read playwright.cfg to find any lockPref calls
  const firefoxDir = path.dirname(firefox.executablePath());
  const cfgPath = path.join(firefoxDir, "playwright.cfg");
  if (fs.existsSync(cfgPath)) {
    const cfg = fs.readFileSync(cfgPath, "utf-8");

    // Check for lockPref calls
    const lockPrefs = cfg.split("\n").filter(l => l.includes("lockPref"));
    console.log("lockPref calls in playwright.cfg:");
    for (const line of lockPrefs) console.log("  " + line.trim());

    // Check for extension-related prefs
    const extPrefs = cfg.split("\n").filter(l =>
      (l.includes("extension") || l.includes("xpinstall") || l.includes("addon")) &&
      l.includes("pref(")
    );
    console.log("\nExtension-related prefs in playwright.cfg:");
    for (const line of extPrefs) console.log("  " + line.trim());

    // KEY: pref() in autoconfig files (like playwright.cfg) is applied at startup
    // and overrides user.js AND firefoxUserPrefs. Only defaultPref() can be overridden.
    // lockPref() cannot be overridden at all.
    console.log("\nNOTE: pref() in autoconfig (playwright.cfg) overrides user.js!");
    console.log("This means extensions.enabledScopes=5 CANNOT be changed via firefoxUserPrefs!");
    console.log("And extensions.autoDisableScopes=0 CAN be set since it matches playwright.cfg.");
  }
}

async function testAddInitScript() {
  console.log("\n\n========================================");
  console.log("TEST 3: Try loading extension via addInitScript or other Playwright APIs");
  console.log("========================================\n");

  // Since sideloading doesn't work, let's check if we can install via
  // the internal Firefox addon manager APIs through a privileged page

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "fx-install-"));

  let context;
  try {
    context = await firefox.launchPersistentContext(profileDir, {
      headless: true,
      firefoxUserPrefs: {
        "xpinstall.signatures.required": false,
        "extensions.autoDisableScopes": 0,
        "extensions.enabledScopes": 15,
        "devtools.chrome.enabled": true,
        "devtools.debugger.remote-enabled": true,
      },
      args: ["-no-remote"],
    });
    console.log("Firefox launched.\n");

    // Try to use about:debugging to load a temporary addon
    // This requires navigating to about:debugging and clicking "Load Temporary Add-on"
    // But about:debugging times out. Let's try a different approach.

    // Check if we can use the Browser Console or DevTools
    const page = await context.newPage();

    // Try loading extension content via addInitScript as a workaround
    // This simulates what the content script does
    console.log("Testing addInitScript approach (content script simulation)...");

    await context.addInitScript(`
      console.log("INIT_SCRIPT_RUNNING");
      window.__initScriptRan = true;
    `);

    await page.goto("http://localhost:3999/test-icons.html", { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(2000);

    const initRan = await page.evaluate(() => window.__initScriptRan);
    console.log("addInitScript ran:", initRan);

    // This confirms we can inject scripts into pages
    // But we need the extension's browser.runtime API for messaging
    console.log("\naddInitScript works - this could be a workaround for content scripts");
    console.log("But it lacks browser.runtime.sendMessage and other extension APIs");

    await page.close();
  } finally {
    if (context) await context.close();
  }
}

async function testWebExtRun() {
  console.log("\n\n========================================");
  console.log("TEST 4: Try web-ext + Playwright connect approach");
  console.log("========================================\n");

  // Check if web-ext is available
  try {
    const webExtVersion = execSync("npx web-ext --version", { timeout: 15000, stdio: "pipe" }).toString().trim();
    console.log("web-ext version:", webExtVersion);
  } catch (e) {
    console.log("web-ext not available:", e.message.split("\n")[0]);
    console.log("This approach would require: npm install -D web-ext");
  }

  // Check if Playwright supports connectOverCDP for Firefox
  console.log("\nPlaywright firefox methods:");
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(firefox));
  console.log(methods.join(", "));

  // Check for connect method
  if (methods.includes("connect")) {
    console.log("\nfirefox.connect() is available - could connect to a running Firefox instance");
  }
  if (methods.includes("connectOverCDP")) {
    console.log("firefox.connectOverCDP() is available");
  }
}

async function testModifyPlaywrightCfg() {
  console.log("\n\n========================================");
  console.log("TEST 5: SOLUTION - What needs to change");
  console.log("========================================\n");

  const firefoxDir = path.dirname(firefox.executablePath());
  const cfgPath = path.join(firefoxDir, "playwright.cfg");
  const cfg = fs.readFileSync(cfgPath, "utf-8");

  console.log("The root cause is in playwright.cfg:");
  console.log("  pref(\"extensions.enabledScopes\", 5);");
  console.log("");
  console.log("This pref() call in autoconfig OVERRIDES firefoxUserPrefs and user.js.");
  console.log("enabledScopes=5 means SCOPE_PROFILE(1) + SCOPE_APPLICATION(4) = 5");
  console.log("enabledScopes=15 means ALL SCOPES = PROFILE + USER + APPLICATION + SYSTEM");
  console.log("");
  console.log("However, even with enabledScopes=5 (which includes SCOPE_PROFILE),");
  console.log("sideloaded extensions should still be loaded from the profile's");
  console.log("extensions/ directory.");
  console.log("");
  console.log("The REAL issue might be that Firefox 146 (Nightly/Playwright build)");
  console.log("requires signed extensions even when xpinstall.signatures.required=false,");
  console.log("OR that the XPI files are being deleted because they fail validation.");
  console.log("");
  console.log("Key observation: Extensions dir is EMPTY after launch - Firefox DELETED the XPI!");
  console.log("This suggests signature validation failure and automatic cleanup.");
  console.log("");

  // Let's check if we can work around by modifying playwright.cfg
  console.log("POSSIBLE SOLUTIONS:");
  console.log("1. Modify playwright.cfg to change enabledScopes to 15 and add");
  console.log("   pref('xpinstall.signatures.required', false);");
  console.log("2. Use Playwright's addInitScript to inject extension content.js");
  console.log("3. Use web-ext to load the extension temporarily");
  console.log("4. Use Playwright's route() to intercept and serve extension files");
  console.log("5. Sign the extension with web-ext sign (requires AMO account)");

  // Let's actually try modifying playwright.cfg
  console.log("\n--- Attempting to modify playwright.cfg ---");
  console.log("Current file:", cfgPath);

  // Check if we can write to it
  try {
    fs.accessSync(cfgPath, fs.constants.W_OK);
    console.log("File is writable: YES");

    // Add xpinstall.signatures.required = false to playwright.cfg
    if (!cfg.includes("xpinstall.signatures.required")) {
      const newCfg = cfg + `
// Allow unsigned extensions for testing
pref("xpinstall.signatures.required", false);
// Allow all extension scopes
pref("extensions.enabledScopes", 15);
`;
      // Don't actually write it yet - just show what we'd do
      console.log("\nWould add to playwright.cfg:");
      console.log('  pref("xpinstall.signatures.required", false);');
      console.log('  pref("extensions.enabledScopes", 15);');
    }
  } catch (e) {
    console.log("File is writable: NO -", e.message.split("\n")[0]);
  }

  // Actually, let's try it!
  console.log("\n--- Actually modifying playwright.cfg and retesting ---");
  const backupPath = cfgPath + ".bak";
  try {
    fs.copyFileSync(cfgPath, backupPath);
    console.log("Backup created:", backupPath);

    // Modify the enabledScopes line and add xpinstall pref
    let newCfg = cfg.replace(
      'pref("extensions.enabledScopes", 5);',
      'pref("extensions.enabledScopes", 15);'
    );
    if (!newCfg.includes("xpinstall.signatures.required")) {
      newCfg += '\npref("xpinstall.signatures.required", false);\n';
    }
    fs.writeFileSync(cfgPath, newCfg);
    console.log("playwright.cfg modified successfully");

    // Now test with a fresh profile
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "fx-modcfg-"));
    const extensionsDir = path.join(profileDir, "extensions");
    fs.mkdirSync(extensionsDir, { recursive: true });

    // Create probe XPI
    const tinyDir = fs.mkdtempSync(path.join(os.tmpdir(), "tiny3-"));
    fs.writeFileSync(path.join(tinyDir, "manifest.json"), JSON.stringify({
      manifest_version: 2,
      name: "Post-Mod Test",
      version: "1.0",
      browser_specific_settings: { gecko: { id: "post-mod@test.com" } },
      content_scripts: [{ matches: ["<all_urls>"], js: ["c.js"], run_at: "document_start" }]
    }));
    fs.writeFileSync(path.join(tinyDir, "c.js"), 'console.log("POST_MOD_EXTENSION_LOADED");');
    createXpiFromDir(tinyDir, path.join(extensionsDir, "post-mod@test.com.xpi"));

    // Also add real extension
    const manifest = JSON.parse(fs.readFileSync(path.join(EXTENSION_DIR, "manifest.json"), "utf-8"));
    const extId = manifest?.browser_specific_settings?.gecko?.id || "shmirat-eynaim@example.com";
    const { profileDir: tmpP } = createProfileWithExtension();
    const srcXpi = path.join(tmpP, "extensions", `${extId}.xpi`);
    if (fs.existsSync(srcXpi)) {
      fs.copyFileSync(srcXpi, path.join(extensionsDir, `${extId}.xpi`));
    }

    console.log("Extensions before launch:", fs.readdirSync(extensionsDir));

    let context;
    try {
      context = await firefox.launchPersistentContext(profileDir, {
        headless: true,
        firefoxUserPrefs: {
          "xpinstall.signatures.required": false,
          "extensions.autoDisableScopes": 0,
          "extensions.enabledScopes": 15,
        },
        args: ["-no-remote"],
      });
      console.log("Firefox launched with modified cfg.\n");

      console.log("Extensions AFTER launch:", fs.readdirSync(extensionsDir));

      // Check extensions.json
      const extJsonPath = path.join(profileDir, "extensions.json");
      if (fs.existsSync(extJsonPath)) {
        const extJson = JSON.parse(fs.readFileSync(extJsonPath, "utf-8"));
        const nonBuiltin = extJson.addons?.filter(a => !a.location?.includes("app-builtin"));
        console.log("Non-builtin addons:", nonBuiltin?.length || 0);
        for (const a of (nonBuiltin || [])) {
          console.log(`  id=${a.id} active=${a.active} appDisabled=${a.appDisabled} userDisabled=${a.userDisabled}`);
          if (a.path) console.log(`    path=${a.path}`);
        }
      }

      // Check prefs
      const prefsPath = path.join(profileDir, "prefs.js");
      if (fs.existsSync(prefsPath)) {
        const prefs = fs.readFileSync(prefsPath, "utf-8");
        const sigLine = prefs.split("\n").find(l => l.includes("xpinstall.signatures"));
        const scopeLine = prefs.split("\n").find(l => l.includes("enabledScopes"));
        console.log("\nActual prefs after cfg mod:");
        console.log("  signatures:", sigLine || "(not set)");
        console.log("  enabledScopes:", scopeLine || "(not set)");
      }

      // Test page
      const page = await context.newPage();
      const consoleLogs = [];
      page.on("console", (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

      await page.goto("http://localhost:3999/test-icons.html", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(5000);

      console.log("\ntypeof browser:", await page.evaluate(() => typeof browser));
      console.log("Console:");
      for (const log of consoleLogs) console.log("  " + log);
      if (consoleLogs.some(l => l.includes("POST_MOD"))) {
        console.log("\n*** SUCCESS! Extension is loading after playwright.cfg modification! ***");
      } else {
        console.log("\n*** Extension still NOT loading even after cfg modification ***");
      }

      // Check image states
      const imgs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("img")).map(img => ({
          src: img.src.substring(0, 60),
          classes: img.className,
        }));
      });
      console.log("\nImage states:");
      for (const img of imgs) console.log(`  ${img.src} | classes="${img.classes}"`);

      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "debug-modcfg-test-page.png"), fullPage: true });
      console.log("Screenshot saved: debug-modcfg-test-page.png");

      await page.close();
    } finally {
      if (context) await context.close();
    }

  } catch (e) {
    console.error("Error modifying cfg:", e.message);
  } finally {
    // Restore backup
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, cfgPath);
      fs.unlinkSync(backupPath);
      console.log("\nplaywright.cfg restored from backup");
    }
  }
}

// ============================================================
// MAIN
// ============================================================
(async () => {
  console.log("=== FIREFOX EXTENSION LOADING DIAGNOSTIC ===");
  console.log("Date:", new Date().toISOString());
  console.log("Playwright version:", require("playwright/package.json").version);
  console.log("Firefox:", firefox.executablePath());

  await testSignatureEnforcement();
  await testPlaywrightCfgOverrides();
  await testAddInitScript();
  await testWebExtRun();
  await testModifyPlaywrightCfg();

  console.log("\n\n========================================");
  console.log("DIAGNOSTIC COMPLETE");
  console.log("========================================");
})();
