// background.js — Face detection + gender classification engine with learning system

let modelsLoaded = false;
let modelsLoading = false;
let analyzeCount = 0;
let analyzeErrors = [];
let blockingEnabled = true;
let whitelist = [];

// Per-session cache: URL → { containsWomen: boolean }
const analysisCache = new Map();

// --- Learning data (in-memory caches, persisted to storage) ---

let knownFaces = [];       // {descriptor: number[], url: string, timestamp: number}
let knownSafeFaces = [];   // {descriptor: number[], url: string, timestamp: number}
let manualBlocklist = [];   // URL strings
let manualSafelist = [];    // URL strings
let trainingData = [];      // {descriptor: number[], label: number}

const MAX_KNOWN_FACES = 1000;
const MAX_TRAINING_DATA = 500;

// Simple logistic regression classifier
let classifierWeights = null; // {weights: number[128], bias: number} or null

// --- State management ---

async function loadState() {
  const data = await browser.storage.local.get(["blockingEnabled", "whitelist"]);
  if (data.blockingEnabled !== undefined) {
    blockingEnabled = data.blockingEnabled;
  }
  if (data.whitelist) {
    whitelist = data.whitelist;
  }
}

async function saveState() {
  await browser.storage.local.set({ blockingEnabled, whitelist });
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

// --- Euclidean distance ---

function euclideanDistance(desc1, desc2) {
  let sum = 0;
  for (let i = 0; i < desc1.length; i++) {
    const diff = desc1[i] - desc2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// --- KNN matching ---

function matchesKnownBlockedFace(descriptor) {
  for (const entry of knownFaces) {
    if (euclideanDistance(descriptor, entry.descriptor) < 0.5) {
      return true;
    }
  }
  return false;
}

function matchesKnownSafeFace(descriptor) {
  for (const entry of knownSafeFaces) {
    if (euclideanDistance(descriptor, entry.descriptor) < 0.4) {
      return true;
    }
  }
  return false;
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

function classifyDescriptor(descriptor) {
  if (!classifierWeights) return 0;
  let z = classifierWeights.bias;
  for (let i = 0; i < descriptor.length; i++) {
    z += classifierWeights.weights[i] * descriptor[i];
  }
  return sigmoid(z);
}

// --- Model loading ---

// Load a face-api.js model by fetching the manifest ourselves
// (loadFromUri fails because getModelUris strips moz-extension:// protocol).
// We fetch the manifest with our own fetch(), then use tf.io.loadWeights
// which also uses fetch() internally (works fine with moz-extension://).
async function loadNetFromUri(net, modelName, basePath) {
  const manifestUrl = basePath + modelName + "-weights_manifest.json";
  const manifestResp = await fetch(manifestUrl);
  if (!manifestResp.ok) throw new Error(`Manifest fetch failed: ${manifestResp.status} ${manifestUrl}`);
  const manifest = await manifestResp.json();

  // tf.io.loadWeights fetches shards relative to modelBaseUri
  const weightMap = await faceapi.tf.io.loadWeights(manifest, basePath);
  net.loadFromWeightMap(weightMap);
}

async function loadModels() {
  if (modelsLoaded || modelsLoading) return modelsLoaded;
  modelsLoading = true;

  try {
    // Try WASM backend first (faster), fall back to CPU
    let backend = 'cpu';
    try {
      const wasmPath = browser.runtime.getURL("lib/wasm/");
      faceapi.tf.setWasmPaths(wasmPath);
      await faceapi.tf.setBackend('wasm');
      await faceapi.tf.ready();
      backend = 'wasm';
    } catch (wasmErr) {
      console.warn("[Shmirat Eynaim] WASM backend failed, using CPU:", wasmErr.message);
      await faceapi.tf.setBackend('cpu');
      await faceapi.tf.ready();
    }
    console.log("[Shmirat Eynaim] TF backend:", backend);

    const basePath = browser.runtime.getURL("models/");
    console.log("[Shmirat Eynaim] Loading models from:", basePath);

    await loadNetFromUri(faceapi.nets.tinyFaceDetector, "tiny_face_detector_model", basePath);
    console.log("[Shmirat Eynaim] tinyFaceDetector loaded");

    await loadNetFromUri(faceapi.nets.ageGenderNet, "age_gender_model", basePath);
    console.log("[Shmirat Eynaim] ageGenderNet loaded");

    await loadNetFromUri(faceapi.nets.faceLandmark68TinyNet, "face_landmark_68_tiny_model", basePath);
    console.log("[Shmirat Eynaim] faceLandmark68TinyNet loaded");

    await loadNetFromUri(faceapi.nets.faceRecognitionNet, "face_recognition_model", basePath);
    console.log("[Shmirat Eynaim] faceRecognitionNet loaded");

    modelsLoaded = true;
    console.log("[Shmirat Eynaim] All models loaded successfully");
  } catch (err) {
    console.error("[Shmirat Eynaim] Failed to load models:", err);
    modelsLoaded = false;
  }

  modelsLoading = false;
  return modelsLoaded;
}

// --- Image analysis ---

async function analyzeImageData(imageDataUrl, originalUrl) {
  // Check manual blocklist (compare against original URL, not data URL)
  if (originalUrl && manualBlocklist.includes(originalUrl)) {
    return { containsWomen: true, source: "manual_blocklist" };
  }

  // Check manual safelist
  if (originalUrl && manualSafelist.includes(originalUrl)) {
    return { containsWomen: false, source: "manual_safelist" };
  }

  // Check cache
  if (analysisCache.has(imageDataUrl)) {
    return analysisCache.get(imageDataUrl);
  }

  // Ensure models are loaded
  if (!modelsLoaded) {
    const loaded = await loadModels();
    if (!loaded) {
      return { containsWomen: true, error: "models_not_loaded" };
    }
  }

  try {
    // Create an image bitmap from the data URL
    const response = await fetch(imageDataUrl);
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);

    // Draw to OffscreenCanvas for analysis
    // Use 256px max for speed — sufficient for face detection
    const maxDim = 256;
    let width = imageBitmap.width;
    let height = imageBitmap.height;

    // Downscale large images
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imageBitmap, 0, 0, width, height);
    imageBitmap.close();

    // Check if learning system has data — if so, we need descriptors
    const needDescriptors = knownFaces.length > 0 ||
      knownSafeFaces.length > 0 ||
      classifierWeights !== null;

    const t0 = performance.now();

    // Wrap detection in a timeout to detect hangs
    const DETECT_TIMEOUT = 60_000; // 60 seconds
    let detections;
    const detectionPromise = (async () => {
      if (needDescriptors) {
        return faceapi
          .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
          .withFaceLandmarks(true)
          .withFaceDescriptors()
          .withAgeAndGender();
      } else {
        return faceapi
          .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
          .withAgeAndGender();
      }
    })();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("detection_timeout")), DETECT_TIMEOUT)
    );

    detections = await Promise.race([detectionPromise, timeoutPromise]);

    const t1 = performance.now();
    console.log("[Shmirat Eynaim] Detection:", Math.round(t1 - t0), "ms, faces:", detections ? detections.length : 0);

    let containsWomen = false;

    if (detections && detections.length > 0) {
      for (const det of detections) {
        let flagBlock = false;
        let flagSafe = false;

        // a. Gender model check
        if (det.gender === "female" && det.genderProbability > 0.6) {
          flagBlock = true;
        }

        // b. KNN + classifier checks (only when descriptors available)
        if (needDescriptors && det.descriptor) {
          const descriptor = Array.from(det.descriptor);

          if (matchesKnownBlockedFace(descriptor)) {
            flagBlock = true;
          }
          if (matchesKnownSafeFace(descriptor)) {
            flagSafe = true; // override
          }

          if (classifierWeights && classifyDescriptor(descriptor) > 0.5) {
            flagBlock = true;
          }
        }

        // If flagged block and NOT overridden by safe
        if (flagBlock && !flagSafe) {
          containsWomen = true;
          break;
        }
      }
    }

    const result = { containsWomen, faceCount: detections ? detections.length : 0 };
    analysisCache.set(imageDataUrl, result);
    return result;
  } catch (err) {
    console.error("[Shmirat Eynaim] Analysis error:", err);
    // Strict mode: block image on error
    return { containsWomen: true, error: err.message };
  }
}

// --- Extract descriptors from an image URL ---

async function extractDescriptors(imageDataUrl) {
  if (!modelsLoaded) {
    const loaded = await loadModels();
    if (!loaded) return [];
  }

  try {
    const response = await fetch(imageDataUrl);
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);

    const maxDim = 512;
    let width = imageBitmap.width;
    let height = imageBitmap.height;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imageBitmap, 0, 0, width, height);
    imageBitmap.close();

    const detections = await faceapi
      .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
      .withFaceLandmarks(true)
      .withFaceDescriptors();

    return detections.map(d => Array.from(d.descriptor));
  } catch (err) {
    console.error("[Shmirat Eynaim] Descriptor extraction error:", err);
    return [];
  }
}

// --- Learning actions (shared by context menu and messages) ---

async function handleBlockImage(url, tabId) {
  // Add URL to manual blocklist
  if (!manualBlocklist.includes(url)) {
    manualBlocklist.push(url);
  }

  // Clear cache for this URL
  analysisCache.delete(url);

  // Fetch image and extract descriptors
  const dataUrl = await fetchImageAsDataUrl(url);
  if (dataUrl) {
    const descriptors = await extractDescriptors(dataUrl);
    const now = Date.now();
    for (const descriptor of descriptors) {
      // Add to knownFaces (cap at MAX_KNOWN_FACES)
      knownFaces.push({ descriptor, url, timestamp: now });
      if (knownFaces.length > MAX_KNOWN_FACES) {
        knownFaces.shift();
      }

      // Add to trainingData with label=1 (cap at MAX_TRAINING_DATA)
      trainingData.push({ descriptor, label: 1 });
      if (trainingData.length > MAX_TRAINING_DATA) {
        trainingData.shift();
      }
    }

    // Retrain if enough data
    if (trainingData.length >= 10) {
      trainClassifier();
    }
  }

  await saveLearningData();

  // Show temporary badge
  showTemporaryBadge("✓", "#2ecc71");

  // Notify content script to hide the image
  if (tabId) {
    try {
      await browser.tabs.sendMessage(tabId, { type: "hideImage", url });
    } catch { /* tab may not have content script */ }
  }
}

async function handleSafeImage(url, tabId) {
  // Add URL to manual safelist
  if (!manualSafelist.includes(url)) {
    manualSafelist.push(url);
  }

  // Clear cache for this URL
  analysisCache.delete(url);

  // Fetch image and extract descriptors
  const dataUrl = await fetchImageAsDataUrl(url);
  if (dataUrl) {
    const descriptors = await extractDescriptors(dataUrl);
    const now = Date.now();
    for (const descriptor of descriptors) {
      // Add to knownSafeFaces (cap at MAX_KNOWN_FACES)
      knownSafeFaces.push({ descriptor, url, timestamp: now });
      if (knownSafeFaces.length > MAX_KNOWN_FACES) {
        knownSafeFaces.shift();
      }

      // Add to trainingData with label=0 (cap at MAX_TRAINING_DATA)
      trainingData.push({ descriptor, label: 0 });
      if (trainingData.length > MAX_TRAINING_DATA) {
        trainingData.shift();
      }
    }

    // Retrain if enough data
    if (trainingData.length >= 10) {
      trainClassifier();
    }
  }

  await saveLearningData();

  // Notify content script to unhide the image
  if (tabId) {
    try {
      await browser.tabs.sendMessage(tabId, { type: "showImage", url });
    } catch { /* tab may not have content script */ }
  }
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

// Firefox supports both browser.menus and browser.contextMenus
const menusAPI = browser.menus || browser.contextMenus;

function createContextMenus() {
  if (!menusAPI) {
    console.warn("[Shmirat Eynaim] No menus API available");
    return;
  }
  menusAPI.create({
    id: "shmirat-block",
    title: "Block — contains women",
    contexts: ["image"]
  });
  menusAPI.create({
    id: "shmirat-safe",
    title: "Safe — no women here",
    contexts: ["image"]
  });
}

if (menusAPI) {
  menusAPI.onClicked.addListener(async (info, tab) => {
    const imageUrl = info.srcUrl;
    if (!imageUrl) return;

    const tabId = tab ? tab.id : null;

    if (info.menuItemId === "shmirat-block") {
      await handleBlockImage(imageUrl, tabId);
    } else if (info.menuItemId === "shmirat-safe") {
      await handleSafeImage(imageUrl, tabId);
    }
  });
}

// --- Message handling ---

browser.runtime.onMessage.addListener((msg, sender) => {
  switch (msg.type) {
    case "getDebugStatus":
      return Promise.resolve({
        modelsLoaded,
        modelsLoading,
        backend: faceapi.tf.getBackend(),
        blockingEnabled,
        cacheSize: analysisCache.size,
        analyzeCount,
        analyzeErrors: analyzeErrors.slice(-5),
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
      // Reload active tab so changes take effect
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
      return Promise.resolve({ blockingEnabled, whitelisted });
    }

    case "analyzeImage": {
      analyzeCount++;
      return analyzeImageData(msg.imageDataUrl, msg.originalUrl).catch(e => {
        analyzeErrors.push(e.message || String(e));
        return { containsWomen: true, error: e.message };
      });
    }

    case "fetchImage": {
      // Content script requests CORS proxy fetch
      return fetchImageAsDataUrl(msg.url);
    }

    case "getStats": {
      // Popup requests page stats from content script
      // Forward to content script in the active tab
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

    // --- Learning message handlers ---

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
      analysisCache.clear();
      return saveLearningData().then(() => ({ success: true }));
    }

    case "exportLearning": {
      return Promise.resolve({
        knownFaces,
        knownSafeFaces,
        manualBlocklist,
        manualSafelist,
        trainingData,
        classifierWeights,
      });
    }

    case "importLearning": {
      const importData = msg.data;
      if (importData.knownFaces) {
        knownFaces = knownFaces.concat(importData.knownFaces);
        if (knownFaces.length > MAX_KNOWN_FACES) {
          knownFaces = knownFaces.slice(knownFaces.length - MAX_KNOWN_FACES);
        }
      }
      if (importData.knownSafeFaces) {
        knownSafeFaces = knownSafeFaces.concat(importData.knownSafeFaces);
        if (knownSafeFaces.length > MAX_KNOWN_FACES) {
          knownSafeFaces = knownSafeFaces.slice(knownSafeFaces.length - MAX_KNOWN_FACES);
        }
      }
      if (importData.manualBlocklist) {
        for (const url of importData.manualBlocklist) {
          if (!manualBlocklist.includes(url)) manualBlocklist.push(url);
        }
      }
      if (importData.manualSafelist) {
        for (const url of importData.manualSafelist) {
          if (!manualSafelist.includes(url)) manualSafelist.push(url);
        }
      }
      if (importData.trainingData) {
        trainingData = trainingData.concat(importData.trainingData);
        if (trainingData.length > MAX_TRAINING_DATA) {
          trainingData = trainingData.slice(trainingData.length - MAX_TRAINING_DATA);
        }
      }
      if (importData.classifierWeights) {
        classifierWeights = importData.classifierWeights;
      }
      analysisCache.clear();
      // Retrain if we have enough data
      if (trainingData.length >= 10) {
        trainClassifier();
      }
      return saveLearningData().then(() => ({ success: true }));
    }

    case "blockImage": {
      const tabId = sender.tab ? sender.tab.id : null;
      return handleBlockImage(msg.url, tabId).then(() => ({ success: true }));
    }

    case "safeImage": {
      const tabId = sender.tab ? sender.tab.id : null;
      return handleSafeImage(msg.url, tabId).then(() => ({ success: true }));
    }

    default:
      return Promise.resolve({});
  }
});

// --- Init ---

// Create context menus immediately (not inside async block)
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
    await loadModels();
  } catch (err) {
    console.error("[Shmirat Eynaim] Init error:", err);
  }
})();
