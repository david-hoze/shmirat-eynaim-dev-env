// content.js — Image discovery, analysis orchestration, and hiding

(async () => {
  // Ask background script whether blocking is active for this page
  let state;
  try {
    state = await browser.runtime.sendMessage({ type: "getBlockingState" });
  } catch {
    state = { blockingEnabled: true, whitelisted: false };
  }

  if (!state.blockingEnabled || state.whitelisted) {
    return; // Extension off or site whitelisted
  }

  // --- Stats tracking ---
  let scannedCount = 0;
  let hiddenCount = 0;

  // --- Cache: URL/src → result ---
  const urlCache = new Map();

  // --- Processing queue with concurrency limit ---
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
      task().finally(() => {
        activeCount--;
        processQueue();
      });
    }
  }

  // --- Known icon/safe domains to skip ---
  const ICON_DOMAINS = [
    "fonts.googleapis.com",
    "fonts.gstatic.com",
    "cdnjs.cloudflare.com",
    "use.fontawesome.com",
    "ka-f.fontawesome.com",
  ];

  function isIconDomain(src) {
    try {
      const hostname = new URL(src).hostname;
      return ICON_DOMAINS.some((d) => hostname === d || hostname.endsWith("." + d));
    } catch {
      return false;
    }
  }

  // --- Check if element should be skipped ---

  function shouldSkip(el) {
    // Skip favicons
    if (el.tagName === "LINK" && el.rel && /icon/i.test(el.rel)) return true;

    const src = el.src || el.currentSrc || "";

    // Skip SVGs
    if (el.tagName === "SVG" || src.endsWith(".svg") || src.startsWith("data:image/svg")) {
      return true;
    }

    // Skip icon domains
    if (src && isIconDomain(src)) return true;

    return false;
  }

  // --- Get image source URL ---

  function getImageSrc(el) {
    if (el.tagName === "IMG" || el.tagName === "IMAGE") {
      return el.currentSrc || el.src || el.getAttribute("data-src") || el.getAttribute("data-lazy-src") || "";
    }
    if (el.tagName === "VIDEO") {
      return el.getAttribute("poster") || "";
    }
    // Background image
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg !== "none") {
      const match = bg.match(/url\(["']?(.+?)["']?\)/);
      if (match) return match[1];
    }
    return "";
  }

  // --- Convert image to data URL for analysis ---

  async function imageToDataUrl(el, src) {
    // For data: URIs, use directly
    if (src.startsWith("data:image/")) {
      return src;
    }

    // Try drawing to canvas with crossOrigin
    try {
      const dataUrl = await drawToCanvas(src, true);
      if (dataUrl) return dataUrl;
    } catch {
      // Fall through to CORS proxy
    }

    // Use background script CORS proxy
    try {
      const dataUrl = await browser.runtime.sendMessage({
        type: "fetchImage",
        url: src,
      });
      return dataUrl;
    } catch {
      return null;
    }
  }

  function drawToCanvas(src, useCrossOrigin) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (useCrossOrigin) img.crossOrigin = "anonymous";

      // Timeout after 5 seconds to prevent hanging
      const timer = setTimeout(() => {
        img.src = "";
        reject(new Error("timeout"));
      }, 5000);

      img.onload = () => {
        clearTimeout(timer);
        try {
          const maxDim = 512;
          let w = img.naturalWidth;
          let h = img.naturalHeight;
          if (w > maxDim || h > maxDim) {
            const scale = maxDim / Math.max(w, h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.8));
        } catch {
          reject(new Error("tainted canvas"));
        }
      };
      img.onerror = () => {
        clearTimeout(timer);
        reject(new Error("load failed"));
      };
      img.src = src;
    });
  }

  // --- Check natural dimensions (skip small images) ---

  function isTooSmall(el) {
    if (el.tagName === "IMG") {
      const w = el.naturalWidth || el.width;
      const h = el.naturalHeight || el.height;
      return w < 40 || h < 40;
    }
    // For background-image elements, check element size
    const rect = el.getBoundingClientRect();
    return rect.width < 40 || rect.height < 40;
  }

  // --- Mark image as pending (hidden) ---

  function markPending(el) {
    if (el.classList.contains("shmirat-eynaim-pending") ||
        el.classList.contains("shmirat-eynaim-safe") ||
        el.classList.contains("shmirat-eynaim-blocked")) {
      return false; // Already processed or processing
    }
    el.classList.add("shmirat-eynaim-pending");
    return true;
  }

  // --- Mark image as safe (show) ---

  function markSafe(el) {
    el.classList.remove("shmirat-eynaim-pending");
    el.classList.add("shmirat-eynaim-safe");
  }

  // --- Mark image as blocked (hide) ---

  function markBlocked(el) {
    el.classList.remove("shmirat-eynaim-pending");
    el.classList.add("shmirat-eynaim-blocked");

    // For background-image elements
    const src = getImageSrc(el);
    if (el.tagName !== "IMG" && el.tagName !== "VIDEO") {
      el.style.setProperty("background-image", "none", "important");
    }

    hiddenCount++;
  }

  // --- Analyze a single image element ---

  async function analyzeElement(el) {
    const src = getImageSrc(el);
    console.log("[SE] Analyzing:", src ? src.substring(0, 80) : "(no src)");
    if (!src) {
      markSafe(el);
      return;
    }

    // Check cache
    if (urlCache.has(src)) {
      const cached = urlCache.get(src);
      if (cached.containsWomen) {
        markBlocked(el);
      } else {
        markSafe(el);
      }
      scannedCount++;
      return;
    }

    // Convert to data URL
    console.log("[SE] Converting to data URL...");
    const dataUrl = await imageToDataUrl(el, src);
    console.log("[SE] Data URL result:", dataUrl ? "ok (" + dataUrl.length + " chars)" : "null");
    if (!dataUrl) {
      // Can't fetch image — show it rather than blocking
      markSafe(el);
      scannedCount++;
      return;
    }

    // Send to background for ML analysis
    try {
      console.log("[SE] Sending to background for analysis...");
      const result = await browser.runtime.sendMessage({
        type: "analyzeImage",
        imageDataUrl: dataUrl,
        originalUrl: src,
      });
      console.log("[SE] Analysis result:", result);

      urlCache.set(src, result);
      scannedCount++;

      if (result.containsWomen) {
        markBlocked(el);
      } else {
        markSafe(el);
      }
    } catch (err) {
      console.error("[SE] Analysis error:", err);
      // Analysis failed — show image rather than blocking
      markSafe(el);
      scannedCount++;
    }
  }

  // --- Process a discovered image element ---

  function processImage(el) {
    if (shouldSkip(el)) {
      // Safe to show — icons, SVGs, favicons
      el.classList.remove("shmirat-eynaim-pending");
      return;
    }

    // Wait for the image to load to check dimensions
    if (el.tagName === "IMG" && !el.complete) {
      el.addEventListener("load", () => handleLoadedImage(el), { once: true });
      el.addEventListener("error", () => {
        // Broken image — show it (browser will show broken icon anyway)
        markSafe(el);
        scannedCount++;
      }, { once: true });
      return;
    }

    handleLoadedImage(el);
  }

  function handleLoadedImage(el) {
    if (isTooSmall(el)) {
      markSafe(el);
      return;
    }

    enqueue(() => analyzeElement(el));
  }

  // --- Discover images on the page ---

  function discoverImages(root) {
    if (!root || !root.querySelectorAll) return;

    // Find all <img> elements
    const imgs = root.querySelectorAll("img");
    for (const img of imgs) {
      if (markPending(img)) {
        processImage(img);
      }
    }

    // Find elements with background-image
    const allEls = root.querySelectorAll("*");
    for (const el of allEls) {
      if (el.tagName === "IMG") continue; // Already handled
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== "none" && bg.includes("url(")) {
        if (markPending(el)) {
          processImage(el);
        }
      }
    }

    // Find video posters
    const videos = root.querySelectorAll("video[poster]");
    for (const video of videos) {
      if (markPending(video)) {
        processImage(video);
      }
    }
  }

  // --- IntersectionObserver for viewport priority ---
  // Elements in viewport get processed first (already enqueued),
  // but we use IO to bump priority for visible ones

  const viewportObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const el = entry.target;
        if (el.classList.contains("shmirat-eynaim-pending")) {
          // Already queued — this just confirms it's visible
          viewportObserver.unobserve(el);
        }
      }
    }
  }, { threshold: 0.1 });

  // --- MutationObserver for dynamic content ---

  let mutationBatch = [];
  let mutationTimer = null;

  function flushMutationBatch() {
    const batch = mutationBatch;
    mutationBatch = [];
    mutationTimer = null;

    for (const el of batch) {
      discoverImages(el);
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          mutationBatch.push(node);
        }
      }
      // Attribute changes (src changed on existing img)
      if (mutation.type === "attributes" && mutation.target.nodeType === Node.ELEMENT_NODE) {
        const el = mutation.target;
        // Reset state so it gets re-analyzed
        el.classList.remove("shmirat-eynaim-safe", "shmirat-eynaim-blocked");
        if (markPending(el)) {
          processImage(el);
        }
      }
    }

    // Debounce: batch mutations every 200ms
    if (!mutationTimer && mutationBatch.length > 0) {
      mutationTimer = setTimeout(flushMutationBatch, 200);
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "srcset", "data-src", "style", "data-original", "data-lazy"],
  });

  // --- Find all image elements matching a URL ---

  function findImagesByUrl(url) {
    const results = [];
    document.querySelectorAll("img").forEach(img => {
      if (img.src === url || img.currentSrc === url) results.push(img);
    });
    // Also check background-image elements and video posters
    document.querySelectorAll("*").forEach(el => {
      if (el.tagName === "IMG") return; // Already handled above
      if (el.tagName === "VIDEO" && el.getAttribute("poster") === url) {
        results.push(el);
        return;
      }
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== "none") {
        const match = bg.match(/url\(["']?(.+?)["']?\)/);
        if (match && match[1] === url) results.push(el);
      }
    });
    return results;
  }

  // --- Visual feedback helpers for manual block/safe actions ---

  function feedbackThenBlock(el) {
    el.classList.remove("shmirat-eynaim-safe", "shmirat-eynaim-pending");
    el.classList.add("shmirat-eynaim-feedback-block");
    setTimeout(() => {
      el.classList.remove("shmirat-eynaim-feedback-block");
      markBlocked(el);
    }, 300);
  }

  function feedbackThenSafe(el) {
    el.classList.remove("shmirat-eynaim-blocked", "shmirat-eynaim-pending");
    el.classList.add("shmirat-eynaim-feedback-safe");
    // Restore background-image if it was removed by markBlocked
    if (el.tagName !== "IMG" && el.tagName !== "VIDEO") {
      el.style.removeProperty("background-image");
    }
    setTimeout(() => {
      el.classList.remove("shmirat-eynaim-feedback-safe");
      markSafe(el);
    }, 300);
  }

  // --- Listen for messages from popup and background ---

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === "getStats") {
      return Promise.resolve({ scanned: scannedCount, hidden: hiddenCount });
    }

    if (msg.type === "hideImage" && msg.url) {
      const elements = findImagesByUrl(msg.url);
      // Update cache so future discoveries also block this URL
      urlCache.set(msg.url, { containsWomen: true, manualBlock: true });
      elements.forEach(el => feedbackThenBlock(el));
    }

    if (msg.type === "showImage" && msg.url) {
      const elements = findImagesByUrl(msg.url);
      // Update cache so future discoveries also safe-list this URL
      urlCache.set(msg.url, { containsWomen: false, manualSafe: true });
      elements.forEach(el => feedbackThenSafe(el));
    }
  });

  // --- Initial sweep ---

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => discoverImages(document.body));
  } else {
    discoverImages(document.body);
  }

  // Second sweep after full load
  window.addEventListener("load", () => {
    discoverImages(document.body);
  });
})();
