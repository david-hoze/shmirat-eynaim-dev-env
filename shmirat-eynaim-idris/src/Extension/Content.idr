-- Extension.Content — Content script: discovery + processing pipeline (self-contained)
--
-- Compile: idris2 --source-dir src --cg javascript --directive pretty -o content-idris.js Extension/Content.idr
--
-- This module is fully self-contained — no external content-pipeline.js needed.
-- All processing logic (shouldSkip, getImageDataUrl, analyzeElement, queue,
-- markSafe/markBlocked, message handlers, context menu, debug relay) is
-- embedded via %foreign lambdas and stored on window.__se.
--
-- Idris drives image DISCOVERY (type-safe) and the JS processing logic
-- lives in the same source file as %foreign declarations.

module Extension.Content

import FFI.Core
import FFI.Browser.Runtime
import FFI.DOM.Element
import FFI.DOM.Document
import FFI.DOM.Observer
import FFI.DOM.Style
import Data.Maybe
import Data.String
import Extension.Types
import Extension.Properties

---------------------------------------------------------------------------
-- Content processing pipeline (replaces content-pipeline.js)
--
-- Initializes all state, helper functions, analysis pipeline, queue,
-- message listeners, context menu, and debug relay on window.__se.
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w) => { var se = {}; var state = {blockingEnabled:true,whitelisted:false,manualBlocklist:[],manualSafelist:[]}; se.manualBlocklist = new Set(); se.manualSafelist = new Set(); se.scannedCount = 0; se.hiddenCount = 0; se.hiddenFaceCount = 0; se.hiddenBodyCount = 0; se.urlCache = new Map(); se.pendingUpdates = []; se.rafScheduled = false; se.activeCount = 0; se.queue = []; se.activePrefetch = Promise.resolve(); var ICON_DOMAINS = ['fonts.googleapis.com','fonts.gstatic.com','cdnjs.cloudflare.com','use.fontawesome.com','ka-f.fontawesome.com']; var MAX_CONCURRENT = 3; var ANALYZE_TIMEOUT = 45000; function isIconDomain(src) { try { var h = new URL(src).hostname; return ICON_DOMAINS.some(function(d) { return h === d || h.endsWith('.' + d); }); } catch(e) { return false; } } se.shouldSkip = function(el) { if (el.tagName === 'LINK' && el.rel && /icon/i.test(el.rel)) return true; if (el.tagName === 'svg' || el.tagName === 'SVG') return false; var src = el.src || el.currentSrc || ''; if (src.endsWith('.svg')) return true; if (src.startsWith('data:image/') && src.length < 5000) return true; if (src && isIconDomain(src)) return true; if (el.tagName === 'IMG') { var ew = el.naturalWidth || parseInt(el.getAttribute('width'),10) || 0; var eh = el.naturalHeight || parseInt(el.getAttribute('height'),10) || 0; if (ew > 0 && eh > 0 && (ew < 40 || eh < 40)) return true; } return false; }; se.getImageSrc = function(el) { if (el.tagName === 'IMG' || el.tagName === 'IMAGE') return el.currentSrc || el.src || el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || ''; if (el.tagName === 'VIDEO') return el.getAttribute('poster') || ''; if (el.tagName === 'svg' || el.tagName === 'SVG') { var imgChild = el.querySelector('image[href], image[xlink\\\\:href]'); if (imgChild) return imgChild.getAttribute('href') || imgChild.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || ''; try { var svgData = new XMLSerializer().serializeToString(el); return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData))); } catch(e) { return ''; } } var inlineBg = el.style.backgroundImage; if (inlineBg && inlineBg !== 'none' && inlineBg.includes('url(')) { var m = inlineBg.match(/url\\(['\"]?(.+?)['\"]?\\)/); if (m) return m[1]; } var bg = getComputedStyle(el).backgroundImage; if (bg && bg !== 'none') { var m2 = bg.match(/url\\(['\"]?(.+?)['\"]?\\)/); if (m2) return m2[1]; } return ''; }; function imageToCanvas(img, maxDim) { maxDim = maxDim || 416; var iw = img.naturalWidth || img.width; var ih = img.naturalHeight || img.height; if (iw > maxDim || ih > maxDim) { var scale = maxDim / Math.max(iw, ih); iw = Math.round(iw * scale); ih = Math.round(ih * scale); } var canvas = document.createElement('canvas'); canvas.width = iw; canvas.height = ih; canvas.getContext('2d').drawImage(img, 0, 0, iw, ih); return canvas; } function loadImage(src, crossOrigin) { return new Promise(function(resolve, reject) { var img = new Image(); if (crossOrigin) img.crossOrigin = 'anonymous'; var timer = setTimeout(function() { img.src = ''; reject(new Error('timeout')); }, 10000); img.onload = function() { clearTimeout(timer); resolve(img); }; img.onerror = function() { clearTimeout(timer); reject(new Error('load failed')); }; img.src = src; }); } function svgToDataUrl(svgEl) { return (async function() { try { var rect = svgEl.getBoundingClientRect(); var sw = rect.width || 416; var sh = rect.height || 416; var maxDim = 416; if (sw > maxDim || sh > maxDim) { var scale = maxDim / Math.max(sw, sh); sw = Math.round(sw * scale); sh = Math.round(sh * scale); } var svgData = new XMLSerializer().serializeToString(svgEl); var svgBlob = new Blob([svgData], {type:'image/svg+xml;charset=utf-8'}); var url = URL.createObjectURL(svgBlob); try { var img = await loadImage(url, false); var canvas = document.createElement('canvas'); canvas.width = sw; canvas.height = sh; canvas.getContext('2d').drawImage(img, 0, 0, sw, sh); return canvas.toDataURL('image/jpeg', 0.8); } finally { URL.revokeObjectURL(url); } } catch(e) { return null; } })(); } function getImageDataUrl(el, src) { return (async function() { var ss = src.substring(0, 60); if (el.tagName === 'svg' || el.tagName === 'SVG') return svgToDataUrl(el); if (el.tagName === 'IMG' && el.complete && el.naturalWidth > 0) { try { var canvas = imageToCanvas(el); canvas.getContext('2d').getImageData(0, 0, 1, 1); console.log('[SE] getDataUrl canvas OK:', ss); return canvas.toDataURL('image/jpeg', 0.8); } catch(e) { console.log('[SE] getDataUrl canvas FAIL:', ss, e.message); } } if (src && src.startsWith('data:image/svg+xml')) { try { var img = await loadImage(src, false); var canvas = imageToCanvas(img); return canvas.toDataURL('image/jpeg', 0.8); } catch(e) {} } try { var img = await loadImage(src, true); var canvas = imageToCanvas(img); canvas.getContext('2d').getImageData(0, 0, 1, 1); console.log('[SE] getDataUrl crossOrigin OK:', ss); return canvas.toDataURL('image/jpeg', 0.8); } catch(e) { console.log('[SE] getDataUrl crossOrigin FAIL:', ss, e.message); } try { var dataUrl = await browser.runtime.sendMessage({type:'fetchImage', url:src}); if (dataUrl) { console.log('[SE] getDataUrl bgFetch OK:', ss, 'len=' + dataUrl.length); return dataUrl; } else { console.log('[SE] getDataUrl bgFetch NULL:', ss); } } catch(e) { console.log('[SE] getDataUrl bgFetch ERR:', ss, e.message); } console.warn('[SE] getDataUrl ALL FAILED:', ss); return null; })(); } function isTooSmall(el) { if (el.tagName === 'IMG') { var tw = el.naturalWidth || el.width; var th = el.naturalHeight || el.height; return tw < 40 || th < 40; } var rect = el.getBoundingClientRect(); return rect.width < 40 || rect.height < 40; } function flushUpdates() { se.rafScheduled = false; var batch = se.pendingUpdates; se.pendingUpdates = []; for (var i = 0; i < batch.length; i++) { var u = batch[i]; if (u.action === 'safe') { u.el.classList.remove('shmirat-eynaim-pending'); u.el.classList.add('shmirat-eynaim-safe'); } else { u.el.classList.remove('shmirat-eynaim-pending'); u.el.classList.add('shmirat-eynaim-blocked'); if (u.el.tagName !== 'IMG' && u.el.tagName !== 'VIDEO') u.el.style.setProperty('background-image', 'none', 'important'); se.hiddenCount++; if (u.reason === 'person-no-face') se.hiddenBodyCount++; else if (u.reason === 'face') se.hiddenFaceCount++; } } } function scheduleUpdate(el, action, reason) { se.pendingUpdates.push({el:el, action:action, reason:reason}); if (!se.rafScheduled) { se.rafScheduled = true; requestAnimationFrame(flushUpdates); } } function markSafe(el) { scheduleUpdate(el, 'safe'); } function markBlocked(el, reason) { scheduleUpdate(el, 'block', reason); } function analyzeElement(el) { return (async function() { var src = se.getImageSrc(el); if (!src) { markSafe(el); return; } if (se.manualBlocklist.has(src)) { markBlocked(el); se.scannedCount++; return; } if (se.manualSafelist.has(src)) { markSafe(el); se.scannedCount++; return; } if (se.urlCache.has(src)) { var cached = se.urlCache.get(src); if (cached.containsWomen) markBlocked(el, cached.reason); else markSafe(el); se.scannedCount++; return; } var timeoutId; try { await Promise.race([analyzeElementAsync(el, src), new Promise(function(_, reject) { timeoutId = setTimeout(function() { reject(new Error('analyze_timeout')); }, ANALYZE_TIMEOUT); })]); clearTimeout(timeoutId); } catch(err) { clearTimeout(timeoutId); if (!el.classList.contains('shmirat-eynaim-safe') && !el.classList.contains('shmirat-eynaim-blocked')) { console.warn('[SE] Analyze timeout:', src.substring(0, 60)); markBlocked(el, 'timeout'); se.scannedCount++; } } })(); } function analyzeElementAsync(el, src) { return (async function() { await se.activePrefetch; try { var cached = await browser.runtime.sendMessage({type:'checkCache', url:src}); if (cached && cached.hit) { se.urlCache.set(src, cached); se.scannedCount++; if (cached.containsWomen) markBlocked(el, cached.reason); else markSafe(el); return; } } catch(e) {} var imageDataUrl = await getImageDataUrl(el, src); if (!imageDataUrl) { console.log('[SE] No dataUrl, marking blocked:', src.substring(0, 60)); markBlocked(el, 'no-data'); se.scannedCount++; return; } try { var result = await browser.runtime.sendMessage({type:'classifyImage', url:src, imageDataUrl:imageDataUrl}); se.urlCache.set(src, result); se.scannedCount++; console.log('[SE] Classify:', result.containsWomen ? 'BLOCK' : 'SAFE', result.reason || '', src.substring(0, 60)); if (result.containsWomen) markBlocked(el, result.reason); else markSafe(el); } catch(err) { console.error('[SE] Classification error:', err.message, 'src:', src.substring(0, 60)); markBlocked(el, 'classify-error'); se.scannedCount++; } })(); } function enqueue(task) { se.queue.push(task); processQueue(); } function processQueue() { while (se.activeCount < MAX_CONCURRENT && se.queue.length > 0) { var task = se.queue.shift(); se.activeCount++; task().finally(function() { se.activeCount--; processQueue(); }); } } function handleLoadedImage(el) { if (el.tagName === 'IMG' && el.complete && el.naturalWidth === 0) { markSafe(el); se.scannedCount++; return; } if (isTooSmall(el)) { markSafe(el); return; } enqueue(function() { return analyzeElement(el); }); } se.processImage = function(el) { if (se.shouldSkip(el)) { markSafe(el); return; } if (el.tagName !== 'IMG' && el.tagName !== 'VIDEO') { var bg = el.style.backgroundImage; if (bg && bg.includes('url(')) { var m = bg.match(/url\\(['\"]?(.+?)['\"]?\\)/); if (m) el.dataset.seLastBgUrl = m[1]; } } var src = se.getImageSrc(el); if (src) { if (se.manualBlocklist.has(src)) { markBlocked(el); se.scannedCount++; return; } if (se.manualSafelist.has(src)) { markSafe(el); se.scannedCount++; return; } if (se.urlCache.has(src)) { var cached = se.urlCache.get(src); if (cached.containsWomen) markBlocked(el, cached.reason); else markSafe(el); se.scannedCount++; return; } } if (el.tagName === 'IMG' && !el.complete) { if (el.loading === 'lazy') el.loading = 'eager'; el.addEventListener('load', function() { handleLoadedImage(el); }, {once:true}); el.addEventListener('error', function() { markSafe(el); se.scannedCount++; }, {once:true}); setTimeout(function() { if (el.classList.contains('shmirat-eynaim-pending')) { console.log('[SE] Lazy image load timeout:', (el.src || '').substring(0, 60)); handleLoadedImage(el); } }, 15000); return; } handleLoadedImage(el); }; se.handleAttributeMutation = function(el, attrName) { if (attrName === 'style') { var bg = el.style.backgroundImage; if (bg && bg !== 'none' && bg.includes('url(')) { var urlMatch = bg.match(/url\\(['\"]?(.+?)['\"]?\\)/); var newUrl = urlMatch ? urlMatch[1] : ''; var prevUrl = el.dataset.seLastBgUrl || ''; if (newUrl && newUrl !== prevUrl) { el.dataset.seLastBgUrl = newUrl; el.classList.remove('shmirat-eynaim-safe', 'shmirat-eynaim-blocked'); el.classList.add('shmirat-eynaim-pending'); se.processImage(el); } } } else { el.classList.remove('shmirat-eynaim-safe', 'shmirat-eynaim-blocked'); el.classList.add('shmirat-eynaim-pending'); se.processImage(el); } }; se.isUrlKnown = function(url) { return se.urlCache.has(url) || se.manualBlocklist.has(url) || se.manualSafelist.has(url); }; se.prefetchUrls = function(urls) { if (urls.length > 0) { se.activePrefetch = browser.runtime.sendMessage({type:'prefetchServer', urls:Array.from(urls)}).catch(function(){}); } }; function findImagesByUrl(url) { var results = []; document.querySelectorAll('img').forEach(function(img) { if (img.src === url || img.currentSrc === url) results.push(img); }); document.querySelectorAll('[style*=background]').forEach(function(el) { if (el.tagName === 'IMG') return; var bg = el.style.backgroundImage; if (bg && bg !== 'none') { var match = bg.match(/url\\(['\"]?(.+?)['\"]?\\)/); if (match && match[1] === url) results.push(el); } }); document.querySelectorAll('video[poster]').forEach(function(video) { if (video.getAttribute('poster') === url) results.push(video); }); return results; } function feedbackThenBlock(el) { el.classList.remove('shmirat-eynaim-safe', 'shmirat-eynaim-pending'); el.classList.add('shmirat-eynaim-feedback-block'); setTimeout(function() { el.classList.remove('shmirat-eynaim-feedback-block'); markBlocked(el); }, 300); } function feedbackThenSafe(el) { el.classList.remove('shmirat-eynaim-blocked', 'shmirat-eynaim-pending'); el.classList.add('shmirat-eynaim-feedback-safe'); if (el.tagName !== 'IMG' && el.tagName !== 'VIDEO') el.style.removeProperty('background-image'); setTimeout(function() { el.classList.remove('shmirat-eynaim-feedback-safe'); markSafe(el); }, 300); } function blockAndLearn(url) { return (async function() { var elements = findImagesByUrl(url); se.urlCache.set(url, {containsWomen:true, manualBlock:true}); se.manualBlocklist.add(url); elements.forEach(function(el) { feedbackThenBlock(el); }); var el = elements[0]; if (el) { var imageDataUrl = await getImageDataUrl(el, url); if (imageDataUrl) { try { var descriptors = await browser.runtime.sendMessage({type:'extractDescriptors', imageDataUrl:imageDataUrl}); if (descriptors && descriptors.length > 0) { browser.runtime.sendMessage({type:'learnBlock', url:url, descriptors:descriptors}).catch(function(){}); } } catch(e) {} } } browser.runtime.sendMessage({type:'serverSubmitClassification', url:url, containsWomen:true, source:'user', confidence:1.0}).catch(function(){}); })(); } function safeAndLearn(url) { return (async function() { var elements = findImagesByUrl(url); se.urlCache.set(url, {containsWomen:false, manualSafe:true}); se.manualSafelist.add(url); elements.forEach(function(el) { feedbackThenSafe(el); }); var el = elements[0]; if (el) { var imageDataUrl = await getImageDataUrl(el, url); if (imageDataUrl) { try { var descriptors = await browser.runtime.sendMessage({type:'extractDescriptors', imageDataUrl:imageDataUrl}); if (descriptors && descriptors.length > 0) { browser.runtime.sendMessage({type:'learnSafe', url:url, descriptors:descriptors}).catch(function(){}); } } catch(e) {} } } browser.runtime.sendMessage({type:'serverSubmitClassification', url:url, containsWomen:false, source:'user', confidence:1.0}).catch(function(){}); })(); } browser.runtime.onMessage.addListener(function(msg) { if (msg.type === 'getStats') { return Promise.resolve({scanned:se.scannedCount, hidden:se.hiddenCount, hiddenFace:se.hiddenFaceCount, hiddenBody:se.hiddenBodyCount}); } if (msg.type === 'blockAndLearn' && msg.url) blockAndLearn(msg.url); if (msg.type === 'safeAndLearn' && msg.url) safeAndLearn(msg.url); if (msg.type === 'hideImage' && msg.url) blockAndLearn(msg.url); if (msg.type === 'showImage' && msg.url) safeAndLearn(msg.url); if (msg.type === 'classificationOverride' && msg.url) { if (se.manualBlocklist.has(msg.url) || se.manualSafelist.has(msg.url)) return; se.urlCache.set(msg.url, {containsWomen:msg.containsWomen, reason:msg.reason}); var elements = findImagesByUrl(msg.url); for (var i = 0; i < elements.length; i++) { var oel = elements[i]; if (msg.containsWomen) { oel.classList.remove('shmirat-eynaim-safe'); markBlocked(oel, msg.reason || 'cloud'); } else { oel.classList.remove('shmirat-eynaim-blocked'); if (oel.tagName !== 'IMG' && oel.tagName !== 'VIDEO') oel.style.removeProperty('background-image'); markSafe(oel); se.hiddenCount--; } } } }); function findNearestImageSrc(el) { var node = el; for (var depth = 0; node && depth < 8; node = node.parentElement, depth++) { if (node.tagName === 'IMG' && (node.src || node.currentSrc)) return node.currentSrc || node.src; if (node.tagName === 'svg' || node.tagName === 'SVG') { var imgChild = node.querySelector('image[href], image[xlink\\\\:href]'); if (imgChild) return imgChild.getAttribute('href') || imgChild.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || null; } if (node.tagName === 'image' || node.tagName === 'IMAGE') return node.getAttribute('href') || node.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || null; var bg = getComputedStyle(node).backgroundImage; if (bg && bg !== 'none' && bg.includes('url(')) { var match = bg.match(/url\\(['\"]?(.+?)['\"]?\\)/); if (match) return match[1]; } var childImg = node.querySelector('img[src]'); if (childImg && (childImg.src || childImg.currentSrc)) return childImg.currentSrc || childImg.src; var childVideo = node.querySelector('video[poster]'); if (childVideo) return childVideo.poster; var childSvg = node.querySelector('svg image[href], svg image[xlink\\\\:href]'); if (childSvg) return childSvg.getAttribute('href') || childSvg.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || null; } return null; } document.addEventListener('contextmenu', function(e) { var src = findNearestImageSrc(e.target); if (src) browser.runtime.sendMessage({type:'contextMenuImage', url:src}).catch(function(){}); }, true); window.addEventListener('message', function(event) { if (event.source !== window || !event.data || event.data.channel !== 'se-debug') return; (async function() { try { var result = await browser.runtime.sendMessage(event.data.payload); window.postMessage({channel:'se-debug-reply', id:event.data.id, result:result}, '*'); } catch(err) { window.postMessage({channel:'se-debug-reply', id:event.data.id, error:err.message}, '*'); } })(); }); browser.runtime.sendMessage({type:'getBlockingState'}).then(function(s) { if (s) { state = s; se.manualBlocklist = new Set(s.manualBlocklist || []); se.manualSafelist = new Set(s.manualSafelist || []); if (!s.blockingEnabled || s.whitelisted) { var earlyHide = document.getElementById('shmirat-eynaim-early-hide'); if (earlyHide) earlyHide.remove(); window.__sePipelineDisabled = true; } } }).catch(function(){}); window.__se = se; }"
prim__initContentPipeline : PrimIO ()

---------------------------------------------------------------------------
-- Thin wrappers — Idris code calls these to access window.__se functions
---------------------------------------------------------------------------

%foreign "javascript:lambda:(el, w) => { if (window.__se) window.__se.processImage(el); }"
prim__processImage : RawElement -> PrimIO ()

%foreign "javascript:lambda:(urls, w) => { if (window.__se) window.__se.prefetchUrls(urls); }"
prim__prefetchUrls : JsArray JsValue -> PrimIO ()

%foreign "javascript:lambda:(el, w) => { if (window.__se) return window.__se.getImageSrc(el); return ''; }"
prim__pipelineGetSrc : RawElement -> PrimIO String

%foreign "javascript:lambda:(url, w) => { if (window.__se) return window.__se.isUrlKnown(url) ? 1 : 0; return 0; }"
prim__isUrlKnown : String -> PrimIO Int32

---------------------------------------------------------------------------
-- Element state checks
---------------------------------------------------------------------------

%foreign "javascript:lambda:(el, w) => (el.classList.contains('shmirat-eynaim-pending') || el.classList.contains('shmirat-eynaim-safe') || el.classList.contains('shmirat-eynaim-blocked')) ? 1 : 0"
prim__isProcessed : RawElement -> PrimIO Int32

||| Check if an element has already entered the pipeline.
isProcessed : HasIO io => RawElement -> io Bool
isProcessed el = do
  r <- primIO $ prim__isProcessed el
  pure (r == 1)

%foreign "javascript:lambda:(el, w) => { if (el.classList.contains('shmirat-eynaim-pending') || el.classList.contains('shmirat-eynaim-safe') || el.classList.contains('shmirat-eynaim-blocked')) return 0; el.classList.add('shmirat-eynaim-pending'); return 1; }"
prim__tryMarkPending : RawElement -> PrimIO Int32

||| Try to mark an element as pending. Returns True if newly marked,
||| False if already processed.
tryMarkPending : HasIO io => RawElement -> io Bool
tryMarkPending el = do
  r <- primIO $ prim__tryMarkPending el
  pure (r == 1)

---------------------------------------------------------------------------
-- Array iteration helper
---------------------------------------------------------------------------

||| Iterate over a JsArray, calling an IO action for each element.
forArray_ : HasIO io => JsArray a -> (a -> io ()) -> io ()
forArray_ arr f = do
  len <- arrayLength arr
  go 0 len
  where
    go : Int32 -> Int32 -> io ()
    go i len = if i >= len then pure ()
               else do
                 el <- arrayGet arr i
                 f el
                 go (i + 1) len

---------------------------------------------------------------------------
-- Image discovery — the core Idris-driven logic
--
-- This function determines WHICH elements should enter the analysis
-- pipeline. The key type-safe insight: SVG classification happens here,
-- using isSvgImage (which checks for <image> children OR large size).
--
-- Large SVGs like ad banners (viewBox="0 0 1200 628") are caught by
-- isSvgLarge, while small icon SVGs are skipped.
---------------------------------------------------------------------------

||| Discover all image-like elements in a subtree and feed them
||| to the processing pipeline.
export
discoverImages : HasIO io => RawElement -> io ()
discoverImages root = do
  pending <- newArray {a = RawElement}

  -- 1. <img> elements
  imgs <- querySelectorAll root "img"
  forArray_ imgs $ \img => do
    marked <- tryMarkPending img
    when marked $ ignore $ arrayPush pending img

  -- 2. Elements with background-image (skip <img> to avoid double-processing)
  bgEls <- querySelectorAll root "[style*='background']"
  forArray_ bgEls $ \el => do
    tag <- tagName el
    when (tag /= "IMG") $ do
      hasBg <- hasBgImage el
      when hasBg $ do
        marked <- tryMarkPending el
        when marked $ ignore $ arrayPush pending el

  -- 3. <video poster="...">
  videos <- querySelectorAll root "video[poster]"
  forArray_ videos $ \video => do
    marked <- tryMarkPending video
    when marked $ ignore $ arrayPush pending video

  -- 4. <svg> — THIS IS THE KEY TYPE-SAFE DECISION
  -- Uses isSvgImage which checks: hasImageChild OR isSvgLarge
  -- A 1200x628 ad SVG passes isSvgLarge -> gets processed
  -- A 16x16 icon SVG fails both checks -> gets skipped
  svgs <- querySelectorAll root "svg"
  forArray_ svgs $ \svg => do
    isImg <- isSvgImage svg
    when isImg $ do
      marked <- tryMarkPending svg
      when marked $ ignore $ arrayPush pending svg

  -- Prefetch URLs for server batch lookup
  urls <- newArray {a = JsValue}
  forArray_ pending $ \el => do
    src <- primIO $ prim__pipelineGetSrc el
    if src == ""
      then pure ()
      else do
        known <- primIO $ prim__isUrlKnown src
        when (known == 0) $ ignore $ arrayPush urls (believe_me src)

  urlLen <- arrayLength urls
  when (urlLen > 0) $ primIO $ prim__prefetchUrls urls

  -- Process each pending element
  forArray_ pending $ \el => primIO $ prim__processImage el

---------------------------------------------------------------------------
-- MutationObserver — batched discovery for dynamic content
---------------------------------------------------------------------------

-- Mutable batch buffer (JS-side for simplicity)
%foreign "javascript:lambda:(w) => { window.__seMutBatch = []; window.__seMutTimer = null; }"
prim__initMutBatch : PrimIO ()

%foreign "javascript:lambda:(el, w) => { window.__seMutBatch.push(el); }"
prim__pushMutBatch : RawElement -> PrimIO ()

%foreign "javascript:lambda:(w) => { var b = window.__seMutBatch; window.__seMutBatch = []; window.__seMutTimer = null; return b; }"
prim__drainMutBatch : PrimIO (JsArray RawElement)

%foreign "javascript:lambda:(cb, w) => { if (!window.__seMutTimer && window.__seMutBatch.length > 0) { window.__seMutTimer = setTimeout(() => cb()(w), 200); } }"
prim__scheduleMutFlush : PrimIO () -> PrimIO ()

||| Process a batch of mutated elements.
flushMutationBatch : IO ()
flushMutationBatch = do
  batch <- primIO prim__drainMutBatch
  pending <- newArray {a = RawElement}

  forArray_ batch $ \el => do
    tag <- tagName el

    if tag == "IMG"
      then do
        marked <- tryMarkPending el
        when marked $ ignore $ arrayPush pending el
      else if tag == "svg" || tag == "SVG"
      then do
        isImg <- isSvgImage el
        when isImg $ do
          marked <- tryMarkPending el
          when marked $ ignore $ arrayPush pending el
      else if tag == "VIDEO"
      then do
        poster <- hasPoster el
        when poster $ do
          marked <- tryMarkPending el
          when marked $ ignore $ arrayPush pending el
      else do
        hasBg <- hasBgImage el
        when hasBg $ do
          marked <- tryMarkPending el
          when marked $ ignore $ arrayPush pending el

    -- Check children of the element
    childImgs <- querySelectorAll el "img"
    forArray_ childImgs $ \img => do
      marked <- tryMarkPending img
      when marked $ ignore $ arrayPush pending img

    childBgs <- querySelectorAll el "[style*='background']"
    forArray_ childBgs $ \bgEl => do
      bgTag <- tagName bgEl
      when (bgTag /= "IMG") $ do
        hasBg <- hasBgImage bgEl
        when hasBg $ do
          marked <- tryMarkPending bgEl
          when marked $ ignore $ arrayPush pending bgEl

    childVideos <- querySelectorAll el "video[poster]"
    forArray_ childVideos $ \video => do
      marked <- tryMarkPending video
      when marked $ ignore $ arrayPush pending video

    childSvgs <- querySelectorAll el "svg"
    forArray_ childSvgs $ \svg => do
      isImg <- isSvgImage svg
      when isImg $ do
        marked <- tryMarkPending svg
        when marked $ ignore $ arrayPush pending svg

  pendingLen <- arrayLength pending
  when (pendingLen > 0) $ do
    -- Prefetch
    urls <- newArray {a = JsValue}
    forArray_ pending $ \el => do
      src <- primIO $ prim__pipelineGetSrc el
      if src == ""
        then pure ()
        else do
          known <- primIO $ prim__isUrlKnown src
          when (known == 0) $ ignore $ arrayPush urls (believe_me src)
    urlLen <- arrayLength urls
    when (urlLen > 0) $ primIO $ prim__prefetchUrls urls
    -- Process
    forArray_ pending $ \el => primIO $ prim__processImage el

---------------------------------------------------------------------------
-- MutationObserver callback (uses window.__se for attribute mutations)
---------------------------------------------------------------------------

%foreign "javascript:lambda:(callback, w) => new MutationObserver((mutations) => { for (var m of mutations) { if (m.type === 'childList') { for (var n of m.addedNodes) { if (n.nodeType === 1) window.__seMutBatch.push(n); } } else if (m.type === 'attributes' && m.target.nodeType === 1) { var el = m.target; if (window.__se) window.__se.handleAttributeMutation(el, m.attributeName); } } if (window.__seMutBatch.length > 0 && !window.__seMutTimer) { window.__seMutTimer = setTimeout(() => callback()(w), 200); } })"
prim__newContentObserver : PrimIO () -> PrimIO JsValue

%foreign "javascript:lambda:(obs, target, w) => obs.observe(target, {childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset', 'data-src', 'data-original', 'data-lazy', 'style']})"
prim__observeContent : JsValue -> RawElement -> PrimIO ()

---------------------------------------------------------------------------
-- Pipeline initialization
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w) => document.getElementById('shmirat-eynaim-early-hide')"
prim__getEarlyHide : PrimIO JsValue

%foreign "javascript:lambda:(el, w) => { if (el) el.remove(); }"
prim__removeIfExists : JsValue -> PrimIO ()

%foreign "javascript:lambda:(cb, w) => window.addEventListener('load', () => cb(w))"
prim__onWindowLoad : PrimIO () -> PrimIO ()

---------------------------------------------------------------------------
-- Main entry point
--
-- 1. Initialize the content pipeline (state, functions, listeners)
-- 2. Set up MutationObserver with Idris-driven discovery
-- 3. Run initial image sweep using Idris discoverImages
---------------------------------------------------------------------------

export
main : IO ()
main = do
  -- Initialize content pipeline (replaces content-pipeline.js)
  primIO prim__initContentPipeline

  -- Initialize mutation batch buffer
  primIO prim__initMutBatch

  -- Set up MutationObserver
  obs <- primIO $ prim__newContentObserver (toPrim flushMutationBatch)
  docEl <- documentElement
  primIO $ prim__observeContent obs docEl

  -- Initial sweep
  b <- body
  discoverImages b

  -- Remove early-hide style (unless pipeline disabled it due to whitelisting)
  earlyHide <- primIO prim__getEarlyHide
  primIO $ prim__removeIfExists earlyHide

  -- Re-sweep on window load (catches lazy images)
  primIO $ prim__onWindowLoad (toPrim $ discoverImages b)

  seLog "Content script initialized (Idris)"
