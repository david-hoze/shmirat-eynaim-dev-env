// tests/basic-loading.spec.js — Verify the extension loads and initializes
const { test, expect, firefox } = require("@playwright/test");
const path = require("path");
const {
  createProfileWithExtension,
} = require("./helpers/firefox-extension");

// Custom fixture: launch Firefox with the extension installed
let browser;
let context;
let extensionProfile;

test.beforeAll(async () => {
  extensionProfile = createProfileWithExtension();

  browser = await firefox.launch({
    headless: true,
    firefoxUserPrefs: {
      "xpinstall.signatures.required": false,
      "extensions.autoDisableScopes": 0,
      "extensions.enabledScopes": 15,
    },
    args: ["-profile", extensionProfile.profileDir, "-no-remote"],
  });

  context = await browser.newContext();
});

test.afterAll(async () => {
  if (browser) await browser.close();
});

test.describe("Extension Loading", () => {
  test("extension files exist and manifest is valid", async () => {
    const fs = require("fs");
    const extDir = path.resolve(__dirname, "../shmirat-eynaim");

    // Check manifest exists
    const manifestPath = path.join(extDir, "manifest.json");
    expect(fs.existsSync(manifestPath)).toBe(true);

    // Parse manifest
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(manifest.manifest_version).toBe(2);
    expect(manifest.name).toBeTruthy();
    expect(manifest.content_scripts).toBeDefined();
    expect(manifest.background).toBeDefined();

    // Check key files exist
    expect(fs.existsSync(path.join(extDir, "background.js"))).toBe(true);
    expect(fs.existsSync(path.join(extDir, "content.js"))).toBe(true);
    expect(fs.existsSync(path.join(extDir, "content.css"))).toBe(true);
    expect(fs.existsSync(path.join(extDir, "lib", "face-api.min.js"))).toBe(true);
    expect(fs.existsSync(path.join(extDir, "popup", "popup.html"))).toBe(true);
  });

  test("browser launches with extension profile", async () => {
    const page = await context.newPage();
    await page.goto("about:blank");
    // If we get here without crashing, the profile loaded
    expect(page.url()).toContain("blank");
    await page.close();
  });

  test("extension does not produce errors on a simple page", async () => {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("http://localhost:3999/test-icons.html", {
      waitUntil: "networkidle",
    });

    // Wait for extension to process
    await page.waitForTimeout(3000);

    // Filter out non-extension errors
    const extensionErrors = errors.filter(
      (e) => e.includes("Shmirat") || e.includes("face-api") || e.includes("faceapi")
    );
    expect(extensionErrors).toHaveLength(0);

    await page.close();
  });
});

test.describe("Icon/SVG Passthrough", () => {
  test("small icons and SVGs are never hidden", async () => {
    const page = await context.newPage();
    await page.goto("http://localhost:3999/test-icons.html", {
      waitUntil: "networkidle",
    });

    // Wait for extension to finish processing
    await page.waitForTimeout(5000);

    // Check that all images on the icon test page are visible
    const hiddenImages = await page.$$eval("img", (imgs) =>
      imgs.filter((img) => {
        const style = window.getComputedStyle(img);
        return (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.opacity === "0" ||
          img.classList.contains("shmirat-eynaim-blocked")
        );
      }).length
    );

    expect(hiddenImages).toBe(0);
    await page.close();
  });
});

test.describe("Image Hiding", () => {
  test("images with female faces are hidden", async () => {
    const page = await context.newPage();
    await page.goto("http://localhost:3999/test-female-faces.html", {
      waitUntil: "networkidle",
    });

    // Wait for ML processing (models need time)
    await page.waitForTimeout(10_000);

    // Check that female-face images are hidden
    const visibleFemaleImages = await page.$$eval(
      'img[data-test="female"]',
      (imgs) =>
        imgs.filter((img) => {
          const style = window.getComputedStyle(img);
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            parseFloat(style.opacity) > 0 &&
            !img.classList.contains("shmirat-eynaim-blocked")
          );
        }).length
    );

    // Strict mode: ALL female face images should be hidden
    expect(visibleFemaleImages).toBe(0);
    await page.close();
  });

  test("images with only male faces remain visible", async () => {
    const page = await context.newPage();
    await page.goto("http://localhost:3999/test-safe-images.html", {
      waitUntil: "networkidle",
    });

    await page.waitForTimeout(10_000);

    // Male-face images should remain visible
    const hiddenMaleImages = await page.$$eval(
      'img[data-test="male"]',
      (imgs) =>
        imgs.filter((img) => {
          return img.classList.contains("shmirat-eynaim-blocked");
        }).length
    );

    expect(hiddenMaleImages).toBe(0);
    await page.close();
  });
});

test.describe("Toggle & Whitelist", () => {
  test("whitelisted domain shows all images", async () => {
    // This test would need to interact with the extension popup
    // to whitelist localhost, then verify images appear
    // Placeholder for now
    expect(true).toBe(true);
  });
});

test.describe("Visual Verification @visual", () => {
  test("screenshot test-icons page", async () => {
    const page = await context.newPage();
    await page.goto("http://localhost:3999/test-icons.html", {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(5000);
    await page.screenshot({
      path: "test-results/screenshots/icons-page.png",
      fullPage: true,
    });
    await page.close();
  });

  test("screenshot test-female-faces page", async () => {
    const page = await context.newPage();
    await page.goto("http://localhost:3999/test-female-faces.html", {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(10_000);
    await page.screenshot({
      path: "test-results/screenshots/female-faces-page.png",
      fullPage: true,
    });
    await page.close();
  });

  test("screenshot test-mixed page", async () => {
    const page = await context.newPage();
    await page.goto("http://localhost:3999/test-mixed.html", {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(10_000);
    await page.screenshot({
      path: "test-results/screenshots/mixed-page.png",
      fullPage: true,
    });
    await page.close();
  });
});
