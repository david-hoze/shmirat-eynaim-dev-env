// tests/cloud-api.spec.js — Unit tests for Cloud API (Claude Haiku) integration
// Tests classifyCloud, setApiKey, setCloudMode, getCloudStats, deduplication, learning feeding
const { test, expect } = require("@playwright/test");
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const BG_SCRIPT_PATH = path.resolve(__dirname, "../shmirat-eynaim/background-idris.js");

/**
 * Create a mock browser environment and load background.js in a VM sandbox.
 * Options:
 *   - haikuResponse: the response the mock Haiku API should return (default: YES)
 *   - apiError: if true, the mock API returns an error
 *   - networkError: if true, the mock fetch throws a network error
 */
function loadBackground(opts = {}) {
  const storageData = {};
  let messageListener = null;
  let fetchCallCount = 0;
  let fetchCalledUrls = [];

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
    menus: {
      create: () => {},
      onClicked: { addListener: () => {} },
      update: () => {},
      remove: () => {},
    },
    contextMenus: {
      create: () => {},
      onClicked: { addListener: () => {} },
    },
  };

  // Mock fetch: intercepts Anthropic API calls
  const mockFetch = async (url, options) => {
    fetchCalledUrls.push(url);

    // resizeImageDataUrl calls fetch(dataUrl) — return a mock blob
    if (typeof url === "string" && url.startsWith("data:")) {
      return {
        ok: true,
        blob: async () => ({
          // Minimal mock blob for createImageBitmap
          type: "image/jpeg",
          size: 100,
        }),
      };
    }

    // Anthropic API call
    if (typeof url === "string" && url.includes("api.anthropic.com")) {
      fetchCallCount++;

      if (opts.networkError) {
        throw new Error("Network error");
      }

      if (opts.apiError) {
        return { ok: false, status: 500 };
      }

      const answer = opts.haikuResponse !== undefined ? opts.haikuResponse : "YES";
      return {
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: answer }],
        }),
      };
    }

    return { ok: false, status: 404 };
  };

  // Mock createImageBitmap and OffscreenCanvas for resizeImageDataUrl
  const mockCreateImageBitmap = async () => ({
    width: 100,
    height: 100,
    close: () => {},
  });

  const MockOffscreenCanvas = function(w, h) {
    this.width = w;
    this.height = h;
    this.getContext = () => ({
      drawImage: () => {},
    });
    this.convertToBlob = async () => ({
      type: "image/jpeg",
      size: 50,
    });
  };

  // Mock FileReader for resizeImageDataUrl
  const MockFileReader = function() {
    this.readAsDataURL = function(blob) {
      this.result = "data:image/jpeg;base64,/9j/fakebase64data";
      if (this.onload) setTimeout(() => this.onload(), 0);
    };
  };

  const sandbox = {
    browser: browserMock,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    URL,
    Math,
    Promise,
    Array,
    Object,
    JSON,
    Map,
    Set,
    Number,
    String,
    Boolean,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    RegExp,
    Error,
    TypeError,
    RangeError,
    Symbol,
    BigInt,
    Uint8Array,
    Float32Array,
    ArrayBuffer,
    FileReader: MockFileReader,
    fetch: mockFetch,
    createImageBitmap: mockCreateImageBitmap,
    OffscreenCanvas: MockOffscreenCanvas,
    performance: { now: () => Date.now() },
    crypto: { subtle: { digest: async () => new ArrayBuffer(32) }, getRandomValues: (a) => a },
    Image: function() { this.onload = null; this.onerror = null; this.src = ''; },
    Blob: function(parts, opts) { this.type = opts?.type || ''; this.size = 0; },
    HTMLCanvasElement: function() {},
    document: { createElement: () => ({ getContext: () => ({ drawImage: () => {}, getImageData: () => ({data:[]}) }), toDataURL: () => 'data:image/jpeg;base64,', width: 0, height: 0 }) },
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    encodeURIComponent,
    decodeURIComponent,
    unescape,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const code = fs.readFileSync(BG_SCRIPT_PATH, "utf-8");
  vm.runInNewContext(`(function() { ${code} })()`, sandbox);

  async function sendMessage(msg, sender = {}) {
    if (!messageListener) throw new Error("No message listener registered");
    await new Promise(r => setTimeout(r, 0));
    return messageListener(msg, sender);
  }

  return {
    sendMessage,
    storageData,
    getApiFetchCount: () => fetchCallCount,
    getFetchCalledUrls: () => fetchCalledUrls,
    resetFetchCount: () => { fetchCallCount = 0; },
  };
}

function fakeDescriptor(seed = 0) {
  return Array.from({ length: 128 }, (_, i) => Math.sin(seed * 100 + i) * 0.5);
}

test.describe("Cloud API Integration", () => {

  test("getCloudStats returns defaults when no API key set", async () => {
    const { sendMessage } = loadBackground();
    const stats = await sendMessage({ type: "getCloudStats" });

    expect(stats.hasApiKey).toBe(false);
    expect(stats.cloudMode).toBe("all");
    expect(stats.cloudCallsToday).toBe(0);
    expect(stats.cloudSavedCount).toBe(0);
    expect(stats.cloudCacheSize).toBe(0);
  });

  test("setApiKey stores the key and getCloudStats reflects it", async () => {
    const { sendMessage } = loadBackground();

    await sendMessage({ type: "setApiKey", key: "sk-ant-test123" });
    const stats = await sendMessage({ type: "getCloudStats" });

    expect(stats.hasApiKey).toBe(true);
  });

  test("setCloudMode changes the mode", async () => {
    const { sendMessage } = loadBackground();

    await sendMessage({ type: "setCloudMode", mode: "uncertain" });
    let stats = await sendMessage({ type: "getCloudStats" });
    expect(stats.cloudMode).toBe("uncertain");

    await sendMessage({ type: "setCloudMode", mode: "never" });
    stats = await sendMessage({ type: "getCloudStats" });
    expect(stats.cloudMode).toBe("never");
  });

  test("classifyCloud returns null when no API key is set", async () => {
    const { sendMessage, getApiFetchCount } = loadBackground();

    const result = await sendMessage({
      type: "classifyCloud",
      imageUrl: "https://example.com/img.jpg",
      imageDataUrl: "data:image/jpeg;base64,fakedata",
      localResult: null,
      descriptors: [],
    });

    expect(result).toBeNull();
    expect(getApiFetchCount()).toBe(0);
  });

  test("classifyCloud returns null when cloudMode is 'never'", async () => {
    const { sendMessage, getApiFetchCount } = loadBackground();

    await sendMessage({ type: "setApiKey", key: "sk-ant-test123" });
    await sendMessage({ type: "setCloudMode", mode: "never" });

    const result = await sendMessage({
      type: "classifyCloud",
      imageUrl: "https://example.com/img.jpg",
      imageDataUrl: "data:image/jpeg;base64,fakedata",
      localResult: null,
      descriptors: [],
    });

    expect(result).toBeNull();
    expect(getApiFetchCount()).toBe(0);
  });

  test("classifyCloud calls Haiku API and returns result (YES)", async () => {
    const { sendMessage, getApiFetchCount } = loadBackground({ haikuResponse: "YES" });

    await sendMessage({ type: "setApiKey", key: "sk-ant-test123" });

    const result = await sendMessage({
      type: "classifyCloud",
      imageUrl: "https://example.com/woman.jpg",
      imageDataUrl: "data:image/jpeg;base64,fakedata",
      localResult: null,
      descriptors: [],
    });

    expect(result).not.toBeNull();
    expect(result.containsWomen).toBe(true);
    expect(result.source).toBe("haiku");
    expect(getApiFetchCount()).toBe(1);
  });

  test("classifyCloud calls Haiku API and returns result (NO)", async () => {
    const { sendMessage, getApiFetchCount } = loadBackground({ haikuResponse: "NO" });

    await sendMessage({ type: "setApiKey", key: "sk-ant-test123" });

    const result = await sendMessage({
      type: "classifyCloud",
      imageUrl: "https://example.com/landscape.jpg",
      imageDataUrl: "data:image/jpeg;base64,fakedata",
      localResult: null,
      descriptors: [],
    });

    expect(result).not.toBeNull();
    expect(result.containsWomen).toBe(false);
    expect(result.source).toBe("haiku");
    expect(getApiFetchCount()).toBe(1);
  });

  test("classifyCloud caches result and returns from cache on second call (no duplicate API call)", async () => {
    const { sendMessage, getApiFetchCount } = loadBackground({ haikuResponse: "YES" });

    await sendMessage({ type: "setApiKey", key: "sk-ant-test123" });

    // First call — hits API
    const result1 = await sendMessage({
      type: "classifyCloud",
      imageUrl: "https://example.com/img.jpg",
      imageDataUrl: "data:image/jpeg;base64,fakedata",
      localResult: null,
      descriptors: [],
    });
    expect(result1.containsWomen).toBe(true);
    expect(result1.source).toBe("haiku");
    expect(getApiFetchCount()).toBe(1);

    // Second call — same URL, should hit cache, NOT the API
    const result2 = await sendMessage({
      type: "classifyCloud",
      imageUrl: "https://example.com/img.jpg",
      imageDataUrl: "data:image/jpeg;base64,fakedata",
      localResult: null,
      descriptors: [],
    });
    expect(result2.containsWomen).toBe(true);
    expect(result2.source).toBe("cloud-cache");
    expect(getApiFetchCount()).toBe(1); // Still 1 — no second API call
  });

  test("cloud cache is persisted to storage", async () => {
    const { sendMessage, storageData } = loadBackground({ haikuResponse: "NO" });

    await sendMessage({ type: "setApiKey", key: "sk-ant-test123" });

    await sendMessage({
      type: "classifyCloud",
      imageUrl: "https://example.com/safe.jpg",
      imageDataUrl: "data:image/jpeg;base64,fakedata",
      localResult: null,
      descriptors: [],
    });

    expect(storageData.cloudCache).toBeDefined();
    expect(storageData.cloudCache["https://example.com/safe.jpg"]).toBeDefined();
    expect(storageData.cloudCache["https://example.com/safe.jpg"].containsWomen).toBe(false);
  });

  test("cloudCallsToday is incremented after API call", async () => {
    const { sendMessage } = loadBackground({ haikuResponse: "YES" });

    await sendMessage({ type: "setApiKey", key: "sk-ant-test123" });

    await sendMessage({
      type: "classifyCloud",
      imageUrl: "https://example.com/img1.jpg",
      imageDataUrl: "data:image/jpeg;base64,fakedata",
      localResult: null,
      descriptors: [],
    });

    const stats = await sendMessage({ type: "getCloudStats" });
    expect(stats.cloudCallsToday).toBe(1);
  });

  test("cloudSavedCount increments when cache is hit", async () => {
    const { sendMessage } = loadBackground({ haikuResponse: "YES" });

    await sendMessage({ type: "setApiKey", key: "sk-ant-test123" });

    // First call — API
    await sendMessage({
      type: "classifyCloud",
      imageUrl: "https://example.com/img.jpg",
      imageDataUrl: "data:image/jpeg;base64,fakedata",
      localResult: null,
      descriptors: [],
    });

    // Second call — cache hit
    await sendMessage({
      type: "classifyCloud",
      imageUrl: "https://example.com/img.jpg",
      imageDataUrl: "data:image/jpeg;base64,fakedata",
      localResult: null,
      descriptors: [],
    });

    const stats = await sendMessage({ type: "getCloudStats" });
    expect(stats.cloudCallsToday).toBe(1);
    expect(stats.cloudSavedCount).toBe(1);
  });

  test("classifyCloud feeds descriptors into learning system (block)", async () => {
    const { sendMessage } = loadBackground({ haikuResponse: "YES" });

    await sendMessage({ type: "setApiKey", key: "sk-ant-test123" });

    const descriptors = [fakeDescriptor(1), fakeDescriptor(2)];

    await sendMessage({
      type: "classifyCloud",
      imageUrl: "https://example.com/woman.jpg",
      imageDataUrl: "data:image/jpeg;base64,fakedata",
      localResult: null,
      descriptors,
    });

    const learningStats = await sendMessage({ type: "getLearningStats" });
    expect(learningStats.knownFacesCount).toBe(2);
    expect(learningStats.trainingDataCount).toBe(2);
  });

  test("classifyCloud feeds descriptors into learning system (safe)", async () => {
    const { sendMessage } = loadBackground({ haikuResponse: "NO" });

    await sendMessage({ type: "setApiKey", key: "sk-ant-test123" });

    const descriptors = [fakeDescriptor(3)];

    await sendMessage({
      type: "classifyCloud",
      imageUrl: "https://example.com/man.jpg",
      imageDataUrl: "data:image/jpeg;base64,fakedata",
      localResult: null,
      descriptors,
    });

    const learningStats = await sendMessage({ type: "getLearningStats" });
    expect(learningStats.knownSafeFacesCount).toBe(1);
    expect(learningStats.trainingDataCount).toBe(1);
  });

  test("classifyCloud with empty descriptors does not add to learning", async () => {
    const { sendMessage } = loadBackground({ haikuResponse: "YES" });

    await sendMessage({ type: "setApiKey", key: "sk-ant-test123" });

    await sendMessage({
      type: "classifyCloud",
      imageUrl: "https://example.com/img.jpg",
      imageDataUrl: "data:image/jpeg;base64,fakedata",
      localResult: null,
      descriptors: [],
    });

    const learningStats = await sendMessage({ type: "getLearningStats" });
    expect(learningStats.knownFacesCount).toBe(0);
    expect(learningStats.trainingDataCount).toBe(0);
  });

  test("classifyCloud returns null on API error (graceful fallback)", async () => {
    const { sendMessage, getApiFetchCount } = loadBackground({ apiError: true });

    await sendMessage({ type: "setApiKey", key: "sk-ant-test123" });

    const result = await sendMessage({
      type: "classifyCloud",
      imageUrl: "https://example.com/img.jpg",
      imageDataUrl: "data:image/jpeg;base64,fakedata",
      localResult: null,
      descriptors: [],
    });

    expect(result).toBeNull();
    expect(getApiFetchCount()).toBe(1); // API was called but returned error
  });

  test("classifyCloud returns null on network error (graceful fallback)", async () => {
    const { sendMessage } = loadBackground({ networkError: true });

    await sendMessage({ type: "setApiKey", key: "sk-ant-test123" });

    const result = await sendMessage({
      type: "classifyCloud",
      imageUrl: "https://example.com/img.jpg",
      imageDataUrl: "data:image/jpeg;base64,fakedata",
      localResult: null,
      descriptors: [],
    });

    expect(result).toBeNull();
  });

  test("uncertain mode skips API when local KNN is confident", async () => {
    const { sendMessage, getApiFetchCount } = loadBackground({ haikuResponse: "YES" });

    await sendMessage({ type: "setApiKey", key: "sk-ant-test123" });
    await sendMessage({ type: "setCloudMode", mode: "uncertain" });

    const result = await sendMessage({
      type: "classifyCloud",
      imageUrl: "https://example.com/img.jpg",
      imageDataUrl: "data:image/jpeg;base64,fakedata",
      localResult: { source: "local", knnDistance: 0.2 }, // very confident
      descriptors: [],
    });

    expect(result).toBeNull();
    expect(getApiFetchCount()).toBe(0);
  });

  test("uncertain mode skips API when classifier is confident", async () => {
    const { sendMessage, getApiFetchCount } = loadBackground({ haikuResponse: "YES" });

    await sendMessage({ type: "setApiKey", key: "sk-ant-test123" });
    await sendMessage({ type: "setCloudMode", mode: "uncertain" });

    const result = await sendMessage({
      type: "classifyCloud",
      imageUrl: "https://example.com/img.jpg",
      imageDataUrl: "data:image/jpeg;base64,fakedata",
      localResult: { source: "local", classifierConfidence: 0.95 },
      descriptors: [],
    });

    expect(result).toBeNull();
    expect(getApiFetchCount()).toBe(0);
  });

  test("uncertain mode calls API when local is NOT confident", async () => {
    const { sendMessage, getApiFetchCount } = loadBackground({ haikuResponse: "NO" });

    await sendMessage({ type: "setApiKey", key: "sk-ant-test123" });
    await sendMessage({ type: "setCloudMode", mode: "uncertain" });

    const result = await sendMessage({
      type: "classifyCloud",
      imageUrl: "https://example.com/img.jpg",
      imageDataUrl: "data:image/jpeg;base64,fakedata",
      localResult: { source: "local", knnDistance: 0.6, classifierConfidence: 0.55 },
      descriptors: [],
    });

    expect(result).not.toBeNull();
    expect(result.source).toBe("haiku");
    expect(getApiFetchCount()).toBe(1);
  });

  test("uncertain mode skips API for user-flagged images", async () => {
    const { sendMessage, getApiFetchCount } = loadBackground({ haikuResponse: "YES" });

    await sendMessage({ type: "setApiKey", key: "sk-ant-test123" });
    await sendMessage({ type: "setCloudMode", mode: "uncertain" });

    const result = await sendMessage({
      type: "classifyCloud",
      imageUrl: "https://example.com/img.jpg",
      imageDataUrl: "data:image/jpeg;base64,fakedata",
      localResult: { source: "user" },
      descriptors: [],
    });

    expect(result).toBeNull();
    expect(getApiFetchCount()).toBe(0);
  });

  test("getBlockingState includes cloud data", async () => {
    const { sendMessage } = loadBackground({ haikuResponse: "YES" });

    await sendMessage({ type: "setApiKey", key: "sk-ant-test123" });
    await sendMessage({ type: "setCloudMode", mode: "uncertain" });

    // Classify one image to populate the cache
    await sendMessage({
      type: "classifyCloud",
      imageUrl: "https://example.com/img.jpg",
      imageDataUrl: "data:image/jpeg;base64,fakedata",
      localResult: null,
      descriptors: [],
    });

    const state = await sendMessage({ type: "getBlockingState" }, { tab: { url: "https://example.com" } });

    expect(state.cloudMode).toBe("uncertain");
    expect(state.hasApiKey).toBe(true);
    expect(state.cloudCache).toBeDefined();
    expect(state.cloudCache["https://example.com/img.jpg"]).toBeDefined();
    expect(state.cloudCache["https://example.com/img.jpg"].containsWomen).toBe(true);
  });

  test("API key is persisted to storage", async () => {
    const { sendMessage, storageData } = loadBackground();

    await sendMessage({ type: "setApiKey", key: "sk-ant-secret" });

    expect(storageData.anthropicApiKey).toBe("sk-ant-secret");
  });

  test("cloud mode is persisted to storage", async () => {
    const { sendMessage, storageData } = loadBackground();

    await sendMessage({ type: "setCloudMode", mode: "never" });

    expect(storageData.cloudMode).toBe("never");
  });

  test("different URLs each trigger their own API call", async () => {
    const { sendMessage, getApiFetchCount } = loadBackground({ haikuResponse: "YES" });

    await sendMessage({ type: "setApiKey", key: "sk-ant-test123" });

    await sendMessage({
      type: "classifyCloud",
      imageUrl: "https://example.com/img1.jpg",
      imageDataUrl: "data:image/jpeg;base64,fakedata1",
      localResult: null,
      descriptors: [],
    });

    await sendMessage({
      type: "classifyCloud",
      imageUrl: "https://example.com/img2.jpg",
      imageDataUrl: "data:image/jpeg;base64,fakedata2",
      localResult: null,
      descriptors: [],
    });

    expect(getApiFetchCount()).toBe(2);

    const stats = await sendMessage({ type: "getCloudStats" });
    expect(stats.cloudCallsToday).toBe(2);
    expect(stats.cloudCacheSize).toBe(2);
  });
});
