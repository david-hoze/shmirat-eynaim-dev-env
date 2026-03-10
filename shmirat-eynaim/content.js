// content.js — Thin DOM layer: discovers images, sends them to background for
// classification, and applies the results (hide/show). No ML code runs here.

(async () => {
  // Ask background for blocking state
  let state;
  try {
    state = await browser.runtime.sendMessage({ type: "getBlockingState" });
  } catch {
    state = { blockingEnabled: true, whitelisted: false, manualBlocklist: [], manualSafelist: [] };
  }

  if (!state.blockingEnabled || state.whitelisted) {
    const earlyHide = document.getElementById("shmirat-eynaim-early-hide");
    if (earlyHide) earlyHide.remove();
    return; // Extension off or site whitelisted
  }

  // Manual blocklist/safelist
  const manualBlocklist = new Set(state.manualBlocklist || []);
  const manualSafelist = new Set(state.manualSafelist || []);

  // --- Stats tracking ---
  let scannedCount = 0;
  let hiddenCount = 0;
  let hiddenFaceCount = 0;
  let hiddenBodyCount = 0;

  // --- Cache ---
  const urlCache = new Map();

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
    // Skip SVGs that are true icons/graphics, but NOT SVGs used as ad containers.
    // Ad SVGs (e.g. Google Ads) contain <image> elements with bitmap hrefs.
    if (el.tagName === "SVG") {
      const imgChild = el.querySelector("image[href], image[xlink\\:href]");
      if (imgChild) return false; // Ad container — don't skip
      return true; // Regular SVG icon — skip
    }
    if (src.endsWith(".svg") || src.startsWith("data:image/svg")) return true;
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
    // SVG ad containers: extract href from <image> child
    if (el.tagName === "svg" || el.tagName === "SVG") {
      const imgChild = el.querySelector("image[href], image[xlink\\:href]");
      if (imgChild) return imgChild.getAttribute("href") || imgChild.getAttributeNS("http://www.w3.org/1999/xlink", "href") || "";
    }
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg !== "none") {
      const match = bg.match(/url\(["']?(.+?)["']?\)/);
      if (match) return match[1];
    }
    return "";
  }

  // --- Canvas helpers (for getting image data to send to background) ---

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

  // Get a dataURL for the image, trying multiple approaches for CORS
  async function getImageDataUrl(el, src) {
    // Same-origin: draw directly
    if (el.tagName === "IMG" && el.complete && el.naturalWidth > 0) {
      try {
        const canvas = imageToCanvas(el);
        canvas.getContext("2d").getImageData(0, 0, 1, 1); // taint check
        return canvas.toDataURL("image/jpeg", 0.8);
      } catch { /* tainted */ }
    }
    // crossOrigin="anonymous"
    try {
      const img = await loadImage(src, true);
      const canvas = imageToCanvas(img);
      canvas.getContext("2d").getImageData(0, 0, 1, 1);
      return canvas.toDataURL("image/jpeg", 0.8);
    } catch { /* no CORS headers */ }
    // Background CORS proxy
    try {
      const dataUrl = await browser.runtime.sendMessage({ type: "fetchImage", url: src });
      if (dataUrl) return dataUrl;
    } catch { /* proxy failed */ }
    return null;
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

  // Batch DOM updates to avoid per-image repaints
  let pendingUpdates = [];
  let rafScheduled = false;

  function flushUpdates() {
    rafScheduled = false;
    const batch = pendingUpdates;
    pendingUpdates = [];
    for (const { el, action, reason } of batch) {
      if (action === "safe") {
        el.classList.remove("shmirat-eynaim-pending");
        el.classList.add("shmirat-eynaim-safe");
      } else {
        el.classList.remove("shmirat-eynaim-pending");
        el.classList.add("shmirat-eynaim-blocked");
        if (el.tagName !== "IMG" && el.tagName !== "VIDEO") {
          el.style.setProperty("background-image", "none", "important");
        }
        hiddenCount++;
        if (reason === "person-no-face") hiddenBodyCount++;
        else if (reason === "face") hiddenFaceCount++;
      }
    }
  }

  function scheduleUpdate(el, action, reason) {
    pendingUpdates.push({ el, action, reason });
    if (!rafScheduled) {
      rafScheduled = true;
      requestAnimationFrame(flushUpdates);
    }
  }

  function markSafe(el) {
    scheduleUpdate(el, "safe");
  }

  function markBlocked(el, reason) {
    scheduleUpdate(el, "block", reason);
  }

  // --- Server prefetch tracking ---
  // discoverImages fires a prefetch for all URLs; analyzeElement waits for it
  // so cache is populated before checking.
  let activePrefetch = Promise.resolve();

  // --- Analyze a single image element ---

  // Overall timeout for the entire analysis (background may be blocked by WASM ML).
  // If any sendMessage call hangs, this ensures the queue slot is freed.
  const ANALYZE_TIMEOUT = 45_000;

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

    // Wrap the async background calls in an overall timeout.
    // When the background page is busy with WASM ML, sendMessage calls hang
    // indefinitely. This prevents queue starvation.
    let timeoutId;
    try {
      await Promise.race([
        analyzeElementAsync(el, src),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("analyze_timeout")), ANALYZE_TIMEOUT);
        }),
      ]);
      clearTimeout(timeoutId);
    } catch (err) {
      clearTimeout(timeoutId);
      // Only apply timeout block if not already resolved by analyzeElementAsync
      if (!el.classList.contains("shmirat-eynaim-safe") && !el.classList.contains("shmirat-eynaim-blocked")) {
        console.warn("[SE] Analyze timeout:", src.substring(0, 60));
        markBlocked(el, "timeout");
        scannedCount++;
      }
    }
  }

  async function analyzeElementAsync(el, src) {
    // Wait for any active server prefetch to complete first
    await activePrefetch;

    // Phase 1: Check background caches (cheap — no pixel data sent)
    try {
      const cached = await browser.runtime.sendMessage({ type: "checkCache", url: src });
      if (cached && cached.hit) {
        urlCache.set(src, cached);
        scannedCount++;
        if (cached.containsWomen) markBlocked(el, cached.reason); else markSafe(el);
        return;
      }
    } catch { /* background unavailable */ }

    // Phase 2: Cache miss — serialize image and send for full classification
    const imageDataUrl = await getImageDataUrl(el, src);
    if (!imageDataUrl) { markBlocked(el); scannedCount++; return; }

    try {
      const result = await browser.runtime.sendMessage({
        type: "classifyImage",
        url: src,
        imageDataUrl,
      });

      urlCache.set(src, result);
      scannedCount++;
      if (result.containsWomen) markBlocked(el, result.reason); else markSafe(el);

      // Background continues the pipeline — later sources (server, Haiku)
      // notify us via classificationOverride messages if they disagree
    } catch (err) {
      console.error("[SE] Classification error:", err.message, "src:", src.substring(0, 60));
      markBlocked(el, "error");
      scannedCount++;
    }
  }

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

  // --- Process image elements ---

  function processImage(el) {
    if (shouldSkip(el)) { markSafe(el); return; }

    // Track current background-image URL so MutationObserver can detect swaps
    // (e.g. Taboola replaces placeholder data URI with real image URL)
    if (el.tagName !== "IMG" && el.tagName !== "VIDEO") {
      const bg = el.style.backgroundImage;
      if (bg && bg.includes("url(")) {
        const m = bg.match(/url\(["']?(.+?)["']?\)/);
        if (m) el.dataset.seLastBgUrl = m[1];
      }
    }

    // Fast-path: resolve from caches synchronously without entering the async queue
    const src = getImageSrc(el);
    if (src) {
      if (manualBlocklist.has(src)) { markBlocked(el); scannedCount++; return; }
      if (manualSafelist.has(src)) { markSafe(el); scannedCount++; return; }
      if (urlCache.has(src)) {
        const cached = urlCache.get(src);
        if (cached.containsWomen) markBlocked(el, cached.reason); else markSafe(el);
        scannedCount++;
        return;
      }
    }

    if (el.tagName === "IMG" && !el.complete) {
      // For lazy-loaded images hidden by our CSS, the browser may never trigger
      // the load event (opacity:0 → treated as offscreen → lazy load skipped).
      // Force eager loading so the image actually loads, then analyze it.
      if (el.loading === "lazy") {
        el.loading = "eager";
      }
      el.addEventListener("load", () => handleLoadedImage(el), { once: true });
      el.addEventListener("error", () => { markBlocked(el); scannedCount++; }, { once: true });
      // Fallback: if load/error never fires within 15s, analyze via background fetch
      setTimeout(() => {
        if (el.classList.contains("shmirat-eynaim-pending")) {
          console.log("[SE] Lazy image load timeout, using bg fetch:", (el.src || "").substring(0, 60));
          handleLoadedImage(el);
        }
      }, 15000);
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

    const pendingElements = [];

    for (const img of root.querySelectorAll("img")) {
      if (markPending(img)) pendingElements.push(img);
    }
    for (const el of root.querySelectorAll("[style*='background']")) {
      if (el.tagName === "IMG") continue;
      const bg = el.style.backgroundImage;
      if (bg && bg !== "none" && bg.includes("url(")) {
        if (markPending(el)) pendingElements.push(el);
      }
    }
    for (const video of root.querySelectorAll("video[poster]")) {
      if (markPending(video)) pendingElements.push(video);
    }
    // SVG ad containers (e.g. Google Ads) that embed bitmap images
    for (const svg of root.querySelectorAll("svg")) {
      if (svg.querySelector("image[href], image[xlink\\:href]")) {
        if (markPending(svg)) pendingElements.push(svg);
      }
    }

    // Prefetch: send all new URLs to background so it can batch-query the server
    // in one HTTP call. analyzeElement awaits activePrefetch before checking cache.
    const newUrls = [];
    for (const el of pendingElements) {
      const src = getImageSrc(el);
      if (src && !urlCache.has(src) && !manualBlocklist.has(src) && !manualSafelist.has(src)) {
        newUrls.push(src);
      }
    }
    if (newUrls.length > 0) {
      activePrefetch = browser.runtime.sendMessage({
        type: "prefetchServer", urls: newUrls,
      }).catch(() => {});
    }

    for (const el of pendingElements) processImage(el);
  }

  // --- MutationObserver ---

  let mutationBatch = [];
  let mutationTimer = null;

  function flushMutationBatch() {
    const batch = mutationBatch;
    mutationBatch = [];
    mutationTimer = null;
    // Discover images in all mutated nodes, collecting elements first
    const allPending = [];
    for (const el of batch) {
      if (!el || !el.querySelectorAll) continue;

      // Check the element itself (querySelectorAll only matches descendants)
      if (el.tagName === "IMG") {
        if (markPending(el)) allPending.push(el);
      } else if ((el.tagName === "svg" || el.tagName === "SVG") &&
                 el.querySelector("image[href], image[xlink\\:href]")) {
        if (markPending(el)) allPending.push(el);
      } else if (el.tagName === "VIDEO" && el.hasAttribute("poster")) {
        if (markPending(el)) allPending.push(el);
      } else if (el.tagName !== "IMG") {
        const bg = el.style.backgroundImage;
        if (bg && bg !== "none" && bg.includes("url(")) {
          if (markPending(el)) allPending.push(el);
        }
      }

      // Check descendants
      for (const img of el.querySelectorAll("img")) {
        if (markPending(img)) allPending.push(img);
      }
      for (const bgEl of el.querySelectorAll("[style*='background']")) {
        if (bgEl.tagName === "IMG") continue;
        const bg = bgEl.style.backgroundImage;
        if (bg && bg !== "none" && bg.includes("url(")) {
          if (markPending(bgEl)) allPending.push(bgEl);
        }
      }
      for (const video of el.querySelectorAll("video[poster]")) {
        if (markPending(video)) allPending.push(video);
      }
      for (const svg of el.querySelectorAll("svg")) {
        if (svg.querySelector("image[href], image[xlink\\:href]")) {
          if (markPending(svg)) allPending.push(svg);
        }
      }
    }
    if (allPending.length === 0) return;
    // Single prefetch for all mutation-discovered URLs
    const newUrls = [];
    for (const el of allPending) {
      const src = getImageSrc(el);
      if (src && !urlCache.has(src) && !manualBlocklist.has(src) && !manualSafelist.has(src)) {
        newUrls.push(src);
      }
    }
    if (newUrls.length > 0) {
      activePrefetch = browser.runtime.sendMessage({
        type: "prefetchServer", urls: newUrls,
      }).catch(() => {});
    }
    for (const el of allPending) processImage(el);
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) mutationBatch.push(node);
      }
      if (mutation.type === "attributes" && mutation.target.nodeType === Node.ELEMENT_NODE) {
        const el = mutation.target;
        if (mutation.attributeName === "style") {
          // Style change: check if background-image URL changed
          const bg = el.style.backgroundImage;
          if (bg && bg !== "none" && bg.includes("url(")) {
            // Extract new URL from background-image
            const urlMatch = bg.match(/url\(["']?(.+?)["']?\)/);
            const newUrl = urlMatch ? urlMatch[1] : "";
            const prevUrl = el.dataset.seLastBgUrl || "";
            // Re-analyze if URL changed (e.g. Taboola swaps placeholder → real image)
            if (newUrl && newUrl !== prevUrl) {
              el.dataset.seLastBgUrl = newUrl;
              el.classList.remove("shmirat-eynaim-safe", "shmirat-eynaim-blocked");
              if (markPending(el)) processImage(el);
            }
          }
        } else {
          el.classList.remove("shmirat-eynaim-safe", "shmirat-eynaim-blocked");
          if (markPending(el)) processImage(el);
        }
      }
    }
    if (!mutationTimer && mutationBatch.length > 0) {
      mutationTimer = setTimeout(flushMutationBatch, 200);
    }
  });

  observer.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ["src", "srcset", "data-src", "data-original", "data-lazy", "style"],
  });

  // --- Find images by URL ---

  function findImagesByUrl(url) {
    const results = [];
    document.querySelectorAll("img").forEach(img => {
      if (img.src === url || img.currentSrc === url) results.push(img);
    });
    document.querySelectorAll("[style*='background']").forEach(el => {
      if (el.tagName === "IMG") return;
      const bg = el.style.backgroundImage;
      if (bg && bg !== "none") {
        const match = bg.match(/url\(["']?(.+?)["']?\)/);
        if (match && match[1] === url) results.push(el);
      }
    });
    document.querySelectorAll("video[poster]").forEach(video => {
      if (video.getAttribute("poster") === url) results.push(video);
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

  // --- Learning actions: block/safe + send to background for descriptor extraction ---

  async function blockAndLearn(url) {
    const elements = findImagesByUrl(url);
    urlCache.set(url, { containsWomen: true, manualBlock: true });
    manualBlocklist.add(url);
    elements.forEach(el => feedbackThenBlock(el));

    // Get image dataURL and send to background for descriptor extraction + learning
    const el = elements[0];
    if (el) {
      const imageDataUrl = await getImageDataUrl(el, url);
      if (imageDataUrl) {
        try {
          const descriptors = await browser.runtime.sendMessage({
            type: "extractDescriptors",
            imageDataUrl,
          });
          if (descriptors && descriptors.length > 0) {
            browser.runtime.sendMessage({ type: "learnBlock", url, descriptors }).catch(() => {});
            // Server descriptor submission is handled by background
          }
        } catch { /* ignore */ }
      }
    }
    // Submit to shared server via background
    browser.runtime.sendMessage({
      type: "serverSubmitClassification",
      url, containsWomen: true, source: "user", confidence: 1.0,
    }).catch(() => {});
  }

  async function safeAndLearn(url) {
    const elements = findImagesByUrl(url);
    urlCache.set(url, { containsWomen: false, manualSafe: true });
    manualSafelist.add(url);
    elements.forEach(el => feedbackThenSafe(el));

    const el = elements[0];
    if (el) {
      const imageDataUrl = await getImageDataUrl(el, url);
      if (imageDataUrl) {
        try {
          const descriptors = await browser.runtime.sendMessage({
            type: "extractDescriptors",
            imageDataUrl,
          });
          if (descriptors && descriptors.length > 0) {
            browser.runtime.sendMessage({ type: "learnSafe", url, descriptors }).catch(() => {});
          }
        } catch { /* ignore */ }
      }
    }
    browser.runtime.sendMessage({
      type: "serverSubmitClassification",
      url, containsWomen: false, source: "user", confidence: 1.0,
    }).catch(() => {});
  }

  // --- Listen for messages ---

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === "getStats") {
      return Promise.resolve({
        scanned: scannedCount, hidden: hiddenCount,
        hiddenFace: hiddenFaceCount, hiddenBody: hiddenBodyCount,
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
    // Background notifies us that Haiku overrode a classification
    if (msg.type === "classificationOverride" && msg.url) {
      const { url, containsWomen, reason } = msg;
      // Never override user manual flags — they have absolute priority
      if (manualBlocklist.has(url) || manualSafelist.has(url)) return;
      urlCache.set(url, { containsWomen, reason });
      const elements = findImagesByUrl(url);
      for (const el of elements) {
        if (containsWomen) {
          el.classList.remove("shmirat-eynaim-safe");
          markBlocked(el, reason || "cloud");
        } else {
          el.classList.remove("shmirat-eynaim-blocked");
          if (el.tagName !== "IMG" && el.tagName !== "VIDEO") {
            el.style.removeProperty("background-image");
          }
          markSafe(el);
          hiddenCount--;
        }
      }
    }
  });

  // --- Context menu: detect nearest image under cursor ---

  function findNearestImageSrc(el) {
    let node = el;
    for (let depth = 0; node && depth < 8; node = node.parentElement, depth++) {
      if (node.tagName === "IMG" && (node.src || node.currentSrc)) {
        return node.currentSrc || node.src;
      }
      // SVG ad containers with <image> children
      if (node.tagName === "svg" || node.tagName === "SVG") {
        const imgChild = node.querySelector("image[href], image[xlink\\:href]");
        if (imgChild) {
          return imgChild.getAttribute("href") || imgChild.getAttributeNS("http://www.w3.org/1999/xlink", "href") || null;
        }
      }
      // SVG <image> element itself
      if (node.tagName === "image" || node.tagName === "IMAGE") {
        return node.getAttribute("href") || node.getAttributeNS("http://www.w3.org/1999/xlink", "href") || null;
      }
      const bg = getComputedStyle(node).backgroundImage;
      if (bg && bg !== "none" && bg.includes("url(")) {
        const match = bg.match(/url\(["']?(.+?)["']?\)/);
        if (match) return match[1];
      }
      const childImg = node.querySelector("img[src]");
      if (childImg && (childImg.src || childImg.currentSrc)) {
        return childImg.currentSrc || childImg.src;
      }
      const childVideo = node.querySelector("video[poster]");
      if (childVideo) return childVideo.poster;
      // Check for SVG ad container in children
      const childSvg = node.querySelector("svg image[href], svg image[xlink\\:href]");
      if (childSvg) {
        return childSvg.getAttribute("href") || childSvg.getAttributeNS("http://www.w3.org/1999/xlink", "href") || null;
      }
    }
    return null;
  }

  document.addEventListener("contextmenu", (e) => {
    const src = findNearestImageSrc(e.target);
    if (src) {
      browser.runtime.sendMessage({ type: "contextMenuImage", url: src }).catch(() => {});
    }
  }, true);

  // --- Debug relay: page world → content script → background ---
  // Allows Playwright's page.evaluate to communicate with background.js
  window.addEventListener("message", async (event) => {
    if (event.source !== window || !event.data || event.data.channel !== "se-debug") return;
    try {
      const result = await browser.runtime.sendMessage(event.data.payload);
      window.postMessage({ channel: "se-debug-reply", id: event.data.id, result }, "*");
    } catch (err) {
      window.postMessage({ channel: "se-debug-reply", id: event.data.id, error: err.message }, "*");
    }
  });

  // --- Initial sweep ---

  function initialScan() {
    discoverImages(document.body);
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
