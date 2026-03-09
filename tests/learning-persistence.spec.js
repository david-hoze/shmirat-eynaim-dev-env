// tests/learning-persistence.spec.js — Unit tests for learning data persistence
// Tests export, import, reset, learnBlock, learnSafe message handlers in background.js
const { test, expect } = require("@playwright/test");
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const BG_SCRIPT_PATH = path.resolve(__dirname, "../shmirat-eynaim/background.js");

/**
 * Create a mock browser environment and load background.js in a VM sandbox.
 * Returns { sendMessage, storage } to interact with the loaded script.
 */
function loadBackground() {
  const storageData = {};
  let messageListener = null;

  const browserMock = {
    storage: {
      local: {
        get: async (keys) => {
          const result = {};
          for (const key of keys) {
            if (key in storageData) result[key] = storageData[key];
          }
          return result;
        },
        set: async (obj) => {
          Object.assign(storageData, obj);
        },
      },
    },
    runtime: {
      onMessage: {
        addListener: (fn) => { messageListener = fn; },
      },
      getURL: (p) => `moz-extension://fake-uuid/${p}`,
    },
    browserAction: {
      setBadgeText: () => {},
      setBadgeBackgroundColor: () => {},
    },
    tabs: {
      query: async () => [],
      sendMessage: async () => ({}),
      reload: async () => {},
    },
    menus: null,
    contextMenus: null,
  };

  const sandbox = {
    browser: browserMock,
    console,
    setTimeout,
    clearTimeout,
    Date,
    URL,
    Math,
    Promise,
    Array,
    Object,
    JSON,
    FileReader: class { readAsDataURL() {} },
    fetch: async () => ({ ok: false }),
  };

  const code = fs.readFileSync(BG_SCRIPT_PATH, "utf-8");
  vm.runInNewContext(`(function() { ${code} })()`, sandbox);

  /**
   * Send a message to background.js message handler and return the response.
   * Drains the microtask queue first to ensure init has completed.
   */
  async function sendMessage(msg, sender = {}) {
    if (!messageListener) throw new Error("No message listener registered");
    // Drain microtasks to ensure the async init IIFE (loadState + loadLearningData)
    // has fully completed before we send messages. Without this, loadLearningData
    // can overwrite in-memory state set by earlier message handlers.
    await new Promise(r => setTimeout(r, 0));
    return messageListener(msg, sender);
  }

  return { sendMessage, storageData };
}

/** Generate a fake 128-dim face descriptor */
function fakeDescriptor(seed = 0) {
  return Array.from({ length: 128 }, (_, i) => Math.sin(seed * 100 + i) * 0.5);
}

test.describe("Learning Data Persistence", () => {
  test("exportLearning returns empty data initially", async () => {
    const { sendMessage } = loadBackground();
    const data = await sendMessage({ type: "exportLearning" });

    expect(data.knownFaces).toEqual([]);
    expect(data.knownSafeFaces).toEqual([]);
    expect(data.manualBlocklist).toEqual([]);
    expect(data.manualSafelist).toEqual([]);
    expect(data.trainingData).toEqual([]);
    expect(data.classifierWeights).toBeNull();
  });

  test("getLearningStats returns zero counts initially", async () => {
    const { sendMessage } = loadBackground();
    const stats = await sendMessage({ type: "getLearningStats" });

    expect(stats.knownFacesCount).toBe(0);
    expect(stats.knownSafeFacesCount).toBe(0);
    expect(stats.trainingDataCount).toBe(0);
    expect(stats.classifierTrained).toBe(false);
  });

  test("learnBlock stores face descriptors and updates blocklist", async () => {
    const { sendMessage } = loadBackground();
    const desc1 = fakeDescriptor(1);
    const desc2 = fakeDescriptor(2);
    const url = "https://example.com/face1.jpg";

    const result = await sendMessage({
      type: "learnBlock",
      url,
      descriptors: [desc1, desc2],
    });
    expect(result.success).toBe(true);

    const stats = await sendMessage({ type: "getLearningStats" });
    expect(stats.knownFacesCount).toBe(2);
    expect(stats.trainingDataCount).toBe(2);

    const exported = await sendMessage({ type: "exportLearning" });
    expect(exported.manualBlocklist).toContain(url);
    expect(exported.knownFaces).toHaveLength(2);
    expect(exported.knownFaces[0].descriptor).toEqual(desc1);
    expect(exported.knownFaces[0].url).toBe(url);
    expect(exported.knownFaces[1].descriptor).toEqual(desc2);
    // Training data should have label=1 (block)
    expect(exported.trainingData[0].label).toBe(1);
    expect(exported.trainingData[1].label).toBe(1);
  });

  test("learnSafe stores safe face descriptors and updates safelist", async () => {
    const { sendMessage } = loadBackground();
    const desc = fakeDescriptor(3);
    const url = "https://example.com/safe1.jpg";

    const result = await sendMessage({
      type: "learnSafe",
      url,
      descriptors: [desc],
    });
    expect(result.success).toBe(true);

    const stats = await sendMessage({ type: "getLearningStats" });
    expect(stats.knownSafeFacesCount).toBe(1);
    expect(stats.trainingDataCount).toBe(1);

    const exported = await sendMessage({ type: "exportLearning" });
    expect(exported.manualSafelist).toContain(url);
    expect(exported.knownSafeFaces[0].descriptor).toEqual(desc);
    // Training data should have label=0 (safe)
    expect(exported.trainingData[0].label).toBe(0);
  });

  test("learnBlock removes URL from safelist if present", async () => {
    const { sendMessage } = loadBackground();
    const url = "https://example.com/reclassified.jpg";

    // First mark as safe
    await sendMessage({ type: "learnSafe", url, descriptors: [fakeDescriptor(4)] });
    let exported = await sendMessage({ type: "exportLearning" });
    expect(exported.manualSafelist).toContain(url);

    // Then block — should remove from safelist
    await sendMessage({ type: "learnBlock", url, descriptors: [fakeDescriptor(5)] });
    exported = await sendMessage({ type: "exportLearning" });
    expect(exported.manualBlocklist).toContain(url);
    expect(exported.manualSafelist).not.toContain(url);
  });

  test("learnSafe removes URL from blocklist if present", async () => {
    const { sendMessage } = loadBackground();
    const url = "https://example.com/reclassified2.jpg";

    // First block
    await sendMessage({ type: "learnBlock", url, descriptors: [fakeDescriptor(6)] });
    let exported = await sendMessage({ type: "exportLearning" });
    expect(exported.manualBlocklist).toContain(url);

    // Then mark safe — should remove from blocklist
    await sendMessage({ type: "learnSafe", url, descriptors: [fakeDescriptor(7)] });
    exported = await sendMessage({ type: "exportLearning" });
    expect(exported.manualSafelist).toContain(url);
    expect(exported.manualBlocklist).not.toContain(url);
  });

  test("resetLearning clears all learning data", async () => {
    const { sendMessage } = loadBackground();

    // Add some data
    await sendMessage({ type: "learnBlock", url: "https://a.com/1.jpg", descriptors: [fakeDescriptor(10)] });
    await sendMessage({ type: "learnSafe", url: "https://b.com/2.jpg", descriptors: [fakeDescriptor(11)] });

    let stats = await sendMessage({ type: "getLearningStats" });
    expect(stats.knownFacesCount).toBe(1);
    expect(stats.knownSafeFacesCount).toBe(1);

    // Reset
    const result = await sendMessage({ type: "resetLearning" });
    expect(result.success).toBe(true);

    // Verify everything is cleared
    stats = await sendMessage({ type: "getLearningStats" });
    expect(stats.knownFacesCount).toBe(0);
    expect(stats.knownSafeFacesCount).toBe(0);
    expect(stats.trainingDataCount).toBe(0);
    expect(stats.classifierTrained).toBe(false);

    const exported = await sendMessage({ type: "exportLearning" });
    expect(exported.knownFaces).toEqual([]);
    expect(exported.knownSafeFaces).toEqual([]);
    expect(exported.manualBlocklist).toEqual([]);
    expect(exported.manualSafelist).toEqual([]);
    expect(exported.trainingData).toEqual([]);
    expect(exported.classifierWeights).toBeNull();
  });

  test("importLearning merges data into existing state", async () => {
    const { sendMessage } = loadBackground();

    // Add initial data
    await sendMessage({ type: "learnBlock", url: "https://a.com/1.jpg", descriptors: [fakeDescriptor(20)] });

    // Import additional data
    const importData = {
      knownFaces: [{ descriptor: fakeDescriptor(21), url: "https://c.com/3.jpg", timestamp: Date.now() }],
      knownSafeFaces: [{ descriptor: fakeDescriptor(22), url: "https://d.com/4.jpg", timestamp: Date.now() }],
      manualBlocklist: ["https://e.com/5.jpg"],
      manualSafelist: ["https://f.com/6.jpg"],
      trainingData: [{ descriptor: fakeDescriptor(23), label: 1 }],
    };

    const result = await sendMessage({ type: "importLearning", data: importData });
    expect(result.success).toBe(true);

    const exported = await sendMessage({ type: "exportLearning" });

    // Original + imported knownFaces
    expect(exported.knownFaces).toHaveLength(2);
    // Imported knownSafeFaces
    expect(exported.knownSafeFaces).toHaveLength(1);
    // Original blocklist URL + imported
    expect(exported.manualBlocklist).toContain("https://a.com/1.jpg");
    expect(exported.manualBlocklist).toContain("https://e.com/5.jpg");
    // Imported safelist
    expect(exported.manualSafelist).toContain("https://f.com/6.jpg");
    // Original training data (1) + imported (1)
    expect(exported.trainingData).toHaveLength(2);
  });

  test("importLearning deduplicates manual blocklist/safelist URLs", async () => {
    const { sendMessage } = loadBackground();
    const url = "https://dupe.com/face.jpg";

    await sendMessage({ type: "learnBlock", url, descriptors: [fakeDescriptor(30)] });

    // Import the same URL again
    const result = await sendMessage({
      type: "importLearning",
      data: { manualBlocklist: [url] },
    });
    expect(result.success).toBe(true);

    const exported = await sendMessage({ type: "exportLearning" });
    const dupeCount = exported.manualBlocklist.filter(u => u === url).length;
    expect(dupeCount).toBe(1);
  });

  test("importLearning respects MAX_KNOWN_FACES cap", async () => {
    const { sendMessage } = loadBackground();

    // Import more than MAX_KNOWN_FACES (1000) entries
    const bigImport = {
      knownFaces: Array.from({ length: 1100 }, (_, i) => ({
        descriptor: fakeDescriptor(i),
        url: `https://example.com/${i}.jpg`,
        timestamp: Date.now(),
      })),
    };

    await sendMessage({ type: "importLearning", data: bigImport });

    const stats = await sendMessage({ type: "getLearningStats" });
    expect(stats.knownFacesCount).toBeLessThanOrEqual(1000);

    // Should keep the LAST 1000 (most recent imports)
    const exported = await sendMessage({ type: "exportLearning" });
    expect(exported.knownFaces).toHaveLength(1000);
    expect(exported.knownFaces[0].url).toBe("https://example.com/100.jpg");
  });

  test("importLearning respects MAX_TRAINING_DATA cap", async () => {
    const { sendMessage } = loadBackground();

    const bigImport = {
      trainingData: Array.from({ length: 600 }, (_, i) => ({
        descriptor: fakeDescriptor(i),
        label: i % 2,
      })),
    };

    await sendMessage({ type: "importLearning", data: bigImport });

    const stats = await sendMessage({ type: "getLearningStats" });
    expect(stats.trainingDataCount).toBeLessThanOrEqual(500);
  });

  test("importLearning with classifierWeights overwrites existing", async () => {
    const { sendMessage } = loadBackground();

    const weights = { weights: new Array(128).fill(0.1), bias: 0.5 };
    await sendMessage({
      type: "importLearning",
      data: { classifierWeights: weights },
    });

    const exported = await sendMessage({ type: "exportLearning" });
    expect(exported.classifierWeights).toEqual(weights);

    const stats = await sendMessage({ type: "getLearningStats" });
    expect(stats.classifierTrained).toBe(true);
  });

  test("data persists to storage after learnBlock", async () => {
    const { sendMessage, storageData } = loadBackground();

    await sendMessage({
      type: "learnBlock",
      url: "https://example.com/persist.jpg",
      descriptors: [fakeDescriptor(40)],
    });

    // Verify data was written to mock storage
    expect(storageData.knownFaces).toHaveLength(1);
    expect(storageData.manualBlocklist).toContain("https://example.com/persist.jpg");
    expect(storageData.trainingData).toHaveLength(1);
  });

  test("data persists to storage after resetLearning", async () => {
    const { sendMessage, storageData } = loadBackground();

    await sendMessage({
      type: "learnBlock",
      url: "https://example.com/x.jpg",
      descriptors: [fakeDescriptor(50)],
    });
    expect(storageData.knownFaces).toHaveLength(1);

    await sendMessage({ type: "resetLearning" });

    expect(storageData.knownFaces).toEqual([]);
    expect(storageData.knownSafeFaces).toEqual([]);
    expect(storageData.manualBlocklist).toEqual([]);
    expect(storageData.manualSafelist).toEqual([]);
    expect(storageData.trainingData).toEqual([]);
    expect(storageData.classifierWeights).toBeNull();
  });

  test("data persists to storage after importLearning", async () => {
    const { sendMessage, storageData } = loadBackground();

    await sendMessage({
      type: "importLearning",
      data: {
        manualBlocklist: ["https://imported.com/1.jpg"],
        manualSafelist: ["https://imported.com/2.jpg"],
      },
    });

    expect(storageData.manualBlocklist).toContain("https://imported.com/1.jpg");
    expect(storageData.manualSafelist).toContain("https://imported.com/2.jpg");
  });

  test("classifier trains automatically after 10+ training examples", async () => {
    const { sendMessage } = loadBackground();

    // Add 10 block examples (each with 1 descriptor)
    for (let i = 0; i < 10; i++) {
      await sendMessage({
        type: "learnBlock",
        url: `https://example.com/block-${i}.jpg`,
        descriptors: [fakeDescriptor(100 + i)],
      });
    }

    const stats = await sendMessage({ type: "getLearningStats" });
    expect(stats.trainingDataCount).toBe(10);
    expect(stats.classifierTrained).toBe(true);

    const exported = await sendMessage({ type: "exportLearning" });
    expect(exported.classifierWeights).not.toBeNull();
    expect(exported.classifierWeights.weights).toHaveLength(128);
    expect(typeof exported.classifierWeights.bias).toBe("number");
  });

  test("classifier does NOT train with fewer than 10 examples", async () => {
    const { sendMessage } = loadBackground();

    for (let i = 0; i < 9; i++) {
      await sendMessage({
        type: "learnBlock",
        url: `https://example.com/few-${i}.jpg`,
        descriptors: [fakeDescriptor(200 + i)],
      });
    }

    const stats = await sendMessage({ type: "getLearningStats" });
    expect(stats.trainingDataCount).toBe(9);
    expect(stats.classifierTrained).toBe(false);
  });

  test("full round-trip: learn → export → reset → import → verify", async () => {
    const { sendMessage } = loadBackground();
    const blockUrl = "https://example.com/blocked.jpg";
    const safeUrl = "https://example.com/safe.jpg";

    // 1. Learn some data
    await sendMessage({
      type: "learnBlock",
      url: blockUrl,
      descriptors: [fakeDescriptor(300), fakeDescriptor(301)],
    });
    await sendMessage({
      type: "learnSafe",
      url: safeUrl,
      descriptors: [fakeDescriptor(302)],
    });

    // 2. Export
    const exported = await sendMessage({ type: "exportLearning" });
    expect(exported.knownFaces).toHaveLength(2);
    expect(exported.knownSafeFaces).toHaveLength(1);
    expect(exported.manualBlocklist).toEqual([blockUrl]);
    expect(exported.manualSafelist).toEqual([safeUrl]);
    expect(exported.trainingData).toHaveLength(3);

    // 3. Reset
    await sendMessage({ type: "resetLearning" });
    const afterReset = await sendMessage({ type: "exportLearning" });
    expect(afterReset.knownFaces).toEqual([]);
    expect(afterReset.manualBlocklist).toEqual([]);

    // 4. Re-import the exported data
    await sendMessage({ type: "importLearning", data: exported });

    // 5. Verify data is restored
    const restored = await sendMessage({ type: "exportLearning" });
    expect(restored.knownFaces).toHaveLength(2);
    expect(restored.knownSafeFaces).toHaveLength(1);
    expect(restored.manualBlocklist).toContain(blockUrl);
    expect(restored.manualSafelist).toContain(safeUrl);
    expect(restored.trainingData).toHaveLength(3);
    // Descriptors should match
    expect(restored.knownFaces[0].descriptor).toEqual(fakeDescriptor(300));
    expect(restored.knownFaces[1].descriptor).toEqual(fakeDescriptor(301));
    expect(restored.knownSafeFaces[0].descriptor).toEqual(fakeDescriptor(302));
  });
});
