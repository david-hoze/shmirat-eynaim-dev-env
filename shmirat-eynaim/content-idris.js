class IdrisError extends Error { }

function __prim_js2idris_array(x){
  let acc = { h:0 };

  for (let i = x.length-1; i>=0; i--) {
      acc = { a1:x[i], a2:acc };
  }
  return acc;
}

function __prim_idris2js_array(x){
  const result = Array();
  while (x.h === undefined) {
    result.push(x.a1); x = x.a2;
  }
  return result;
}

function __lazy(thunk) {
  let res;
  return function () {
    if (thunk === undefined) return res;
    res = thunk();
    thunk = undefined;
    return res;
  };
};

function __prim_stringIteratorNew(_str) {
  return 0
}

function __prim_stringIteratorToString(_, str, it, f) {
  return f(str.slice(it))
}

function __prim_stringIteratorNext(str, it) {
  if (it >= str.length)
    return {h: 0};
  else
    return {a1: str.charAt(it), a2: it + 1};
}

function __tailRec(f,ini) {
  let obj = ini;
  while(true){
    switch(obj.h){
      case 0: return obj.a1;
      default: obj = f(obj);
    }
  }
}

const _idrisworld = Symbol('idrisworld')

const _crashExp = x=>{throw new IdrisError(x)}

const _bigIntOfString = s=> {
  try {
    const idx = s.indexOf('.')
    return idx === -1 ? BigInt(s) : BigInt(s.slice(0, idx))
  } catch (e) { return 0n }
}

const _numberOfString = s=> {
  try {
    const res = Number(s);
    return isNaN(res) ? 0 : res;
  } catch (e) { return 0 }
}

const _intOfString = s=> Math.trunc(_numberOfString(s))

const _truncToChar = x=> String.fromCodePoint(
  (x >= 0 && x <= 55295) || (x >= 57344 && x <= 1114111) ? x : 0
)

// Int8
const _truncInt8 = x => {
  const res = x & 0xff;
  return res >= 0x80 ? res - 0x100 : res;
}

const _truncBigInt8 = x => Number(BigInt.asIntN(8, x))

// Euclidian Division
const _div = (a,b) => {
  const q = Math.trunc(a / b)
  const r = a % b
  return r < 0 ? (b > 0 ? q - 1 : q + 1) : q
}

const _divBigInt = (a,b) => {
  const q = a / b
  const r = a % b
  return r < 0n ? (b > 0n ? q - 1n : q + 1n) : q
}

// Euclidian Modulo
const _mod = (a,b) => {
  const r = a % b
  return r < 0 ? (b > 0 ? r + b : r - b) : r
}

const _modBigInt = (a,b) => {
  const r = a % b
  return r < 0n ? (b > 0n ? r + b : r - b) : r
}

const _add8s = (a,b) => _truncInt8(a + b)
const _sub8s = (a,b) => _truncInt8(a - b)
const _mul8s = (a,b) => _truncInt8(a * b)
const _div8s = (a,b) => _truncInt8(_div(a,b))
const _shl8s = (a,b) => _truncInt8(a << b)
const _shr8s = (a,b) => _truncInt8(a >> b)

// Int16
const _truncInt16 = x => {
  const res = x & 0xffff;
  return res >= 0x8000 ? res - 0x10000 : res;
}

const _truncBigInt16 = x => Number(BigInt.asIntN(16, x))

const _add16s = (a,b) => _truncInt16(a + b)
const _sub16s = (a,b) => _truncInt16(a - b)
const _mul16s = (a,b) => _truncInt16(a * b)
const _div16s = (a,b) => _truncInt16(_div(a,b))
const _shl16s = (a,b) => _truncInt16(a << b)
const _shr16s = (a,b) => _truncInt16(a >> b)

//Int32
const _truncInt32 = x => x & 0xffffffff

const _truncBigInt32 = x => Number(BigInt.asIntN(32, x))

const _add32s = (a,b) => _truncInt32(a + b)
const _sub32s = (a,b) => _truncInt32(a - b)
const _div32s = (a,b) => _truncInt32(_div(a,b))

const _mul32s = (a,b) => {
  const res = a * b;
  if (res <= Number.MIN_SAFE_INTEGER || res >= Number.MAX_SAFE_INTEGER) {
    return _truncInt32((a & 0xffff) * b + (b & 0xffff) * (a & 0xffff0000))
  } else {
    return _truncInt32(res)
  }
}

//Int64
const _truncBigInt64 = x => BigInt.asIntN(64, x)

const _add64s = (a,b) => _truncBigInt64(a + b)
const _sub64s = (a,b) => _truncBigInt64(a - b)
const _mul64s = (a,b) => _truncBigInt64(a * b)
const _shl64s = (a,b) => _truncBigInt64(a << b)
const _div64s = (a,b) => _truncBigInt64(_divBigInt(a,b))
const _shr64s = (a,b) => _truncBigInt64(a >> b)

//Bits8
const _truncUInt8 = x => x & 0xff

const _truncUBigInt8 = x => Number(BigInt.asUintN(8, x))

const _add8u = (a,b) => (a + b) & 0xff
const _sub8u = (a,b) => (a - b) & 0xff
const _mul8u = (a,b) => (a * b) & 0xff
const _div8u = (a,b) => Math.trunc(a / b)
const _shl8u = (a,b) => (a << b) & 0xff
const _shr8u = (a,b) => (a >> b) & 0xff

//Bits16
const _truncUInt16 = x => x & 0xffff

const _truncUBigInt16 = x => Number(BigInt.asUintN(16, x))

const _add16u = (a,b) => (a + b) & 0xffff
const _sub16u = (a,b) => (a - b) & 0xffff
const _mul16u = (a,b) => (a * b) & 0xffff
const _div16u = (a,b) => Math.trunc(a / b)
const _shl16u = (a,b) => (a << b) & 0xffff
const _shr16u = (a,b) => (a >> b) & 0xffff

//Bits32
const _truncUBigInt32 = x => Number(BigInt.asUintN(32, x))

const _truncUInt32 = x => {
  const res = x & -1;
  return res < 0 ? res + 0x100000000 : res;
}

const _add32u = (a,b) => _truncUInt32(a + b)
const _sub32u = (a,b) => _truncUInt32(a - b)
const _mul32u = (a,b) => _truncUInt32(_mul32s(a,b))
const _div32u = (a,b) => Math.trunc(a / b)

const _shl32u = (a,b) => _truncUInt32(a << b)
const _shr32u = (a,b) => _truncUInt32(a <= 0x7fffffff ? a >> b : (b == 0 ? a : (a >> b) ^ ((-0x80000000) >> (b-1))))
const _and32u = (a,b) => _truncUInt32(a & b)
const _or32u = (a,b)  => _truncUInt32(a | b)
const _xor32u = (a,b) => _truncUInt32(a ^ b)

//Bits64
const _truncUBigInt64 = x => BigInt.asUintN(64, x)

const _add64u = (a,b) => BigInt.asUintN(64, a + b)
const _mul64u = (a,b) => BigInt.asUintN(64, a * b)
const _div64u = (a,b) => a / b
const _shl64u = (a,b) => BigInt.asUintN(64, a << b)
const _shr64u = (a,b) => BigInt.asUintN(64, a >> b)
const _sub64u = (a,b) => BigInt.asUintN(64, a - b)

//String
const _strReverse = x => x.split('').reverse().join('')

const _substr = (o,l,x) => x.slice(o, o + l)

const Extension_Content_prim__tryMarkPending = ((el, w) => { if (el.classList.contains('shmirat-eynaim-pending') || el.classList.contains('shmirat-eynaim-safe') || el.classList.contains('shmirat-eynaim-blocked')) return 0; el.classList.add('shmirat-eynaim-pending'); return 1; });
const Extension_Content_prim__removeIfExists = ((el, w) => { if (el) el.remove(); });
const Extension_Content_prim__processImage = ((el, w) => { if (window.__se) window.__se.processImage(el); });
const Extension_Content_prim__prefetchUrls = ((urls, w) => { if (window.__se) window.__se.prefetchUrls(urls); });
const Extension_Content_prim__pipelineGetSrc = ((el, w) => { if (window.__se) return window.__se.getImageSrc(el); return ''; });
const Extension_Content_prim__onWindowLoad = ((cb, w) => window.addEventListener('load', () => cb(w)));
const Extension_Content_prim__observeContent = ((obs, target, w) => obs.observe(target, {childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset', 'data-src', 'data-original', 'data-lazy', 'style']}));
const Extension_Content_prim__newContentObserver = ((callback, w) => new MutationObserver((mutations) => { for (var m of mutations) { if (m.type === 'childList') { for (var n of m.addedNodes) { if (n.nodeType === 1) window.__seMutBatch.push(n); } } else if (m.type === 'attributes' && m.target.nodeType === 1) { var el = m.target; if (window.__se) window.__se.handleAttributeMutation(el, m.attributeName); } } if (window.__seMutBatch.length > 0 && !window.__seMutTimer) { window.__seMutTimer = setTimeout(() => callback()(w), 200); } }));
const Extension_Content_prim__isUrlKnown = ((url, w) => { if (window.__se) return window.__se.isUrlKnown(url) ? 1 : 0; return 0; });
const Extension_Content_prim__initMutBatch = ((w) => { window.__seMutBatch = []; window.__seMutTimer = null; });
const Extension_Content_prim__initContentPipeline = ((w) => { var se = {}; var state = {blockingEnabled:true,whitelisted:false,manualBlocklist:[],manualSafelist:[]}; se.manualBlocklist = new Set(); se.manualSafelist = new Set(); se.scannedCount = 0; se.hiddenCount = 0; se.hiddenFaceCount = 0; se.hiddenBodyCount = 0; se.urlCache = new Map(); se.pendingUpdates = []; se.rafScheduled = false; se.activeCount = 0; se.queue = []; se.activePrefetch = Promise.resolve(); var ICON_DOMAINS = ['fonts.googleapis.com','fonts.gstatic.com','cdnjs.cloudflare.com','use.fontawesome.com','ka-f.fontawesome.com']; var MAX_CONCURRENT = 3; var ANALYZE_TIMEOUT = 45000; function isIconDomain(src) { try { var h = new URL(src).hostname; return ICON_DOMAINS.some(function(d) { return h === d || h.endsWith('.' + d); }); } catch(e) { return false; } } se.shouldSkip = function(el) { if (el.tagName === 'LINK' && el.rel && /icon/i.test(el.rel)) return true; if (el.tagName === 'svg' || el.tagName === 'SVG') return false; var src = el.src || el.currentSrc || ''; if (src.endsWith('.svg')) return true; if (src.startsWith('data:image/') && src.length < 5000) return true; if (src && isIconDomain(src)) return true; if (el.tagName === 'IMG') { var ew = el.naturalWidth || parseInt(el.getAttribute('width'),10) || 0; var eh = el.naturalHeight || parseInt(el.getAttribute('height'),10) || 0; if (ew > 0 && eh > 0 && (ew < 40 || eh < 40)) return true; } return false; }; se.getImageSrc = function(el) { if (el.tagName === 'IMG' || el.tagName === 'IMAGE') return el.currentSrc || el.src || el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || ''; if (el.tagName === 'VIDEO') return el.getAttribute('poster') || ''; if (el.tagName === 'svg' || el.tagName === 'SVG') { var imgChild = el.querySelector('image[href], image[xlink\\:href]'); if (imgChild) return imgChild.getAttribute('href') || imgChild.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || ''; try { var svgData = new XMLSerializer().serializeToString(el); return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData))); } catch(e) { return ''; } } var inlineBg = el.style.backgroundImage; if (inlineBg && inlineBg !== 'none' && inlineBg.includes('url(')) { var m = inlineBg.match(/url\(['"]?(.+?)['"]?\)/); if (m) return m[1]; } var bg = getComputedStyle(el).backgroundImage; if (bg && bg !== 'none') { var m2 = bg.match(/url\(['"]?(.+?)['"]?\)/); if (m2) return m2[1]; } return ''; }; function imageToCanvas(img, maxDim) { maxDim = maxDim || 416; var iw = img.naturalWidth || img.width; var ih = img.naturalHeight || img.height; if (iw > maxDim || ih > maxDim) { var scale = maxDim / Math.max(iw, ih); iw = Math.round(iw * scale); ih = Math.round(ih * scale); } var canvas = document.createElement('canvas'); canvas.width = iw; canvas.height = ih; canvas.getContext('2d').drawImage(img, 0, 0, iw, ih); return canvas; } function loadImage(src, crossOrigin) { return new Promise(function(resolve, reject) { var img = new Image(); if (crossOrigin) img.crossOrigin = 'anonymous'; var timer = setTimeout(function() { img.src = ''; reject(new Error('timeout')); }, 10000); img.onload = function() { clearTimeout(timer); resolve(img); }; img.onerror = function() { clearTimeout(timer); reject(new Error('load failed')); }; img.src = src; }); } function svgToDataUrl(svgEl) { return (async function() { try { var rect = svgEl.getBoundingClientRect(); var sw = rect.width || 416; var sh = rect.height || 416; var maxDim = 416; if (sw > maxDim || sh > maxDim) { var scale = maxDim / Math.max(sw, sh); sw = Math.round(sw * scale); sh = Math.round(sh * scale); } var svgData = new XMLSerializer().serializeToString(svgEl); var svgBlob = new Blob([svgData], {type:'image/svg+xml;charset=utf-8'}); var url = URL.createObjectURL(svgBlob); try { var img = await loadImage(url, false); var canvas = document.createElement('canvas'); canvas.width = sw; canvas.height = sh; canvas.getContext('2d').drawImage(img, 0, 0, sw, sh); return canvas.toDataURL('image/jpeg', 0.8); } finally { URL.revokeObjectURL(url); } } catch(e) { return null; } })(); } function getImageDataUrl(el, src) { return (async function() { var ss = src.substring(0, 60); if (el.tagName === 'svg' || el.tagName === 'SVG') return svgToDataUrl(el); if (el.tagName === 'IMG' && el.complete && el.naturalWidth > 0) { try { var canvas = imageToCanvas(el); canvas.getContext('2d').getImageData(0, 0, 1, 1); console.log('[SE] getDataUrl canvas OK:', ss); return canvas.toDataURL('image/jpeg', 0.8); } catch(e) { console.log('[SE] getDataUrl canvas FAIL:', ss, e.message); } } if (src && src.startsWith('data:image/svg+xml')) { try { var img = await loadImage(src, false); var canvas = imageToCanvas(img); return canvas.toDataURL('image/jpeg', 0.8); } catch(e) {} } try { var img = await loadImage(src, true); var canvas = imageToCanvas(img); canvas.getContext('2d').getImageData(0, 0, 1, 1); console.log('[SE] getDataUrl crossOrigin OK:', ss); return canvas.toDataURL('image/jpeg', 0.8); } catch(e) { console.log('[SE] getDataUrl crossOrigin FAIL:', ss, e.message); } try { var dataUrl = await browser.runtime.sendMessage({type:'fetchImage', url:src}); if (dataUrl) { console.log('[SE] getDataUrl bgFetch OK:', ss, 'len=' + dataUrl.length); return dataUrl; } else { console.log('[SE] getDataUrl bgFetch NULL:', ss); } } catch(e) { console.log('[SE] getDataUrl bgFetch ERR:', ss, e.message); } console.warn('[SE] getDataUrl ALL FAILED:', ss); return null; })(); } function isTooSmall(el) { if (el.tagName === 'IMG') { var tw = el.naturalWidth || el.width; var th = el.naturalHeight || el.height; return tw < 40 || th < 40; } var rect = el.getBoundingClientRect(); return rect.width < 40 || rect.height < 40; } function flushUpdates() { se.rafScheduled = false; var batch = se.pendingUpdates; se.pendingUpdates = []; for (var i = 0; i < batch.length; i++) { var u = batch[i]; if (u.action === 'safe') { u.el.classList.remove('shmirat-eynaim-pending'); u.el.classList.add('shmirat-eynaim-safe'); } else { u.el.classList.remove('shmirat-eynaim-pending'); u.el.classList.add('shmirat-eynaim-blocked'); if (u.el.tagName !== 'IMG' && u.el.tagName !== 'VIDEO') u.el.style.setProperty('background-image', 'none', 'important'); se.hiddenCount++; if (u.reason === 'person-no-face') se.hiddenBodyCount++; else if (u.reason === 'face') se.hiddenFaceCount++; } } } function scheduleUpdate(el, action, reason) { se.pendingUpdates.push({el:el, action:action, reason:reason}); if (!se.rafScheduled) { se.rafScheduled = true; requestAnimationFrame(flushUpdates); } } function markSafe(el) { scheduleUpdate(el, 'safe'); } function markBlocked(el, reason) { scheduleUpdate(el, 'block', reason); } function analyzeElement(el) { return (async function() { var src = se.getImageSrc(el); if (!src) { markSafe(el); return; } if (se.manualBlocklist.has(src)) { markBlocked(el); se.scannedCount++; return; } if (se.manualSafelist.has(src)) { markSafe(el); se.scannedCount++; return; } if (se.urlCache.has(src)) { var cached = se.urlCache.get(src); if (cached.containsWomen) markBlocked(el, cached.reason); else markSafe(el); se.scannedCount++; return; } var timeoutId; try { await Promise.race([analyzeElementAsync(el, src), new Promise(function(_, reject) { timeoutId = setTimeout(function() { reject(new Error('analyze_timeout')); }, ANALYZE_TIMEOUT); })]); clearTimeout(timeoutId); } catch(err) { clearTimeout(timeoutId); if (!el.classList.contains('shmirat-eynaim-safe') && !el.classList.contains('shmirat-eynaim-blocked')) { console.warn('[SE] Analyze timeout:', src.substring(0, 60)); markBlocked(el, 'timeout'); se.scannedCount++; } } })(); } function analyzeElementAsync(el, src) { return (async function() { await se.activePrefetch; try { var cached = await browser.runtime.sendMessage({type:'checkCache', url:src}); if (cached && cached.hit) { se.urlCache.set(src, cached); se.scannedCount++; if (cached.containsWomen) markBlocked(el, cached.reason); else markSafe(el); return; } } catch(e) {} var imageDataUrl = await getImageDataUrl(el, src); if (!imageDataUrl) { console.log('[SE] No dataUrl, marking blocked:', src.substring(0, 60)); markBlocked(el, 'no-data'); se.scannedCount++; return; } try { var result = await browser.runtime.sendMessage({type:'classifyImage', url:src, imageDataUrl:imageDataUrl}); se.urlCache.set(src, result); se.scannedCount++; console.log('[SE] Classify:', result.containsWomen ? 'BLOCK' : 'SAFE', result.reason || '', src.substring(0, 60)); if (result.containsWomen) markBlocked(el, result.reason); else markSafe(el); } catch(err) { console.error('[SE] Classification error:', err.message, 'src:', src.substring(0, 60)); markBlocked(el, 'classify-error'); se.scannedCount++; } })(); } function enqueue(task) { se.queue.push(task); processQueue(); } function processQueue() { while (se.activeCount < MAX_CONCURRENT && se.queue.length > 0) { var task = se.queue.shift(); se.activeCount++; task().finally(function() { se.activeCount--; processQueue(); }); } } function handleLoadedImage(el) { if (el.tagName === 'IMG' && el.complete && el.naturalWidth === 0) { markSafe(el); se.scannedCount++; return; } if (isTooSmall(el)) { markSafe(el); return; } enqueue(function() { return analyzeElement(el); }); } se.processImage = function(el) { if (se.shouldSkip(el)) { markSafe(el); return; } if (el.tagName !== 'IMG' && el.tagName !== 'VIDEO') { var bg = el.style.backgroundImage; if (bg && bg.includes('url(')) { var m = bg.match(/url\(['"]?(.+?)['"]?\)/); if (m) el.dataset.seLastBgUrl = m[1]; } } var src = se.getImageSrc(el); if (src) { if (se.manualBlocklist.has(src)) { markBlocked(el); se.scannedCount++; return; } if (se.manualSafelist.has(src)) { markSafe(el); se.scannedCount++; return; } if (se.urlCache.has(src)) { var cached = se.urlCache.get(src); if (cached.containsWomen) markBlocked(el, cached.reason); else markSafe(el); se.scannedCount++; return; } } if (el.tagName === 'IMG' && !el.complete) { if (el.loading === 'lazy') el.loading = 'eager'; el.addEventListener('load', function() { handleLoadedImage(el); }, {once:true}); el.addEventListener('error', function() { markSafe(el); se.scannedCount++; }, {once:true}); setTimeout(function() { if (el.classList.contains('shmirat-eynaim-pending')) { console.log('[SE] Lazy image load timeout:', (el.src || '').substring(0, 60)); handleLoadedImage(el); } }, 15000); return; } handleLoadedImage(el); }; se.handleAttributeMutation = function(el, attrName) { if (attrName === 'style') { var bg = el.style.backgroundImage; if (bg && bg !== 'none' && bg.includes('url(')) { var urlMatch = bg.match(/url\(['"]?(.+?)['"]?\)/); var newUrl = urlMatch ? urlMatch[1] : ''; var prevUrl = el.dataset.seLastBgUrl || ''; if (newUrl && newUrl !== prevUrl) { el.dataset.seLastBgUrl = newUrl; el.classList.remove('shmirat-eynaim-safe', 'shmirat-eynaim-blocked'); el.classList.add('shmirat-eynaim-pending'); se.processImage(el); } } } else { el.classList.remove('shmirat-eynaim-safe', 'shmirat-eynaim-blocked'); el.classList.add('shmirat-eynaim-pending'); se.processImage(el); } }; se.isUrlKnown = function(url) { return se.urlCache.has(url) || se.manualBlocklist.has(url) || se.manualSafelist.has(url); }; se.prefetchUrls = function(urls) { if (urls.length > 0) { se.activePrefetch = browser.runtime.sendMessage({type:'prefetchServer', urls:Array.from(urls)}).catch(function(){}); } }; function findImagesByUrl(url) { var results = []; document.querySelectorAll('img').forEach(function(img) { if (img.src === url || img.currentSrc === url) results.push(img); }); document.querySelectorAll('[style*=background]').forEach(function(el) { if (el.tagName === 'IMG') return; var bg = el.style.backgroundImage; if (bg && bg !== 'none') { var match = bg.match(/url\(['"]?(.+?)['"]?\)/); if (match && match[1] === url) results.push(el); } }); document.querySelectorAll('video[poster]').forEach(function(video) { if (video.getAttribute('poster') === url) results.push(video); }); return results; } function feedbackThenBlock(el) { el.classList.remove('shmirat-eynaim-safe', 'shmirat-eynaim-pending'); el.classList.add('shmirat-eynaim-feedback-block'); setTimeout(function() { el.classList.remove('shmirat-eynaim-feedback-block'); markBlocked(el); }, 300); } function feedbackThenSafe(el) { el.classList.remove('shmirat-eynaim-blocked', 'shmirat-eynaim-pending'); el.classList.add('shmirat-eynaim-feedback-safe'); if (el.tagName !== 'IMG' && el.tagName !== 'VIDEO') el.style.removeProperty('background-image'); setTimeout(function() { el.classList.remove('shmirat-eynaim-feedback-safe'); markSafe(el); }, 300); } function blockAndLearn(url) { return (async function() { var elements = findImagesByUrl(url); se.urlCache.set(url, {containsWomen:true, manualBlock:true}); se.manualBlocklist.add(url); elements.forEach(function(el) { feedbackThenBlock(el); }); var el = elements[0]; if (el) { var imageDataUrl = await getImageDataUrl(el, url); if (imageDataUrl) { try { var descriptors = await browser.runtime.sendMessage({type:'extractDescriptors', imageDataUrl:imageDataUrl}); if (descriptors && descriptors.length > 0) { browser.runtime.sendMessage({type:'learnBlock', url:url, descriptors:descriptors}).catch(function(){}); } } catch(e) {} } } browser.runtime.sendMessage({type:'serverSubmitClassification', url:url, containsWomen:true, source:'user', confidence:1.0}).catch(function(){}); })(); } function safeAndLearn(url) { return (async function() { var elements = findImagesByUrl(url); se.urlCache.set(url, {containsWomen:false, manualSafe:true}); se.manualSafelist.add(url); elements.forEach(function(el) { feedbackThenSafe(el); }); var el = elements[0]; if (el) { var imageDataUrl = await getImageDataUrl(el, url); if (imageDataUrl) { try { var descriptors = await browser.runtime.sendMessage({type:'extractDescriptors', imageDataUrl:imageDataUrl}); if (descriptors && descriptors.length > 0) { browser.runtime.sendMessage({type:'learnSafe', url:url, descriptors:descriptors}).catch(function(){}); } } catch(e) {} } } browser.runtime.sendMessage({type:'serverSubmitClassification', url:url, containsWomen:false, source:'user', confidence:1.0}).catch(function(){}); })(); } browser.runtime.onMessage.addListener(function(msg) { if (msg.type === 'getStats') { return Promise.resolve({scanned:se.scannedCount, hidden:se.hiddenCount, hiddenFace:se.hiddenFaceCount, hiddenBody:se.hiddenBodyCount}); } if (msg.type === 'blockAndLearn' && msg.url) blockAndLearn(msg.url); if (msg.type === 'safeAndLearn' && msg.url) safeAndLearn(msg.url); if (msg.type === 'hideImage' && msg.url) blockAndLearn(msg.url); if (msg.type === 'showImage' && msg.url) safeAndLearn(msg.url); if (msg.type === 'classificationOverride' && msg.url) { if (se.manualBlocklist.has(msg.url) || se.manualSafelist.has(msg.url)) return; se.urlCache.set(msg.url, {containsWomen:msg.containsWomen, reason:msg.reason}); var elements = findImagesByUrl(msg.url); for (var i = 0; i < elements.length; i++) { var oel = elements[i]; if (msg.containsWomen) { oel.classList.remove('shmirat-eynaim-safe'); markBlocked(oel, msg.reason || 'cloud'); } else { oel.classList.remove('shmirat-eynaim-blocked'); if (oel.tagName !== 'IMG' && oel.tagName !== 'VIDEO') oel.style.removeProperty('background-image'); markSafe(oel); se.hiddenCount--; } } } }); function findNearestImageSrc(el) { var node = el; for (var depth = 0; node && depth < 8; node = node.parentElement, depth++) { if (node.tagName === 'IMG' && (node.src || node.currentSrc)) return node.currentSrc || node.src; if (node.tagName === 'svg' || node.tagName === 'SVG') { var imgChild = node.querySelector('image[href], image[xlink\\:href]'); if (imgChild) return imgChild.getAttribute('href') || imgChild.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || null; } if (node.tagName === 'image' || node.tagName === 'IMAGE') return node.getAttribute('href') || node.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || null; var bg = getComputedStyle(node).backgroundImage; if (bg && bg !== 'none' && bg.includes('url(')) { var match = bg.match(/url\(['"]?(.+?)['"]?\)/); if (match) return match[1]; } var childImg = node.querySelector('img[src]'); if (childImg && (childImg.src || childImg.currentSrc)) return childImg.currentSrc || childImg.src; var childVideo = node.querySelector('video[poster]'); if (childVideo) return childVideo.poster; var childSvg = node.querySelector('svg image[href], svg image[xlink\\:href]'); if (childSvg) return childSvg.getAttribute('href') || childSvg.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || null; } return null; } document.addEventListener('contextmenu', function(e) { var src = findNearestImageSrc(e.target); if (src) browser.runtime.sendMessage({type:'contextMenuImage', url:src}).catch(function(){}); }, true); window.addEventListener('message', function(event) { if (event.source !== window || !event.data || event.data.channel !== 'se-debug') return; (async function() { try { var result = await browser.runtime.sendMessage(event.data.payload); window.postMessage({channel:'se-debug-reply', id:event.data.id, result:result}, '*'); } catch(err) { window.postMessage({channel:'se-debug-reply', id:event.data.id, error:err.message}, '*'); } })(); }); browser.runtime.sendMessage({type:'getBlockingState'}).then(function(s) { if (s) { state = s; se.manualBlocklist = new Set(s.manualBlocklist || []); se.manualSafelist = new Set(s.manualSafelist || []); if (!s.blockingEnabled || s.whitelisted) { var earlyHide = document.getElementById('shmirat-eynaim-early-hide'); if (earlyHide) earlyHide.remove(); window.__sePipelineDisabled = true; } } }).catch(function(){}); window.__se = se; });
const Extension_Content_prim__getEarlyHide = ((w) => document.getElementById('shmirat-eynaim-early-hide'));
const Extension_Content_prim__drainMutBatch = ((w) => { var b = window.__seMutBatch; window.__seMutBatch = []; window.__seMutTimer = null; return b; });
const FFI_DOM_Element_prim__tagName = ((_s, el, w) => el.tagName);
const FFI_DOM_Element_prim__svgHasImageChild = ((_s, svg, w) => svg.querySelector('image[href], image[xlink\\:href]') !== null ? 1 : 0);
const FFI_DOM_Element_prim__querySelectorAll = ((_s, el, sel, w) => el.querySelectorAll(sel));
const FFI_DOM_Element_prim__isSvgLarge = ((_s, svg, w) => { var vb = svg.getAttribute('viewBox'); if (vb) { var p = vb.split(/[\s,]+/); if (p.length === 4 && parseFloat(p[2]) > 100 && parseFloat(p[3]) > 100) return 1; } var r = svg.getBoundingClientRect(); return (r.width > 100 && r.height > 100) ? 1 : 0; });
const FFI_DOM_Element_prim__hasPoster = ((_s, el, w) => el.hasAttribute('poster') ? 1 : 0);
const FFI_DOM_Element_prim__hasBgImage = ((_s, el, w) => { var bg = el.style.backgroundImage; return (bg && bg !== 'none' && bg.includes('url(')) ? 1 : 0; });
const FFI_Core_prim__newArray = ((_a, w) => []);
const FFI_Core_prim__consoleLog = ((tag, msg, w) => console.log(tag, msg));
const FFI_Core_prim__arrayPush = ((_a, arr, x, w) => { arr.push(x); return arr; });
const FFI_Core_prim__arrayLength = ((_a, arr, w) => arr.length);
const FFI_Core_prim__arrayGet = ((_a, arr, i, w) => arr[i]);
const FFI_DOM_Document_prim__documentElement = ((w) => document.documentElement);
const FFI_DOM_Document_prim__body = ((w) => document.body);
/* {__mainExpression:0} */
function __mainExpression_0() {
 return PrimIO_unsafePerformIO($2 => Extension_Content_main($2));
}

/* {csegen:6} */
const csegen_6 = __lazy(function () {
 return () => {
  const $a = b => a => $b => $c => $d => {
   const $e = $b($d);
   const $11 = $c($d);
   return $e($11);
  };
  return {a1: b => a => func => $1 => $2 => Prelude_IO_map_Functor_IO(func, $1, $2), a2: a => $8 => $9 => $8, a3: $a};
 };
});

/* {csegen:13} */
const csegen_13 = __lazy(function () {
 return () => {
  const $4 = b => a => $5 => $6 => $7 => {
   const $8 = $5($7);
   return $6($8)($7);
  };
  const $f = a => $10 => $11 => {
   const $12 = $10($11);
   return $12($11);
  };
  const $0 = {a1: csegen_6()(), a2: $4, a3: $f};
  return {a1: $0, a2: a => $18 => $18};
 };
});

/* {csegen:17} */
const csegen_17 = __lazy(function () {
 return () => FFI_Core_newArray(csegen_13()());
});

/* prim__sub_Integer : Integer -> Integer -> Integer */
function prim__sub_Integer($0, $1) {
 return ($0-$1);
}

/* Extension.Content.4227:8187:go */
function Extension_Content_n__4227_8187_go($0, $1, $2, $3, $4) {
 switch(Prelude_EqOrd_x3ex3d_Ord_Int32($3, $4)) {
  case 1: return $0.a1.a1.a2(undefined)(undefined);
  case 0: return $0.a1.a2(undefined)(undefined)(FFI_Core_arrayGet($0, $2, $3))(el => $0.a1.a2(undefined)(undefined)($1(el))($2a => Extension_Content_n__4227_8187_go($0, $1, $2, _add32s($3, 1), $4)));
 }
}

/* Extension.Content.tryMarkPending : HasIO io => RawElement -> io Bool */
function Extension_Content_tryMarkPending($0, $1) {
 return $0.a1.a2(undefined)(undefined)($0.a2(undefined)($10 => Extension_Content_prim__tryMarkPending($1, $10)))(r => $0.a1.a1.a2(undefined)(Prelude_EqOrd_x3dx3d_Eq_Int32(r, 1)));
}

/* Extension.Content.main : IO () */
function Extension_Content_main($0) {
 const $1 = Extension_Content_prim__initContentPipeline($0);
 const $4 = Extension_Content_prim__initMutBatch($0);
 const $7 = Extension_Content_prim__newContentObserver($a => Extension_Content_flushMutationBatch($a), $0);
 const $e = FFI_DOM_Document_documentElement(csegen_13()())($0);
 const $15 = Extension_Content_prim__observeContent($7, $e, $0);
 const $1a = FFI_DOM_Document_body(csegen_13()())($0);
 const $21 = Extension_Content_discoverImages(csegen_13()(), $1a)($0);
 const $29 = Extension_Content_prim__getEarlyHide($0);
 const $2c = Extension_Content_prim__removeIfExists($29, $0);
 const $30 = Extension_Content_prim__onWindowLoad(Extension_Content_discoverImages(csegen_13()(), $1a), $0);
 return FFI_Core_seLog(csegen_13()(), 'Content script initialized (Idris)')($0);
}

/* Extension.Content.forArray_ : HasIO io => JsArray a -> (a -> io ()) -> io () */
function Extension_Content_forArray_($0, $1, $2) {
 return $0.a1.a2(undefined)(undefined)(FFI_Core_arrayLength($0, $1))(len => Extension_Content_n__4227_8187_go($0, $2, $1, 0, len));
}

/* Extension.Content.flushMutationBatch : IO () */
function Extension_Content_flushMutationBatch($0) {
 const $1 = Extension_Content_prim__drainMutBatch($0);
 const $4 = csegen_17()()($0);
 const $10 = el => $11 => {
  const $12 = FFI_DOM_Element_tagName(csegen_13()(), el)($11);
  let $1a;
  switch(Prelude_EqOrd_x3dx3d_Eq_String($12, 'IMG')) {
   case 1: {
    const $1f = Extension_Content_tryMarkPending(csegen_13()(), el)($11);
    $1a = Prelude_Interfaces_when(csegen_6()(), $1f, () => $2e => Prelude_IO_map_Functor_IO($31 => undefined, FFI_Core_arrayPush(csegen_13()(), $4, el), $2e))($11);
    break;
   }
   case 0: {
    let $3b;
    switch(Prelude_EqOrd_x3dx3d_Eq_String($12, 'svg')) {
     case 1: {
      $3b = 1;
      break;
     }
     case 0: {
      $3b = Prelude_EqOrd_x3dx3d_Eq_String($12, 'SVG');
      break;
     }
    }
    switch($3b) {
     case 1: {
      const $43 = FFI_DOM_Element_isSvgImage(csegen_13()(), el)($11);
      $1a = Prelude_Interfaces_when(csegen_6()(), $43, () => $52 => {
       const $53 = Extension_Content_tryMarkPending(csegen_13()(), el)($52);
       return Prelude_Interfaces_when(csegen_6()(), $53, () => $62 => Prelude_IO_map_Functor_IO($65 => undefined, FFI_Core_arrayPush(csegen_13()(), $4, el), $62))($52);
      })($11);
      break;
     }
     case 0: {
      switch(Prelude_EqOrd_x3dx3d_Eq_String($12, 'VIDEO')) {
       case 1: {
        const $74 = FFI_DOM_Element_hasPoster(csegen_13()(), el)($11);
        $1a = Prelude_Interfaces_when(csegen_6()(), $74, () => $83 => {
         const $84 = Extension_Content_tryMarkPending(csegen_13()(), el)($83);
         return Prelude_Interfaces_when(csegen_6()(), $84, () => $93 => Prelude_IO_map_Functor_IO($96 => undefined, FFI_Core_arrayPush(csegen_13()(), $4, el), $93))($83);
        })($11);
        break;
       }
       case 0: {
        const $a1 = FFI_DOM_Element_hasBgImage(csegen_13()(), el)($11);
        $1a = Prelude_Interfaces_when(csegen_6()(), $a1, () => $b0 => {
         const $b1 = Extension_Content_tryMarkPending(csegen_13()(), el)($b0);
         return Prelude_Interfaces_when(csegen_6()(), $b1, () => $c0 => Prelude_IO_map_Functor_IO($c3 => undefined, FFI_Core_arrayPush(csegen_13()(), $4, el), $c0))($b0);
        })($11);
        break;
       }
      }
      break;
     }
    }
    break;
   }
  }
  const $ce = FFI_DOM_Element_querySelectorAll(csegen_13()(), el, 'img')($11);
  const $de = img => $df => {
   const $e0 = Extension_Content_tryMarkPending(csegen_13()(), img)($df);
   return Prelude_Interfaces_when(csegen_6()(), $e0, () => $ef => Prelude_IO_map_Functor_IO($f2 => undefined, FFI_Core_arrayPush(csegen_13()(), $4, img), $ef))($df);
  };
  const $d8 = Extension_Content_forArray_(csegen_13()(), $ce, $de);
  const $d7 = $d8($11);
  const $fd = FFI_DOM_Element_querySelectorAll(csegen_13()(), el, '[style*=\'background\']')($11);
  const $10d = bgEl => $10e => {
   const $10f = FFI_DOM_Element_tagName(csegen_13()(), bgEl)($10e);
   return Prelude_Interfaces_when(csegen_6()(), Prelude_EqOrd_x2fx3d_Eq_String($10f, 'IMG'), () => $121 => {
    const $122 = FFI_DOM_Element_hasBgImage(csegen_13()(), bgEl)($121);
    return Prelude_Interfaces_when(csegen_6()(), $122, () => $131 => {
     const $132 = Extension_Content_tryMarkPending(csegen_13()(), bgEl)($131);
     return Prelude_Interfaces_when(csegen_6()(), $132, () => $141 => Prelude_IO_map_Functor_IO($144 => undefined, FFI_Core_arrayPush(csegen_13()(), $4, bgEl), $141))($131);
    })($121);
   })($10e);
  };
  const $107 = Extension_Content_forArray_(csegen_13()(), $fd, $10d);
  const $106 = $107($11);
  const $151 = FFI_DOM_Element_querySelectorAll(csegen_13()(), el, 'video[poster]')($11);
  const $161 = video => $162 => {
   const $163 = Extension_Content_tryMarkPending(csegen_13()(), video)($162);
   return Prelude_Interfaces_when(csegen_6()(), $163, () => $172 => Prelude_IO_map_Functor_IO($175 => undefined, FFI_Core_arrayPush(csegen_13()(), $4, video), $172))($162);
  };
  const $15b = Extension_Content_forArray_(csegen_13()(), $151, $161);
  const $15a = $15b($11);
  const $180 = FFI_DOM_Element_querySelectorAll(csegen_13()(), el, 'svg')($11);
  const $18f = svg => $190 => {
   const $191 = FFI_DOM_Element_isSvgImage(csegen_13()(), svg)($190);
   return Prelude_Interfaces_when(csegen_6()(), $191, () => $1a0 => {
    const $1a1 = Extension_Content_tryMarkPending(csegen_13()(), svg)($1a0);
    return Prelude_Interfaces_when(csegen_6()(), $1a1, () => $1b0 => Prelude_IO_map_Functor_IO($1b3 => undefined, FFI_Core_arrayPush(csegen_13()(), $4, svg), $1b0))($1a0);
   })($190);
  };
  const $189 = Extension_Content_forArray_(csegen_13()(), $180, $18f);
  return $189($11);
 };
 const $a = Extension_Content_forArray_(csegen_13()(), $1, $10);
 const $9 = $a($0);
 const $1c0 = FFI_Core_arrayLength(csegen_13()(), $4)($0);
 return Prelude_Interfaces_when(csegen_6()(), Prelude_EqOrd_x3e_Ord_Int32($1c0, 0), () => $1d2 => {
  const $1d3 = csegen_17()()($1d2);
  const $1df = el => $1e0 => {
   const $1e1 = Extension_Content_prim__pipelineGetSrc(el, $1e0);
   switch(Prelude_EqOrd_x3dx3d_Eq_String($1e1, '')) {
    case 1: return undefined;
    case 0: {
     const $1e9 = Extension_Content_prim__isUrlKnown($1e1, $1e0);
     return Prelude_Interfaces_when(csegen_6()(), Prelude_EqOrd_x3dx3d_Eq_Int32($1e9, 0), () => $1f7 => Prelude_IO_map_Functor_IO($1fa => undefined, FFI_Core_arrayPush(csegen_13()(), $1d3, $1e1), $1f7))($1e0);
    }
   }
  };
  const $1d9 = Extension_Content_forArray_(csegen_13()(), $4, $1df);
  const $1d8 = $1d9($1d2);
  const $205 = FFI_Core_arrayLength(csegen_13()(), $1d3)($1d2);
  const $20d = Prelude_Interfaces_when(csegen_6()(), Prelude_EqOrd_x3e_Ord_Int32($205, 0), () => $218 => Extension_Content_prim__prefetchUrls($1d3, $218))($1d2);
  return Extension_Content_forArray_(csegen_13()(), $4, el => $224 => Extension_Content_prim__processImage(el, $224))($1d2);
 })($0);
}

/* Extension.Content.discoverImages : HasIO io => RawElement -> io () */
function Extension_Content_discoverImages($0, $1) {
 const $d = pending => {
  const $1b = imgs => {
   const $4c = $4d => {
    const $5b = bgEls => {
     const $b5 = $b6 => {
      const $c4 = videos => {
       const $f5 = $f6 => {
        const $104 = svgs => {
         const $148 = $149 => {
          const $155 = urls => {
           const $162 = el => {
            const $175 = src => {
             switch(Prelude_EqOrd_x3dx3d_Eq_String(src, '')) {
              case 1: return $0.a1.a1.a2(undefined)(undefined);
              case 0: return $0.a1.a2(undefined)(undefined)($0.a2(undefined)($18f => Extension_Content_prim__isUrlKnown(src, $18f)))(known => Prelude_Interfaces_when($0.a1.a1, Prelude_EqOrd_x3dx3d_Eq_Int32(known, 0), () => $0.a1.a1.a1(undefined)(undefined)($1a7 => undefined)(FFI_Core_arrayPush($0, urls, src))));
             }
            };
            return $0.a1.a2(undefined)(undefined)($0.a2(undefined)($171 => Extension_Content_prim__pipelineGetSrc(el, $171)))($175);
           };
           const $15e = Extension_Content_forArray_($0, pending, $162);
           const $158 = $0.a1.a2(undefined)(undefined)($15e);
           return $158($1ae => $0.a1.a2(undefined)(undefined)(FFI_Core_arrayLength($0, urls))(urlLen => $0.a1.a2(undefined)(undefined)(Prelude_Interfaces_when($0.a1.a1, Prelude_EqOrd_x3e_Ord_Int32(urlLen, 0), () => $0.a2(undefined)($1d3 => Extension_Content_prim__prefetchUrls(urls, $1d3))))($1d8 => Extension_Content_forArray_($0, pending, el => $0.a2(undefined)($1e2 => Extension_Content_prim__processImage(el, $1e2))))));
          };
          return $0.a1.a2(undefined)(undefined)(FFI_Core_newArray($0))($155);
         };
         return $0.a1.a2(undefined)(undefined)(Extension_Content_forArray_($0, svgs, svg => $0.a1.a2(undefined)(undefined)(FFI_DOM_Element_isSvgImage($0, svg))(isImg => Prelude_Interfaces_when($0.a1.a1, isImg, () => $0.a1.a2(undefined)(undefined)(Extension_Content_tryMarkPending($0, svg))(marked => Prelude_Interfaces_when($0.a1.a1, marked, () => $0.a1.a1.a1(undefined)(undefined)($142 => undefined)(FFI_Core_arrayPush($0, pending, svg))))))))($148);
        };
        return $0.a1.a2(undefined)(undefined)(FFI_DOM_Element_querySelectorAll($0, $1, 'svg'))($104);
       };
       return $0.a1.a2(undefined)(undefined)(Extension_Content_forArray_($0, videos, video => $0.a1.a2(undefined)(undefined)(Extension_Content_tryMarkPending($0, video))(marked => Prelude_Interfaces_when($0.a1.a1, marked, () => $0.a1.a1.a1(undefined)(undefined)($ef => undefined)(FFI_Core_arrayPush($0, pending, video))))))($f5);
      };
      return $0.a1.a2(undefined)(undefined)(FFI_DOM_Element_querySelectorAll($0, $1, 'video[poster]'))($c4);
     };
     return $0.a1.a2(undefined)(undefined)(Extension_Content_forArray_($0, bgEls, el => $0.a1.a2(undefined)(undefined)(FFI_DOM_Element_tagName($0, el))(tag => Prelude_Interfaces_when($0.a1.a1, Prelude_EqOrd_x2fx3d_Eq_String(tag, 'IMG'), () => $0.a1.a2(undefined)(undefined)(FFI_DOM_Element_hasBgImage($0, el))(hasBg => Prelude_Interfaces_when($0.a1.a1, hasBg, () => $0.a1.a2(undefined)(undefined)(Extension_Content_tryMarkPending($0, el))(marked => Prelude_Interfaces_when($0.a1.a1, marked, () => $0.a1.a1.a1(undefined)(undefined)($af => undefined)(FFI_Core_arrayPush($0, pending, el))))))))))($b5);
    };
    return $0.a1.a2(undefined)(undefined)(FFI_DOM_Element_querySelectorAll($0, $1, '[style*=\'background\']'))($5b);
   };
   return $0.a1.a2(undefined)(undefined)(Extension_Content_forArray_($0, imgs, img => $0.a1.a2(undefined)(undefined)(Extension_Content_tryMarkPending($0, img))(marked => Prelude_Interfaces_when($0.a1.a1, marked, () => $0.a1.a1.a1(undefined)(undefined)($46 => undefined)(FFI_Core_arrayPush($0, pending, img))))))($4c);
  };
  return $0.a1.a2(undefined)(undefined)(FFI_DOM_Element_querySelectorAll($0, $1, 'img'))($1b);
 };
 return $0.a1.a2(undefined)(undefined)(FFI_Core_newArray($0))($d);
}

/* FFI.DOM.Element.tagName : HasIO io => Element s -> io String */
function FFI_DOM_Element_tagName($0, $1) {
 return $0.a2(undefined)($7 => FFI_DOM_Element_prim__tagName(undefined, $1, $7));
}

/* FFI.DOM.Element.svgHasImageChild : HasIO io => Element s -> io Bool */
function FFI_DOM_Element_svgHasImageChild($0, $1) {
 return $0.a1.a2(undefined)(undefined)($0.a2(undefined)($10 => FFI_DOM_Element_prim__svgHasImageChild(undefined, $1, $10)))(r => $0.a1.a1.a2(undefined)(Prelude_EqOrd_x3dx3d_Eq_Int32(r, 1)));
}

/* FFI.DOM.Element.querySelectorAll : HasIO io => Element s -> String -> io (JsArray RawElement) */
function FFI_DOM_Element_querySelectorAll($0, $1, $2) {
 return $0.a2(undefined)($8 => FFI_DOM_Element_prim__querySelectorAll(undefined, $1, $2, $8));
}

/* FFI.DOM.Element.isSvgLarge : HasIO io => Element s -> io Bool */
function FFI_DOM_Element_isSvgLarge($0, $1) {
 return $0.a1.a2(undefined)(undefined)($0.a2(undefined)($10 => FFI_DOM_Element_prim__isSvgLarge(undefined, $1, $10)))(r => $0.a1.a1.a2(undefined)(Prelude_EqOrd_x3dx3d_Eq_Int32(r, 1)));
}

/* FFI.DOM.Element.isSvgImage : HasIO io => Element s -> io Bool */
function FFI_DOM_Element_isSvgImage($0, $1) {
 const $e = hasChild => {
  switch(hasChild) {
   case 1: return $0.a1.a1.a2(undefined)(1);
   case 0: return FFI_DOM_Element_isSvgLarge($0, $1);
  }
 };
 return $0.a1.a2(undefined)(undefined)(FFI_DOM_Element_svgHasImageChild($0, $1))($e);
}

/* FFI.DOM.Element.hasPoster : HasIO io => Element s -> io Bool */
function FFI_DOM_Element_hasPoster($0, $1) {
 return $0.a1.a2(undefined)(undefined)($0.a2(undefined)($10 => FFI_DOM_Element_prim__hasPoster(undefined, $1, $10)))(r => $0.a1.a1.a2(undefined)(Prelude_EqOrd_x3dx3d_Eq_Int32(r, 1)));
}

/* FFI.DOM.Element.hasBgImage : HasIO io => Element s -> io Bool */
function FFI_DOM_Element_hasBgImage($0, $1) {
 return $0.a1.a2(undefined)(undefined)($0.a2(undefined)($10 => FFI_DOM_Element_prim__hasBgImage(undefined, $1, $10)))(r => $0.a1.a1.a2(undefined)(Prelude_EqOrd_x3dx3d_Eq_Int32(r, 1)));
}

/* FFI.Core.seLog : HasIO io => String -> io () */
function FFI_Core_seLog($0, $1) {
 return $0.a2(undefined)($7 => FFI_Core_prim__consoleLog('[Shmirat Eynaim]', $1, $7));
}

/* FFI.Core.newArray : HasIO io => io (JsArray a) */
function FFI_Core_newArray($0) {
 return $0.a2(undefined)($6 => FFI_Core_prim__newArray(undefined, $6));
}

/* FFI.Core.arrayPush : HasIO io => JsArray a -> a -> io (JsArray a) */
function FFI_Core_arrayPush($0, $1, $2) {
 return $0.a2(undefined)($8 => FFI_Core_prim__arrayPush(undefined, $1, $2, $8));
}

/* FFI.Core.arrayLength : HasIO io => JsArray a -> io Int32 */
function FFI_Core_arrayLength($0, $1) {
 return $0.a2(undefined)($7 => FFI_Core_prim__arrayLength(undefined, $1, $7));
}

/* FFI.Core.arrayGet : HasIO io => JsArray a -> Int32 -> io a */
function FFI_Core_arrayGet($0, $1, $2) {
 return $0.a2(undefined)($8 => FFI_Core_prim__arrayGet(undefined, $1, $2, $8));
}

/* Prelude.Types.prim__integerToNat : Integer -> Nat */
function Prelude_Types_prim__integerToNat($0) {
 switch(((0n<=$0)?1:0)) {
  case 0: return 0n;
  default: return $0;
 }
}

/* Prelude.EqOrd.compare */
function Prelude_EqOrd_compare_Ord_Integer($0, $1) {
 switch(Prelude_EqOrd_x3c_Ord_Integer($0, $1)) {
  case 1: return 0;
  case 0: {
   switch(Prelude_EqOrd_x3dx3d_Eq_Integer($0, $1)) {
    case 1: return 1;
    case 0: return 2;
   }
  }
 }
}

/* Prelude.EqOrd.> */
function Prelude_EqOrd_x3e_Ord_Int32($0, $1) {
 switch((($0>$1)?1:0)) {
  case 0: return 0;
  default: return 1;
 }
}

/* Prelude.EqOrd.>= */
function Prelude_EqOrd_x3ex3d_Ord_Int32($0, $1) {
 switch((($0>=$1)?1:0)) {
  case 0: return 0;
  default: return 1;
 }
}

/* Prelude.EqOrd.== */
function Prelude_EqOrd_x3dx3d_Eq_String($0, $1) {
 switch((($0===$1)?1:0)) {
  case 0: return 0;
  default: return 1;
 }
}

/* Prelude.EqOrd.== */
function Prelude_EqOrd_x3dx3d_Eq_Integer($0, $1) {
 switch((($0===$1)?1:0)) {
  case 0: return 0;
  default: return 1;
 }
}

/* Prelude.EqOrd.== */
function Prelude_EqOrd_x3dx3d_Eq_Int32($0, $1) {
 switch((($0===$1)?1:0)) {
  case 0: return 0;
  default: return 1;
 }
}

/* Prelude.EqOrd.< */
function Prelude_EqOrd_x3c_Ord_Integer($0, $1) {
 switch((($0<$1)?1:0)) {
  case 0: return 0;
  default: return 1;
 }
}

/* Prelude.EqOrd./= */
function Prelude_EqOrd_x2fx3d_Eq_String($0, $1) {
 switch(Prelude_EqOrd_x3dx3d_Eq_String($0, $1)) {
  case 1: return 0;
  case 0: return 1;
 }
}

/* Prelude.EqOrd.compareInteger : Integer -> Integer -> Ordering */
function Prelude_EqOrd_compareInteger($0, $1) {
 return Prelude_EqOrd_compare_Ord_Integer($0, $1);
}

/* Prelude.Interfaces.when : Applicative f => Bool -> Lazy (f ()) -> f () */
function Prelude_Interfaces_when($0, $1, $2) {
 switch($1) {
  case 1: return $2();
  case 0: return $0.a2(undefined)(undefined);
 }
}

/* Prelude.IO.map */
function Prelude_IO_map_Functor_IO($0, $1, $2) {
 const $3 = $1($2);
 return $0($3);
}

/* PrimIO.unsafePerformIO : IO a -> a */
function PrimIO_unsafePerformIO($0) {
 return PrimIO_unsafeCreateWorld(w => $0(w));
}

/* PrimIO.unsafeCreateWorld : (1 _ : ((1 _ : %World) -> a)) -> a */
function PrimIO_unsafeCreateWorld($0) {
 return $0(_idrisworld);
}

/* FFI.DOM.Document.documentElement : HasIO io => io RawElement */
function FFI_DOM_Document_documentElement($0) {
 return $0.a2(undefined)($6 => FFI_DOM_Document_prim__documentElement($6));
}

/* FFI.DOM.Document.body : HasIO io => io RawElement */
function FFI_DOM_Document_body($0) {
 return $0.a2(undefined)($6 => FFI_DOM_Document_prim__body($6));
}


try{__mainExpression_0()}catch(e){if(e instanceof IdrisError){console.log('ERROR: ' + e.message)}else{throw e} }
