// background.js — State management, learning data persistence, and popup messaging
// ML inference runs in content.js (WASM-accelerated)

let blockingEnabled = true;
let whitelist = [];

// --- Learning data (in-memory caches, persisted to storage) ---

let knownFaces = [];       // {descriptor: number[], url: string, timestamp: number}
let knownSafeFaces = [];   // {descriptor: number[], url: string, timestamp: number}
let manualBlocklist = [];   // URL strings
let manualSafelist = [];    // URL strings
let trainingData = [];      // {descriptor: number[], label: number}
let classifierWeights = null; // {weights: number[128], bias: number} or null

const MAX_KNOWN_FACES = 1000;
const MAX_TRAINING_DATA = 500;
const MAX_CLOUD_CACHE = 5000;

// --- Cloud API state ---

let anthropicApiKey = "";
let cloudMode = "all"; // "all" | "uncertain" | "never"
let cloudCache = {};   // { [url]: { containsWomen: boolean, timestamp: number } }
let cloudCallsToday = 0;
let cloudCallsDate = "";  // "YYYY-MM-DD"
let cloudSavedCount = 0;  // images handled locally that would have gone to cloud

// --- State management ---

async function loadState() {
  const data = await browser.storage.local.get([
    "blockingEnabled", "whitelist", "anthropicApiKey", "cloudMode",
    "cloudCache", "cloudCallsToday", "cloudCallsDate", "cloudSavedCount",
  ]);
  if (data.blockingEnabled !== undefined) blockingEnabled = data.blockingEnabled;
  if (data.whitelist) whitelist = data.whitelist;
  if (data.anthropicApiKey) anthropicApiKey = data.anthropicApiKey;
  if (data.cloudMode) cloudMode = data.cloudMode;
  if (data.cloudCache) cloudCache = data.cloudCache;
  if (data.cloudCallsToday !== undefined) cloudCallsToday = data.cloudCallsToday;
  if (data.cloudCallsDate) cloudCallsDate = data.cloudCallsDate;
  if (data.cloudSavedCount !== undefined) cloudSavedCount = data.cloudSavedCount;

  // Reset daily counter if date changed
  const today = new Date().toISOString().slice(0, 10);
  if (cloudCallsDate !== today) {
    cloudCallsToday = 0;
    cloudSavedCount = 0;
    cloudCallsDate = today;
  }
}

async function saveState() {
  await browser.storage.local.set({
    blockingEnabled, whitelist, anthropicApiKey, cloudMode,
    cloudCache, cloudCallsToday, cloudCallsDate, cloudSavedCount,
  });
}

// --- Learning data persistence ---

async function loadLearningData() {
  const data = await browser.storage.local.get([
    "knownFaces", "knownSafeFaces", "manualBlocklist", "manualSafelist",
    "trainingData", "classifierWeights"
  ]);
  if (data.knownFaces) knownFaces = data.knownFaces;
  if (data.knownSafeFaces) knownSafeFaces = data.knownSafeFaces;
  if (data.manualBlocklist) manualBlocklist = data.manualBlocklist;
  if (data.manualSafelist) manualSafelist = data.manualSafelist;
  if (data.trainingData) trainingData = data.trainingData;
  if (data.classifierWeights) classifierWeights = data.classifierWeights;
}

async function saveLearningData() {
  await browser.storage.local.set({
    knownFaces, knownSafeFaces, manualBlocklist, manualSafelist,
    trainingData, classifierWeights
  });
}

// --- Logistic regression classifier ---

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function trainClassifier() {
  if (trainingData.length < 10) return;

  const dim = 128;
  let weights = new Array(dim).fill(0);
  let bias = 0;
  const lr = 0.1;
  const iterations = 20;

  for (let iter = 0; iter < iterations; iter++) {
    let gradW = new Array(dim).fill(0);
    let gradB = 0;

    for (const example of trainingData) {
      let z = bias;
      for (let i = 0; i < dim; i++) {
        z += weights[i] * example.descriptor[i];
      }
      const pred = sigmoid(z);
      const error = pred - example.label;

      for (let i = 0; i < dim; i++) {
        gradW[i] += error * example.descriptor[i];
      }
      gradB += error;
    }

    const n = trainingData.length;
    for (let i = 0; i < dim; i++) {
      weights[i] -= lr * (gradW[i] / n);
    }
    bias -= lr * (gradB / n);
  }

  classifierWeights = { weights, bias };
  console.log("[Shmirat Eynaim] Classifier trained on", trainingData.length, "examples");
}

// --- Domain helpers ---

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function isDomainWhitelisted(url) {
  const domain = getDomain(url);
  return whitelist.some(
    (d) => domain === d || domain.endsWith("." + d)
  );
}

// --- CORS proxy: fetch image from background (bypasses CORS) ---

async function fetchImageAsDataUrl(url) {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error("[Shmirat Eynaim] Failed to fetch image:", url, err);
    return null;
  }
}

// --- Cloud API: Claude Haiku classification ---

const API_RATE_LIMIT = 10;
let activeApiCalls = 0;
const apiQueue = [];

// In-flight tracking: prevents sending the same URL twice concurrently
const inFlightUrls = new Map(); // url → Promise

async function resizeImageDataUrl(dataUrl, maxDim) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  let { width, height } = bitmap;
  if (width <= maxDim && height <= maxDim) {
    bitmap.close();
    return dataUrl;
  }
  const scale = maxDim / Math.max(width, height);
  width = Math.round(width * scale);
  height = Math.round(height * scale);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const resizedBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(resizedBlob);
  });
}

async function classifyWithHaiku(imageDataUrl) {
  if (!anthropicApiKey) return null;

  const resizedDataUrl = await resizeImageDataUrl(imageDataUrl, 512);
  const match = resizedDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return null;
  const [, mediaType, base64Data] = match;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 50,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64Data },
            },
            {
              type: "text",
              text: "Does this image contain a woman or girl? Answer with exactly one word: YES or NO.",
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      console.warn("[Shmirat Eynaim] Haiku API error:", response.status);
      return null;
    }

    const data = await response.json();
    const answer = data.content?.[0]?.text?.trim().toUpperCase();

    // Track daily usage
    const today = new Date().toISOString().slice(0, 10);
    if (cloudCallsDate !== today) {
      cloudCallsToday = 0;
      cloudSavedCount = 0;
      cloudCallsDate = today;
    }
    cloudCallsToday++;
    saveState();

    return {
      containsWomen: answer === "YES" || (answer && answer.startsWith("YES")),
      source: "haiku",
      raw: answer,
    };
  } catch (err) {
    console.warn("[Shmirat Eynaim] Haiku API call failed:", err.message);
    return null;
  }
}

async function rateLimitedHaikuCall(imageDataUrl) {
  if (activeApiCalls >= API_RATE_LIMIT) {
    await new Promise(resolve => apiQueue.push(resolve));
  }
  activeApiCalls++;
  try {
    return await classifyWithHaiku(imageDataUrl);
  } finally {
    activeApiCalls--;
    if (apiQueue.length > 0) apiQueue.shift()();
  }
}

// Process a cloud classification request. Deduplicates by URL.
async function handleCloudClassify(imageUrl, imageDataUrl, localResult) {
  // 1. Check cloud cache — never send the same URL twice
  if (cloudCache[imageUrl]) {
    cloudSavedCount++;
    return { ...cloudCache[imageUrl], source: "cloud-cache" };
  }

  // 2. Check if this URL is already in-flight
  if (inFlightUrls.has(imageUrl)) {
    return inFlightUrls.get(imageUrl);
  }

  // 3. Check if cloud is disabled
  if (cloudMode === "never" || !anthropicApiKey) {
    return null;
  }

  // 4. In "uncertain" mode, skip if local is confident
  if (cloudMode === "uncertain" && localResult) {
    if (localResult.source === "user") return null;
    if (localResult.knnDistance !== undefined && localResult.knnDistance < 0.3) {
      cloudSavedCount++;
      return null;
    }
    if (localResult.classifierConfidence !== undefined && localResult.classifierConfidence > 0.9) {
      cloudSavedCount++;
      return null;
    }
  }

  // 5. Call Haiku API (rate-limited, deduplicated via in-flight map)
  const promise = (async () => {
    const haikuResult = await rateLimitedHaikuCall(imageDataUrl);
    if (!haikuResult) return null;

    // Cache the result
    cloudCache[imageUrl] = {
      containsWomen: haikuResult.containsWomen,
      timestamp: Date.now(),
    };
    // Trim cache if too large
    const keys = Object.keys(cloudCache);
    if (keys.length > MAX_CLOUD_CACHE) {
      const sorted = keys.sort((a, b) => cloudCache[a].timestamp - cloudCache[b].timestamp);
      for (let i = 0; i < sorted.length - MAX_CLOUD_CACHE; i++) {
        delete cloudCache[sorted[i]];
      }
    }
    saveState();

    console.log("[Shmirat Eynaim] Haiku:", haikuResult.raw, "for", imageUrl.substring(0, 60));
    return haikuResult;
  })();

  inFlightUrls.set(imageUrl, promise);
  try {
    return await promise;
  } finally {
    inFlightUrls.delete(imageUrl);
  }
}

// Feed Haiku result into the learning system
function feedHaikuIntoLearning(imageUrl, haikuResult, descriptors) {
  if (!haikuResult || !descriptors || descriptors.length === 0) return;

  const now = Date.now();
  const shouldBlock = haikuResult.containsWomen;

  for (const descriptor of descriptors) {
    if (shouldBlock) {
      knownFaces.push({ descriptor, url: imageUrl, timestamp: now, source: "haiku" });
      if (knownFaces.length > MAX_KNOWN_FACES) knownFaces.shift();
      trainingData.push({ descriptor, label: 1, source: "haiku" });
    } else {
      knownSafeFaces.push({ descriptor, url: imageUrl, timestamp: now, source: "haiku" });
      if (knownSafeFaces.length > MAX_KNOWN_FACES) knownSafeFaces.shift();
      trainingData.push({ descriptor, label: 0, source: "haiku" });
    }
    if (trainingData.length > MAX_TRAINING_DATA) trainingData.shift();
  }

  // Retrain periodically
  if (trainingData.length >= 10 && trainingData.length % 20 === 0) {
    trainClassifier();
  }
  saveLearningData();
}

// --- Badge / icon updates ---

function updateBadge() {
  const text = blockingEnabled ? "ON" : "OFF";
  const color = blockingEnabled ? "#2ecc71" : "#888";
  browser.browserAction.setBadgeText({ text });
  browser.browserAction.setBadgeBackgroundColor({ color });
}

function showTemporaryBadge(text, color) {
  browser.browserAction.setBadgeText({ text });
  browser.browserAction.setBadgeBackgroundColor({ color });
  setTimeout(() => {
    updateBadge();
  }, 2000);
}

// --- Context menus ---

const menusAPI = browser.menus || browser.contextMenus;

function createContextMenus() {
  if (!menusAPI) {
    console.warn("[Shmirat Eynaim] No menus API available");
    return;
  }
  // Include "link" and "page" so the menu appears on elements that aren't
  // standard <img> (e.g. YouTube thumbnails wrapped in <a> tags).
  menusAPI.create({
    id: "shmirat-block",
    title: "Block — contains women",
    contexts: ["image", "link", "page"]
  });
  menusAPI.create({
    id: "shmirat-safe",
    title: "Safe — no women here",
    contexts: ["image", "link", "page"]
  });
}

// Track the image URL under the cursor, reported by content script on contextmenu.
// Used as fallback when info.srcUrl is unavailable (e.g. YouTube thumbnails).
let lastContextMenuImageUrl = null;

if (menusAPI) {
  menusAPI.onClicked.addListener(async (info, tab) => {
    // Use srcUrl for native images, fall back to content-script-detected URL
    const imageUrl = info.srcUrl || lastContextMenuImageUrl;
    lastContextMenuImageUrl = null;
    if (!imageUrl) return;
    const tabId = tab ? tab.id : null;

    if (info.menuItemId === "shmirat-block") {
      if (!manualBlocklist.includes(imageUrl)) {
        manualBlocklist.push(imageUrl);
      }
      manualSafelist = manualSafelist.filter(u => u !== imageUrl);
      await saveLearningData();
      showTemporaryBadge("✓", "#2ecc71");
      // Tell content script to hide + extract descriptors
      if (tabId) {
        try {
          await browser.tabs.sendMessage(tabId, { type: "blockAndLearn", url: imageUrl });
        } catch { /* tab may not have content script */ }
      }
    } else if (info.menuItemId === "shmirat-safe") {
      if (!manualSafelist.includes(imageUrl)) {
        manualSafelist.push(imageUrl);
      }
      manualBlocklist = manualBlocklist.filter(u => u !== imageUrl);
      await saveLearningData();
      // Tell content script to show + extract descriptors
      if (tabId) {
        try {
          await browser.tabs.sendMessage(tabId, { type: "safeAndLearn", url: imageUrl });
        } catch { /* tab may not have content script */ }
      }
    }
  });
}

// --- Message handling ---

browser.runtime.onMessage.addListener((msg, sender) => {
  switch (msg.type) {
    case "contextMenuImage": {
      // Content script reports the image URL under the cursor before context menu opens
      lastContextMenuImageUrl = msg.url || null;
      return Promise.resolve({ ok: true });
    }

    case "getDebugStatus":
      return Promise.resolve({
        blockingEnabled,
        whitelistCount: whitelist.length,
        knownFacesCount: knownFaces.length,
        knownSafeFacesCount: knownSafeFaces.length,
        trainingDataCount: trainingData.length,
        classifierTrained: classifierWeights !== null,
      });

    case "getState":
      return Promise.resolve({
        blockingEnabled,
        whitelist,
        domain: msg.domain || "",
      });

    case "toggle": {
      blockingEnabled = !blockingEnabled;
      saveState();
      updateBadge();
      return browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (tab) browser.tabs.reload(tab.id);
        return { blockingEnabled, whitelist };
      });
    }

    case "addWhitelist": {
      const domain = msg.domain;
      if (domain && !whitelist.includes(domain)) {
        whitelist.push(domain);
        saveState();
        return browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
          if (tab) browser.tabs.reload(tab.id);
          return { blockingEnabled, whitelist };
        });
      }
      return Promise.resolve({ blockingEnabled, whitelist });
    }

    case "removeWhitelist": {
      whitelist = whitelist.filter((d) => d !== msg.domain);
      saveState();
      return browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (tab) browser.tabs.reload(tab.id);
        return { blockingEnabled, whitelist };
      });
    }

    case "getBlockingState": {
      const url = sender.tab ? sender.tab.url : "";
      const whitelisted = isDomainWhitelisted(url);
      return Promise.resolve({
        blockingEnabled,
        whitelisted,
        manualBlocklist,
        manualSafelist,
        knownFaces,
        knownSafeFaces,
        classifierWeights,
        cloudCache,
        cloudMode,
        hasApiKey: !!anthropicApiKey,
      });
    }

    case "fetchImage": {
      return fetchImageAsDataUrl(msg.url);
    }

    case "getStats": {
      return browser.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
        if (tab) {
          try {
            return await browser.tabs.sendMessage(tab.id, { type: "getStats" });
          } catch {
            return { scanned: 0, hidden: 0 };
          }
        }
        return { scanned: 0, hidden: 0 };
      });
    }

    // Content script sends learned descriptors after user blocks an image
    case "learnBlock": {
      const { url, descriptors } = msg;
      if (!manualBlocklist.includes(url)) manualBlocklist.push(url);
      manualSafelist = manualSafelist.filter(u => u !== url);
      const now = Date.now();
      for (const descriptor of descriptors) {
        knownFaces.push({ descriptor, url, timestamp: now });
        if (knownFaces.length > MAX_KNOWN_FACES) knownFaces.shift();
        trainingData.push({ descriptor, label: 1 });
        if (trainingData.length > MAX_TRAINING_DATA) trainingData.shift();
      }
      if (trainingData.length >= 10) trainClassifier();
      saveLearningData();
      return Promise.resolve({ success: true });
    }

    // Content script sends learned descriptors after user marks image safe
    case "learnSafe": {
      const { url: safeUrl, descriptors: safeDescriptors } = msg;
      if (!manualSafelist.includes(safeUrl)) manualSafelist.push(safeUrl);
      manualBlocklist = manualBlocklist.filter(u => u !== safeUrl);
      const now = Date.now();
      for (const descriptor of safeDescriptors) {
        knownSafeFaces.push({ descriptor, url: safeUrl, timestamp: now });
        if (knownSafeFaces.length > MAX_KNOWN_FACES) knownSafeFaces.shift();
        trainingData.push({ descriptor, label: 0 });
        if (trainingData.length > MAX_TRAINING_DATA) trainingData.shift();
      }
      if (trainingData.length >= 10) trainClassifier();
      saveLearningData();
      return Promise.resolve({ success: true });
    }

    case "blockImage": {
      const url = msg.url;
      if (!manualBlocklist.includes(url)) manualBlocklist.push(url);
      manualSafelist = manualSafelist.filter(u => u !== url);
      saveLearningData();
      const tabId = sender.tab ? sender.tab.id : null;
      if (tabId) {
        browser.tabs.sendMessage(tabId, { type: "blockAndLearn", url }).catch(() => {});
      }
      return Promise.resolve({ success: true });
    }

    case "safeImage": {
      const url = msg.url;
      if (!manualSafelist.includes(url)) manualSafelist.push(url);
      manualBlocklist = manualBlocklist.filter(u => u !== url);
      saveLearningData();
      const tabId = sender.tab ? sender.tab.id : null;
      if (tabId) {
        browser.tabs.sendMessage(tabId, { type: "safeAndLearn", url }).catch(() => {});
      }
      return Promise.resolve({ success: true });
    }

    case "classifyCloud": {
      const { imageUrl, imageDataUrl, localResult, descriptors } = msg;
      return handleCloudClassify(imageUrl, imageDataUrl, localResult).then(result => {
        if (result && descriptors && descriptors.length > 0) {
          feedHaikuIntoLearning(imageUrl, result, descriptors);
        }
        return result;
      });
    }

    case "setApiKey": {
      anthropicApiKey = msg.key || "";
      saveState();
      return Promise.resolve({ success: true });
    }

    case "setCloudMode": {
      cloudMode = msg.mode || "all";
      saveState();
      return Promise.resolve({ success: true });
    }

    case "getCloudStats": {
      return Promise.resolve({
        cloudMode,
        hasApiKey: !!anthropicApiKey,
        cloudCallsToday,
        cloudSavedCount,
        cloudCacheSize: Object.keys(cloudCache).length,
      });
    }

    case "getLearningStats": {
      return Promise.resolve({
        knownFacesCount: knownFaces.length,
        knownSafeFacesCount: knownSafeFaces.length,
        trainingDataCount: trainingData.length,
        classifierTrained: classifierWeights !== null,
      });
    }

    case "resetLearning": {
      knownFaces = [];
      knownSafeFaces = [];
      manualBlocklist = [];
      manualSafelist = [];
      trainingData = [];
      classifierWeights = null;
      return saveLearningData().then(() => ({ success: true }));
    }

    case "exportLearning": {
      return Promise.resolve({
        knownFaces, knownSafeFaces, manualBlocklist, manualSafelist,
        trainingData, classifierWeights,
      });
    }

    case "importLearning": {
      const d = msg.data;
      if (d.knownFaces) {
        knownFaces = knownFaces.concat(d.knownFaces);
        if (knownFaces.length > MAX_KNOWN_FACES) knownFaces = knownFaces.slice(-MAX_KNOWN_FACES);
      }
      if (d.knownSafeFaces) {
        knownSafeFaces = knownSafeFaces.concat(d.knownSafeFaces);
        if (knownSafeFaces.length > MAX_KNOWN_FACES) knownSafeFaces = knownSafeFaces.slice(-MAX_KNOWN_FACES);
      }
      if (d.manualBlocklist) {
        for (const url of d.manualBlocklist) {
          if (!manualBlocklist.includes(url)) manualBlocklist.push(url);
        }
      }
      if (d.manualSafelist) {
        for (const url of d.manualSafelist) {
          if (!manualSafelist.includes(url)) manualSafelist.push(url);
        }
      }
      if (d.trainingData) {
        trainingData = trainingData.concat(d.trainingData);
        if (trainingData.length > MAX_TRAINING_DATA) trainingData = trainingData.slice(-MAX_TRAINING_DATA);
      }
      if (d.classifierWeights) classifierWeights = d.classifierWeights;
      if (trainingData.length >= 10) trainClassifier();
      return saveLearningData().then(() => ({ success: true }));
    }

    default:
      return Promise.resolve({});
  }
});

// --- Init ---

try {
  createContextMenus();
  console.log("[Shmirat Eynaim] Context menus created");
} catch (err) {
  console.error("[Shmirat Eynaim] Failed to create context menus:", err);
}

(async () => {
  try {
    await loadState();
    await loadLearningData();
    updateBadge();
    console.log("[Shmirat Eynaim] Background script initialized");
  } catch (err) {
    console.error("[Shmirat Eynaim] Init error:", err);
  }
})();
