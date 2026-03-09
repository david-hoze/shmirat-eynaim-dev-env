// content.js — Image discovery, ML inference (WASM), learning system, and hiding
// face-api.js is loaded before this script via manifest content_scripts

(async () => {
  // Ask background for blocking state + learning data
  let state;
  try {
    state = await browser.runtime.sendMessage({ type: "getBlockingState" });
  } catch {
    state = { blockingEnabled: true, whitelisted: false, manualBlocklist: [], manualSafelist: [],
              knownFaces: [], knownSafeFaces: [], classifierWeights: null };
  }

  if (!state.blockingEnabled || state.whitelisted) {
    const earlyHide = document.getElementById("shmirat-eynaim-early-hide");
    if (earlyHide) earlyHide.remove();
    return; // Extension off or site whitelisted
  }

  // Manual blocklist/safelist
  const manualBlocklist = new Set(state.manualBlocklist || []);
  const manualSafelist = new Set(state.manualSafelist || []);

  // Learning data from background
  const knownFaces = state.knownFaces || [];       // {descriptor, url, timestamp}
  const knownSafeFaces = state.knownSafeFaces || [];
  const classifierWeights = state.classifierWeights || null;

  // --- Learning helpers ---

  function euclideanDistance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const d = a[i] - b[i];
      sum += d * d;
    }
    return Math.sqrt(sum);
  }

  function matchesKnownBlockedFace(descriptor) {
    for (const entry of knownFaces) {
      if (euclideanDistance(descriptor, entry.descriptor) < 0.5) return true;
    }
    return false;
  }

  function matchesKnownSafeFace(descriptor) {
    for (const entry of knownSafeFaces) {
      if (euclideanDistance(descriptor, entry.descriptor) < 0.4) return true;
    }
    return false;
  }

  function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

  function classifyDescriptor(descriptor) {
    if (!classifierWeights) return 0;
    let z = classifierWeights.bias;
    for (let i = 0; i < descriptor.length; i++) {
      z += classifierWeights.weights[i] * descriptor[i];
    }
    return sigmoid(z);
  }

  const hasLearningData = knownFaces.length > 0 || knownSafeFaces.length > 0 || classifierWeights !== null;

  // Cloud cache from background (prevents re-sending URLs to Haiku)
  const cloudCache = state.cloudCache || {};
  const cloudMode = state.cloudMode || "all";
  const hasApiKey = state.hasApiKey || false;

  // Shared server state
  const serverEnabled = state.serverEnabled || false;
  const serverCache = {}; // { [url]: { containsWomen, confidence, voteBlock, voteSafe } }

  // --- ML model loading ---

  let modelsLoaded = false;
  let modelsLoading = false;
  let mlBackend = "none";
  let personDetector = null; // COCO-SSD model for person detection

  async function loadNetFromUri(net, modelName, basePath) {
    const manifestUrl = basePath + modelName + "-weights_manifest.json";
    const manifestResp = await fetch(manifestUrl);
    if (!manifestResp.ok) throw new Error(`Manifest fetch failed: ${manifestResp.status} ${manifestUrl}`);
    const manifest = await manifestResp.json();
    const weightMap = await faceapi.tf.io.loadWeights(manifest, basePath);
    net.loadFromWeightMap(weightMap);
  }

  async function loadModels() {
    if (modelsLoaded || modelsLoading) return modelsLoaded;
    modelsLoading = true;

    try {
      // Disable WebGL — content scripts get SecurityError on texImage2D
      faceapi.tf.env().set('WEBGL_VERSION', 0);

      const backends = ['wasm', 'cpu'];
      for (const backend of backends) {
        try {
          if (backend === 'wasm') {
            const wasmPath = browser.runtime.getURL("lib/wasm/");
            faceapi.tf.setWasmPaths(wasmPath);
          }
          await faceapi.tf.setBackend(backend);
          await faceapi.tf.ready();
          mlBackend = backend;
          break;
        } catch (err) {
          console.warn(`[SE] ${backend} backend failed:`, err.message);
        }
      }
      console.log("[SE] TF backend:", mlBackend);

      const basePath = browser.runtime.getURL("models/");
      await loadNetFromUri(faceapi.nets.tinyFaceDetector, "tiny_face_detector_model", basePath);
      await loadNetFromUri(faceapi.nets.ageGenderNet, "age_gender_model", basePath);
      // Landmark + recognition models for face descriptors (learning system)
      await loadNetFromUri(faceapi.nets.faceLandmark68TinyNet, "face_landmark_68_tiny_model", basePath);
      await loadNetFromUri(faceapi.nets.faceRecognitionNet, "face_recognition_model", basePath);

      // Load COCO-SSD for person detection (body-only images without visible faces)
      try {
        const cocoModelUrl = browser.runtime.getURL("models/coco-ssd/model.json");
        personDetector = await cocoSsd.load({
          base: "lite_mobilenet_v2",
          modelUrl: cocoModelUrl,
        });
        console.log("[SE] COCO-SSD person detector loaded");
      } catch (cocoErr) {
        console.warn("[SE] COCO-SSD failed to load, person detection disabled:", cocoErr.message);
        personDetector = null;
      }

      modelsLoaded = true;
      console.log("[SE] Models loaded successfully");
    } catch (err) {
      console.error("[SE] Failed to load models:", err);
      modelsLoaded = false;
    }

    modelsLoading = false;
    return modelsLoaded;
  }

  const modelsReadyPromise = loadModels();

  // --- Stats tracking ---
  let scannedCount = 0;
  let hiddenCount = 0;
  let hiddenFaceCount = 0;
  let hiddenBodyCount = 0;

  // --- Cache ---
  const urlCache = new Map();

  // --- Queue ---
  const MAX_CONCURRENT = 3;
  let activeCount = 0;
  const queue = [];

  function enqueue(task) {
    queue.push(task);
    processQueue();
  }

  function processQueue() {
    while (activeCount < MAX_CONCURRENT && queue.length > 0) {
      const task = queue.shift();
      activeCount++;
      task().finally(() => { activeCount--; processQueue(); });
    }
  }

  // --- Icon domains to skip ---
  const ICON_DOMAINS = [
    "fonts.googleapis.com", "fonts.gstatic.com", "cdnjs.cloudflare.com",
    "use.fontawesome.com", "ka-f.fontawesome.com",
  ];

  function isIconDomain(src) {
    try {
      const hostname = new URL(src).hostname;
      return ICON_DOMAINS.some((d) => hostname === d || hostname.endsWith("." + d));
    } catch { return false; }
  }

  function shouldSkip(el) {
    if (el.tagName === "LINK" && el.rel && /icon/i.test(el.rel)) return true;
    const src = el.src || el.currentSrc || "";
    if (el.tagName === "SVG" || src.endsWith(".svg") || src.startsWith("data:image/svg")) return true;
    if (src.startsWith("data:image/") && src.length < 5000) return true;
    if (src && isIconDomain(src)) return true;
    if (el.tagName === "IMG") {
      const w = el.naturalWidth || parseInt(el.getAttribute("width"), 10) || 0;
      const h = el.naturalHeight || parseInt(el.getAttribute("height"), 10) || 0;
      if (w > 0 && h > 0 && (w < 40 || h < 40)) return true;
    }
    return false;
  }

  function getImageSrc(el) {
    if (el.tagName === "IMG" || el.tagName === "IMAGE")
      return el.currentSrc || el.src || el.getAttribute("data-src") || el.getAttribute("data-lazy-src") || "";
    if (el.tagName === "VIDEO") return el.getAttribute("poster") || "";
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg !== "none") {
      const match = bg.match(/url\(["']?(.+?)["']?\)/);
      if (match) return match[1];
    }
    return "";
  }

  // --- Canvas helpers ---

  function imageToCanvas(img, maxDim = 416) {
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    return canvas;
  }

  function loadImage(src, crossOrigin) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (crossOrigin) img.crossOrigin = "anonymous";
      const timer = setTimeout(() => { img.src = ""; reject(new Error("timeout")); }, 10000);
      img.onload = () => { clearTimeout(timer); resolve(img); };
      img.onerror = () => { clearTimeout(timer); reject(new Error("load failed")); };
      img.src = src;
    });
  }

  async function getDetectionCanvas(el, src) {
    // Same-origin: draw directly
    if (el.tagName === "IMG" && el.complete && el.naturalWidth > 0) {
      try {
        const canvas = imageToCanvas(el);
        canvas.getContext("2d").getImageData(0, 0, 1, 1);
        return canvas;
      } catch { /* tainted */ }
    }
    // crossOrigin="anonymous"
    try {
      const img = await loadImage(src, true);
      const canvas = imageToCanvas(img);
      canvas.getContext("2d").getImageData(0, 0, 1, 1);
      return canvas;
    } catch { /* no CORS headers */ }
    // Background CORS proxy
    try {
      const dataUrl = await browser.runtime.sendMessage({ type: "fetchImage", url: src });
      if (dataUrl) {
        const img = await loadImage(dataUrl, false);
        return imageToCanvas(img);
      }
    } catch { /* proxy failed */ }
    return null;
  }

  // --- Tensor from canvas (bypasses fromPixels WebGL SecurityError) ---

  function canvasToTensor(canvas) {
    const ctx = canvas.getContext("2d");
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data, width, height } = imageData;
    const rgb = new Uint8Array(width * height * 3);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
      rgb[j] = data[i];
      rgb[j + 1] = data[i + 1];
      rgb[j + 2] = data[i + 2];
    }
    return faceapi.tf.tensor3d(rgb, [height, width, 3], "int32");
  }

  // --- Face detection ---

  // --- Person detection (COCO-SSD) ---

  async function runPersonDetection(tensorInput) {
    if (!personDetector) return [];
    try {
      const predictions = await personDetector.detect(tensorInput, 20, 0.3);
      return predictions.filter(p =>
        p.class === "person" &&
        p.score > 0.5 &&
        p.bbox[2] > 60 &&  // width
        p.bbox[3] > 60     // height
      );
    } catch (err) {
      console.warn("[SE] Person detection error:", err.message);
      return [];
    }
  }

  // --- Combined face + person detection ---

  async function runDetection(canvas, src) {
    const DETECT_TIMEOUT = 60_000;
    const t0 = performance.now();

    // Create separate tensors for face and person detection to avoid
    // disposal conflicts when running in parallel
    const faceTensor = canvasToTensor(canvas);
    const personTensor = personDetector ? canvasToTensor(canvas) : null;

    // Run face detection and person detection in parallel
    let faceDetectionPromise;
    if (hasLearningData) {
      faceDetectionPromise = faceapi
        .detectAllFaces(faceTensor, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }))
        .withFaceLandmarks(true)
        .withFaceDescriptors()
        .withAgeAndGender();
    } else {
      faceDetectionPromise = faceapi
        .detectAllFaces(faceTensor, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }))
        .withAgeAndGender();
    }

    const personDetectionPromise = personTensor
      ? runPersonDetection(personTensor)
      : Promise.resolve([]);

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("detection_timeout")), DETECT_TIMEOUT)
    );

    let detections, persons;
    try {
      [detections, persons] = await Promise.race([
        Promise.all([faceDetectionPromise, personDetectionPromise]),
        timeoutPromise,
      ]);
    } finally {
      faceTensor.dispose();
      if (personTensor) personTensor.dispose();
    }

    const t1 = performance.now();
    console.log("[SE] Detection:", Math.round(t1 - t0), "ms, faces:", detections ? detections.length : 0,
      "persons:", persons ? persons.length : 0, "src:", src.substring(0, 80));

    let containsWomen = false;
    let reason = "";

    if (detections && detections.length > 0) {
      // Face path: check gender + learning data
      for (const det of detections) {
        let flagBlock = false;
        let flagSafe = false;

        // Gender model check
        if (det.gender === "female" && det.genderProbability > 0.6) {
          flagBlock = true;
        }

        // KNN + classifier checks (only when descriptors available)
        if (hasLearningData && det.descriptor) {
          const descriptor = Array.from(det.descriptor);
          if (matchesKnownBlockedFace(descriptor)) flagBlock = true;
          if (matchesKnownSafeFace(descriptor)) flagSafe = true;
          if (classifierWeights && classifyDescriptor(descriptor) > 0.5) flagBlock = true;
        }

        if (flagBlock && !flagSafe) {
          containsWomen = true;
          reason = "face";
          break;
        }
      }
    } else if (persons && persons.length > 0) {
      // No face detected but person detected → strict mode → hide
      containsWomen = true;
      reason = "person-no-face";
    }

    return {
      containsWomen,
      faceCount: detections ? detections.length : 0,
      personCount: persons ? persons.length : 0,
      reason,
    };
  }

  // --- Extract face descriptors from a canvas (for learning) ---

  async function extractDescriptors(canvas) {
    if (!modelsLoaded) return [];
    try {
      const tensorInput = canvasToTensor(canvas);
      let detections;
      try {
        detections = await faceapi
          .detectAllFaces(tensorInput, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }))
          .withFaceLandmarks(true)
          .withFaceDescriptors();
      } finally {
        tensorInput.dispose();
      }
      return detections.map(d => Array.from(d.descriptor));
    } catch (err) {
      console.error("[SE] Descriptor extraction error:", err);
      return [];
    }
  }

  // --- Image size checks ---

  function isTooSmall(el) {
    if (el.tagName === "IMG") {
      const w = el.naturalWidth || el.width;
      const h = el.naturalHeight || el.height;
      return w < 40 || h < 40;
    }
    const rect = el.getBoundingClientRect();
    return rect.width < 40 || rect.height < 40;
  }

  // --- Marking helpers ---

  function markPending(el) {
    if (el.classList.contains("shmirat-eynaim-pending") ||
        el.classList.contains("shmirat-eynaim-safe") ||
        el.classList.contains("shmirat-eynaim-blocked")) return false;
    el.classList.add("shmirat-eynaim-pending");
    return true;
  }

  function markSafe(el) {
    el.classList.remove("shmirat-eynaim-pending");
    el.classList.add("shmirat-eynaim-safe");
  }

  function markBlocked(el, reason) {
    el.classList.remove("shmirat-eynaim-pending");
    el.classList.add("shmirat-eynaim-blocked");
    if (el.tagName !== "IMG" && el.tagName !== "VIDEO") {
      el.style.setProperty("background-image", "none", "important");
    }
    hiddenCount++;
    if (reason === "person-no-face") hiddenBodyCount++;
    else if (reason === "face") hiddenFaceCount++;
  }

  // --- Shared server helpers ---

  // Batch lookup URLs from the shared server, populates serverCache
  async function serverBatchLookup(urls) {
    if (!serverEnabled || urls.length === 0) return;
    try {
      const results = await browser.runtime.sendMessage({
        type: "serverBatchLookup",
        urls,
      });
      if (results) {
        for (const [url, data] of Object.entries(results)) {
          serverCache[url] = data;
        }
      }
    } catch (err) {
      console.warn("[SE] Server batch lookup error:", err.message);
    }
  }

  // Submit a classification result to the shared server (non-blocking)
  function serverSubmitClassification(url, containsWomen, source, confidence) {
    if (!serverEnabled) return;
    browser.runtime.sendMessage({
      type: "serverSubmitClassification",
      url,
      containsWomen,
      source,
      confidence,
    }).catch(() => {});
  }

  // Submit face descriptors to the shared server (non-blocking)
  function serverSubmitDescriptors(descriptors, label, confidence) {
    if (!serverEnabled) return;
    for (const desc of descriptors) {
      browser.runtime.sendMessage({
        type: "serverSubmitDescriptor",
        descriptor: desc,
        label,
        confidence,
      }).catch(() => {});
    }
  }

  // --- Cloud classification helper ---

  async function requestCloudClassify(src, canvas, localResult) {
    if (!hasApiKey || cloudMode === "never") return null;

    // Check cloud cache locally (loaded at init) — don't send if already cached
    if (cloudCache[src]) return { ...cloudCache[src], source: "cloud-cache" };

    // Get image data URL for sending to background
    let imageDataUrl;
    try {
      imageDataUrl = canvas.toDataURL("image/jpeg", 0.8);
    } catch {
      return null;
    }

    // Extract descriptors to feed into learning if Haiku returns a result
    let descriptors = [];
    try {
      descriptors = await extractDescriptors(canvas);
    } catch { /* ignore */ }

    try {
      const result = await browser.runtime.sendMessage({
        type: "classifyCloud",
        imageUrl: src,
        imageDataUrl,
        localResult: localResult ? {
          source: localResult.reason || "local",
          knnDistance: localResult.knnDistance,
          classifierConfidence: localResult.classifierConfidence,
        } : null,
        descriptors,
      });
      return result;
    } catch (err) {
      console.warn("[SE] Cloud classify error:", err.message);
      return null;
    }
  }

  // --- Analyze a single image element ---

  async function analyzeElement(el) {
    const src = getImageSrc(el);
    if (!src) { markSafe(el); return; }

    if (manualBlocklist.has(src)) { markBlocked(el); scannedCount++; return; }
    if (manualSafelist.has(src)) { markSafe(el); scannedCount++; return; }

    if (urlCache.has(src)) {
      const cached = urlCache.get(src);
      if (cached.containsWomen) markBlocked(el, cached.reason); else markSafe(el);
      scannedCount++;
      return;
    }

    // Check cloud cache (loaded at init) before doing any ML
    if (cloudCache[src]) {
      const cached = cloudCache[src];
      urlCache.set(src, cached);
      scannedCount++;
      if (cached.containsWomen) markBlocked(el, "cloud"); else markSafe(el);
      return;
    }

    // Check shared server cache (populated by batch lookup)
    if (serverCache[src]) {
      const sv = serverCache[src];
      const totalVotes = (sv.voteBlock || 0) + (sv.voteSafe || 0);
      // Trust server result if it has at least 2 votes
      if (totalVotes >= 2) {
        const result = { containsWomen: sv.containsWomen, reason: "server" };
        urlCache.set(src, result);
        scannedCount++;
        if (result.containsWomen) markBlocked(el, "server"); else markSafe(el);
        return;
      }
    }

    await modelsReadyPromise;
    if (!modelsLoaded) { markBlocked(el); scannedCount++; return; }

    const canvas = await getDetectionCanvas(el, src);
    if (!canvas) { markBlocked(el); scannedCount++; return; }

    try {
      const localResult = await runDetection(canvas, src);

      // Apply local result immediately (don't wait for cloud)
      urlCache.set(src, localResult);
      scannedCount++;
      if (localResult.containsWomen) markBlocked(el, localResult.reason); else markSafe(el);

      // Submit classification to shared server (non-blocking)
      serverSubmitClassification(src, localResult.containsWomen, localResult.reason || "local", 0.8);

      // Fire off cloud classification in the background (non-blocking)
      // Cloud result will update cache and learning system for future images
      if (hasApiKey && cloudMode !== "never") {
        requestCloudClassify(src, canvas, localResult).then(cloudResult => {
          if (!cloudResult || cloudResult.source === "cloud-cache") return;

          // Update local caches with cloud result
          const containsWomen = cloudResult.containsWomen;
          cloudCache[src] = { containsWomen, timestamp: Date.now() };
          urlCache.set(src, { ...localResult, containsWomen, cloudOverride: true });

          // Submit Haiku result to shared server (higher confidence than local)
          serverSubmitClassification(src, containsWomen, "haiku", cloudResult.confidence || 0.95);

          // If cloud disagrees with local, update the element
          if (containsWomen !== localResult.containsWomen) {
            if (containsWomen) {
              // Cloud says block, local said safe → hide it
              el.classList.remove("shmirat-eynaim-safe");
              markBlocked(el, "cloud");
            } else {
              // Cloud says safe, local said block → show it
              el.classList.remove("shmirat-eynaim-blocked");
              markSafe(el);
              hiddenCount--; // Undo the hidden count increment
            }
          }
        }).catch(() => {});
      }
    } catch (err) {
      console.error("[SE] Detection error:", err.message, "src:", src.substring(0, 60));
      markBlocked(el, "error");
      scannedCount++;
    }
  }

  // --- Process image elements ---

  function processImage(el) {
    if (shouldSkip(el)) { markSafe(el); return; }
    if (el.tagName === "IMG" && !el.complete) {
      el.addEventListener("load", () => handleLoadedImage(el), { once: true });
      el.addEventListener("error", () => { markBlocked(el); scannedCount++; }, { once: true });
      return;
    }
    handleLoadedImage(el);
  }

  function handleLoadedImage(el) {
    if (el.tagName === "IMG" && el.complete && el.naturalWidth === 0) {
      markBlocked(el); scannedCount++; return;
    }
    if (isTooSmall(el)) { markSafe(el); return; }
    enqueue(() => analyzeElement(el));
  }

  // --- Discover images ---

  function discoverImages(root) {
    if (!root || !root.querySelectorAll) return;

    // Collect URLs for server batch lookup
    const newUrls = [];
    const pendingElements = [];

    for (const img of root.querySelectorAll("img")) {
      if (markPending(img)) {
        pendingElements.push(img);
        const src = getImageSrc(img);
        if (src && !urlCache.has(src) && !cloudCache[src] && !serverCache[src]) newUrls.push(src);
      }
    }
    for (const el of root.querySelectorAll("*")) {
      if (el.tagName === "IMG") continue;
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== "none" && bg.includes("url(")) {
        if (markPending(el)) {
          pendingElements.push(el);
          const src = getImageSrc(el);
          if (src && !urlCache.has(src) && !cloudCache[src] && !serverCache[src]) newUrls.push(src);
        }
      }
    }
    for (const video of root.querySelectorAll("video[poster]")) {
      if (markPending(video)) {
        pendingElements.push(video);
        const src = getImageSrc(video);
        if (src && !urlCache.has(src) && !cloudCache[src] && !serverCache[src]) newUrls.push(src);
      }
    }

    // Process images immediately — don't wait for server
    for (const el of pendingElements) processImage(el);

    // Fire server batch lookup in background for future cache hits
    if (serverEnabled && newUrls.length > 0) {
      serverBatchLookup(newUrls).catch(() => {});
    }
  }

  // --- MutationObserver ---

  let mutationBatch = [];
  let mutationTimer = null;

  function flushMutationBatch() {
    const batch = mutationBatch;
    mutationBatch = [];
    mutationTimer = null;
    for (const el of batch) discoverImages(el);
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) mutationBatch.push(node);
      }
      if (mutation.type === "attributes" && mutation.target.nodeType === Node.ELEMENT_NODE) {
        const el = mutation.target;
        el.classList.remove("shmirat-eynaim-safe", "shmirat-eynaim-blocked");
        if (markPending(el)) processImage(el);
      }
    }
    if (!mutationTimer && mutationBatch.length > 0) {
      mutationTimer = setTimeout(flushMutationBatch, 200);
    }
  });

  observer.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ["src", "srcset", "data-src", "style", "data-original", "data-lazy"],
  });

  // --- Find images by URL ---

  function findImagesByUrl(url) {
    const results = [];
    document.querySelectorAll("img").forEach(img => {
      if (img.src === url || img.currentSrc === url) results.push(img);
    });
    document.querySelectorAll("*").forEach(el => {
      if (el.tagName === "IMG") return;
      if (el.tagName === "VIDEO" && el.getAttribute("poster") === url) { results.push(el); return; }
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== "none") {
        const match = bg.match(/url\(["']?(.+?)["']?\)/);
        if (match && match[1] === url) results.push(el);
      }
    });
    return results;
  }

  // --- Visual feedback ---

  function feedbackThenBlock(el) {
    el.classList.remove("shmirat-eynaim-safe", "shmirat-eynaim-pending");
    el.classList.add("shmirat-eynaim-feedback-block");
    setTimeout(() => { el.classList.remove("shmirat-eynaim-feedback-block"); markBlocked(el); }, 300);
  }

  function feedbackThenSafe(el) {
    el.classList.remove("shmirat-eynaim-blocked", "shmirat-eynaim-pending");
    el.classList.add("shmirat-eynaim-feedback-safe");
    if (el.tagName !== "IMG" && el.tagName !== "VIDEO") el.style.removeProperty("background-image");
    setTimeout(() => { el.classList.remove("shmirat-eynaim-feedback-safe"); markSafe(el); }, 300);
  }

  // --- Learning actions: block/safe + extract descriptors ---

  async function blockAndLearn(url) {
    const elements = findImagesByUrl(url);
    urlCache.set(url, { containsWomen: true, manualBlock: true });
    manualBlocklist.add(url);
    elements.forEach(el => feedbackThenBlock(el));

    // Extract descriptors and send to background for learning
    await modelsReadyPromise;
    if (modelsLoaded) {
      const canvas = await getDetectionCanvas(elements[0] || null, url);
      if (canvas) {
        const descriptors = await extractDescriptors(canvas);
        if (descriptors.length > 0) {
          browser.runtime.sendMessage({ type: "learnBlock", url, descriptors }).catch(() => {});
          serverSubmitDescriptors(descriptors, "block", 1.0);
        }
      }
    }
    // Also submit to shared server
    serverSubmitClassification(url, true, "user", 1.0);
  }

  async function safeAndLearn(url) {
    const elements = findImagesByUrl(url);
    urlCache.set(url, { containsWomen: false, manualSafe: true });
    manualSafelist.add(url);
    elements.forEach(el => feedbackThenSafe(el));

    await modelsReadyPromise;
    if (modelsLoaded) {
      const canvas = await getDetectionCanvas(elements[0] || null, url);
      if (canvas) {
        const descriptors = await extractDescriptors(canvas);
        if (descriptors.length > 0) {
          browser.runtime.sendMessage({ type: "learnSafe", url, descriptors }).catch(() => {});
          serverSubmitDescriptors(descriptors, "safe", 1.0);
        }
      }
    }
    // Also submit to shared server
    serverSubmitClassification(url, false, "user", 1.0);
  }

  // --- Listen for messages ---

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === "getStats") {
      return Promise.resolve({
        scanned: scannedCount, hidden: hiddenCount,
        hiddenFace: hiddenFaceCount, hiddenBody: hiddenBodyCount,
        backend: mlBackend, modelsLoaded,
        personDetectorLoaded: personDetector !== null,
      });
    }
    if (msg.type === "blockAndLearn" && msg.url) {
      blockAndLearn(msg.url);
    }
    if (msg.type === "safeAndLearn" && msg.url) {
      safeAndLearn(msg.url);
    }
    // Legacy compat
    if (msg.type === "hideImage" && msg.url) {
      blockAndLearn(msg.url);
    }
    if (msg.type === "showImage" && msg.url) {
      safeAndLearn(msg.url);
    }
  });

  // --- Context menu: detect nearest image under cursor ---
  // Needed for elements that aren't native <img> (e.g. YouTube thumbnails
  // wrapped in <a>, <div>, or custom elements like <yt-image>).

  function findNearestImageSrc(el) {
    // Walk up from the right-clicked element, checking the element itself
    // and its descendants for an image source.
    let node = el;
    for (let depth = 0; node && depth < 8; node = node.parentElement, depth++) {
      // Check if node itself is an image
      if (node.tagName === "IMG" && (node.src || node.currentSrc)) {
        return node.currentSrc || node.src;
      }
      // Check for a background image on this node
      const bg = getComputedStyle(node).backgroundImage;
      if (bg && bg !== "none" && bg.includes("url(")) {
        const match = bg.match(/url\(["']?(.+?)["']?\)/);
        if (match) return match[1];
      }
      // Check child <img> elements (e.g. <a> wrapping a <yt-image> wrapping an <img>)
      const childImg = node.querySelector("img[src]");
      if (childImg && (childImg.src || childImg.currentSrc)) {
        return childImg.currentSrc || childImg.src;
      }
      // Check for video poster
      const childVideo = node.querySelector("video[poster]");
      if (childVideo) return childVideo.poster;
    }
    return null;
  }

  document.addEventListener("contextmenu", (e) => {
    const src = findNearestImageSrc(e.target);
    if (src) {
      browser.runtime.sendMessage({ type: "contextMenuImage", url: src }).catch(() => {});
    }
  }, true);

  // --- Initial sweep ---

  function initialScan() {
    discoverImages(document.body);
    // Remove the blanket JS hide (img { opacity: 0 }).
    // The CSS hide (content-early.css) stays active — it only targets images
    // without .pending/.safe/.blocked classes, so it catches dynamically added
    // images until the MutationObserver processes them.
    const earlyHide = document.getElementById("shmirat-eynaim-early-hide");
    if (earlyHide) earlyHide.remove();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialScan);
  } else {
    initialScan();
  }
  window.addEventListener("load", () => discoverImages(document.body));
})();
