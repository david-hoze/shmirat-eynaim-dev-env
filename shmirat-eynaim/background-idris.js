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

const Extension_Background_n__4822_9759_prim__setupContextMenuClick = ((w) => { window.__seBg.setupContextMenuClickHandler(); });
const Extension_Background_prim__verifyServer = ((w) => window.__seBg.serverVerifyConnection());
const Extension_Background_prim__trainClassifier = ((w) => { var s = window.__seState; if (s.trainingData.length < 10) return; var w128 = new Array(128).fill(0); var b = 0; var lr = 0.01; for (var iter = 0; iter < 100; iter++) { for (var ex of s.trainingData) { var dot = 0; for (var j = 0; j < 128; j++) dot += w128[j] * ex.descriptor[j]; var pred = 1 / (1 + Math.exp(-(dot + b))); var err = pred - ex.label; for (var j = 0; j < 128; j++) w128[j] -= lr * err * ex.descriptor[j]; b -= lr * err; } } s.classifierWeights = { weights: w128, bias: b }; console.log('[SE] Classifier trained on', s.trainingData.length, 'examples'); });
const Extension_Background_prim__toggle = ((w) => { var s = window.__seState; s.blockingEnabled = !s.blockingEnabled; window.__seBg.updateBadge(s.blockingEnabled); return { blockingEnabled: s.blockingEnabled, whitelist: s.whitelist }; });
const Extension_Background_prim__toStr = ((v, w) => typeof v === 'string' ? v : (v == null ? '' : String(v)));
const Extension_Background_prim__successResult = ((w) => ({ success: true }));
const Extension_Background_prim__setCloudMode = ((mode, w) => { window.__seState.cloudMode = mode || 'all'; });
const Extension_Background_prim__setApiKey = ((key, w) => { window.__seState.anthropicApiKey = key || ''; });
const Extension_Background_prim__serverSubmitDescriptor = ((msg, w) => window.__seBg.serverSubmitDescriptor(msg.descriptor, msg.label, msg.confidence));
const Extension_Background_prim__serverSubmitClassification = ((msg, w) => window.__seBg.handleServerSubmitClassification(msg.url, msg.containsWomen, msg.source, msg.confidence));
const Extension_Background_prim__serverBatchLookup = ((msg, w) => window.__seBg.handleServerBatchLookup(msg.urls || []));
const Extension_Background_prim__saveState = ((w) => { var s = window.__seState; browser.storage.local.set({ blockingEnabled: s.blockingEnabled, whitelist: s.whitelist, anthropicApiKey: s.anthropicApiKey, cloudMode: s.cloudMode, cloudCache: s.cloudCache, cloudCallsToday: s.cloudCallsToday, cloudCallsDate: s.cloudCallsDate, cloudSavedCount: s.cloudSavedCount, serverEnabled: s.serverEnabled, serverToken: s.serverToken, serverDeviceId: s.serverDeviceId }).catch(function(e) { console.error('[SE] saveState error:', e); }); });
const Extension_Background_prim__saveLearningData = ((w) => { var s = window.__seState; browser.storage.local.set({ knownFaces: s.knownFaces, knownSafeFaces: s.knownSafeFaces, manualBlocklist: s.manualBlocklist, manualSafelist: s.manualSafelist, trainingData: s.trainingData, classifierWeights: s.classifierWeights }).catch(function(e) { console.error('[SE] saveLearningData error:', e); }); });
const Extension_Background_prim__safeImage = ((msg, senderId, w) => { var s = window.__seState; var url = msg.url; if (!s.manualSafelist.includes(url)) s.manualSafelist.push(url); s.manualBlocklist = s.manualBlocklist.filter(function(u) { return u !== url; }); s.cloudCache[url] = { containsWomen: false, timestamp: Date.now() }; if (senderId >= 0) { try { browser.tabs.sendMessage(senderId, { type: 'safeAndLearn', url: url }).catch(function() {}); } catch(e) {} } return { success: true }; });
const Extension_Background_prim__resetLearning = ((w) => { var s = window.__seState; s.knownFaces = []; s.knownSafeFaces = []; s.manualBlocklist = []; s.manualSafelist = []; s.trainingData = []; s.classifierWeights = null; return { success: true }; });
const Extension_Background_prim__removeWhitelist = ((domain, w) => { var s = window.__seState; s.whitelist = s.whitelist.filter(function(d) { return d !== domain; }); return { blockingEnabled: s.blockingEnabled, whitelist: s.whitelist }; });
const Extension_Background_prim__reloadActiveTab = ((w) => { browser.tabs.query({active: true, currentWindow: true}).then(function(tabs) { if (tabs[0]) browser.tabs.reload(tabs[0].id); }).catch(function() {}); });
const Extension_Background_prim__prefetchServer = ((msg, w) => window.__seBg.prefetchServer(msg.urls || []));
const Extension_Background_prim__loadAllModels = ((modelPath, wasmPath, w) => { (async function() { try { await faceapi.tf.setBackend('webgl'); await faceapi.tf.ready(); console.log('[SE] TF backend: webgl'); } catch(e) { try { faceapi.tf.setWasmPaths(wasmPath); await faceapi.tf.setBackend('wasm'); await faceapi.tf.ready(); console.log('[SE] TF backend: wasm'); } catch(e2) { await faceapi.tf.setBackend('cpu'); await faceapi.tf.ready(); console.log('[SE] TF backend: cpu'); } } window.__seState.mlBackend = faceapi.tf.getBackend(); console.log('[SE] TF backend:', faceapi.tf.getBackend()); await faceapi.nets.tinyFaceDetector.loadFromUri(modelPath); await faceapi.nets.ageGenderNet.loadFromUri(modelPath); await faceapi.nets.faceLandmark68TinyNet.loadFromUri(modelPath); await faceapi.nets.faceRecognitionNet.loadFromUri(modelPath); console.log('[SE] Face models loaded'); try { var cocoModelUrl = modelPath + 'coco-ssd/model.json'; window.__seState.personDetector = await cocoSsd.load({ base: 'lite_mobilenet_v2', modelUrl: cocoModelUrl }); console.log('[SE] COCO-SSD loaded'); } catch(cocoErr) { console.warn('[SE] COCO-SSD failed:', cocoErr.message); window.__seState.personDetector = null; } window.__seState.modelsLoaded = true; console.log('[SE] All models loaded'); if (window.__seBg && window.__seBg.resolveModelsReady) { window.__seBg.resolveModelsReady(true); } })().catch(function(err) { console.error('[SE] Model loading failed:', err); window.__seState.modelsLoaded = false; if (window.__seBg && window.__seBg.resolveModelsReady) { window.__seBg.resolveModelsReady(false); } }); });
const Extension_Background_prim__learnSafe = ((msg, w) => { var s = window.__seState; var url = msg.url; var descriptors = msg.descriptors || []; if (!s.manualSafelist.includes(url)) s.manualSafelist.push(url); s.manualBlocklist = s.manualBlocklist.filter(function(u) { return u !== url; }); s.cloudCache[url] = { containsWomen: false, timestamp: Date.now() }; var now = Date.now(); for (var i = 0; i < descriptors.length; i++) { s.knownSafeFaces.push({ descriptor: descriptors[i], url: url, timestamp: now }); if (s.knownSafeFaces.length > 1000) s.knownSafeFaces.shift(); s.trainingData.push({ descriptor: descriptors[i], label: 0 }); if (s.trainingData.length > 500) s.trainingData.shift(); } return { success: true }; });
const Extension_Background_prim__learnBlock = ((msg, w) => { var s = window.__seState; var url = msg.url; var descriptors = msg.descriptors || []; if (!s.manualBlocklist.includes(url)) s.manualBlocklist.push(url); s.manualSafelist = s.manualSafelist.filter(function(u) { return u !== url; }); s.cloudCache[url] = { containsWomen: true, timestamp: Date.now() }; var now = Date.now(); for (var i = 0; i < descriptors.length; i++) { s.knownFaces.push({ descriptor: descriptors[i], url: url, timestamp: now }); if (s.knownFaces.length > 1000) s.knownFaces.shift(); s.trainingData.push({ descriptor: descriptors[i], label: 1 }); if (s.trainingData.length > 500) s.trainingData.shift(); } return { success: true }; });
const Extension_Background_prim__initState = ((w) => { window.__seState = { blockingEnabled: true, whitelist: [], knownFaces: [], knownSafeFaces: [], manualBlocklist: [], manualSafelist: [], trainingData: [], classifierWeights: null, cloudCache: {}, cloudCallsToday: 0, cloudCallsDate: '', cloudSavedCount: 0, anthropicApiKey: '', cloudMode: 'all', serverToken: '', serverEnabled: true, serverDeviceId: '', debugTiming: false, debugEvents: [], lastContextMenuImageUrl: null, modelsLoaded: false, mlBackend: 'none', personDetector: null }; });
const Extension_Background_prim__initBgServer = ((w) => { var bg = window.__seBg; bg.serverFetch = function(endpoint, opts) { var s = window.__seState; if (!s.serverEnabled || !s.serverToken) return Promise.resolve(null); var url = bg.SERVER_URL + endpoint; var ctrl = new AbortController(); var t = setTimeout(function() { ctrl.abort(); }, 5000); return fetch(url, Object.assign({}, opts || {}, { signal: ctrl.signal, headers: Object.assign({ 'Authorization': 'Bearer ' + s.serverToken, 'Content-Type': 'application/json' }, (opts && opts.headers) || {}) })).then(function(res) { clearTimeout(t); if (!res.ok) { console.warn('[SE] Server error:', res.status, endpoint); return null; } return res.json(); }).catch(function(err) { clearTimeout(t); console.warn('[SE] Server fetch failed:', err.message); return null; }); }; bg.serverBatchLookup = function(urlHashes) { if (urlHashes.length === 0) return Promise.resolve({}); var hashes = urlHashes.map(function(h) { return h.hash; }); return bg.serverFetch('/api/classifications/batch', { method: 'POST', body: JSON.stringify({ hashes: hashes }) }).then(function(data) { if (!data || !data.results) return {}; var result = {}; for (var i = 0; i < urlHashes.length; i++) { var e = urlHashes[i]; if (data.results[e.hash]) result[e.url] = data.results[e.hash]; } return result; }); }; bg.serverSubmitClassification = function(hash, cw, source, conf) { return bg.serverFetch('/api/classifications', { method: 'POST', body: JSON.stringify({ hash: hash, containsWomen: cw, source: source, confidence: conf || 0.8 }) }); }; bg.serverSubmitDescriptor = function(descriptor, label, conf) { var buffer = new Float32Array(descriptor).buffer; var base64 = btoa(String.fromCharCode.apply(null, new Uint8Array(buffer))); return bg.serverFetch('/api/descriptors', { method: 'POST', body: JSON.stringify({ descriptor: base64, label: label, confidence: conf }) }); }; bg.serverAutoRegister = function() { var s = window.__seState; if (!s.serverDeviceId) { var bytes = new Uint8Array(16); crypto.getRandomValues(bytes); s.serverDeviceId = 'ext-' + Array.from(bytes, function(b) { return b.toString(16).padStart(2, '0'); }).join(''); } var ctrl = new AbortController(); var t = setTimeout(function() { ctrl.abort(); }, 5000); return fetch(bg.SERVER_URL + '/api/register', { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: s.serverDeviceId }) }).then(function(res) { clearTimeout(t); if (!res.ok) { console.warn('[SE] Server registration failed:', res.status); return false; } return res.json().then(function(data) { if (data.token) { s.serverToken = data.token; s.serverEnabled = true; console.log('[SE] Auto-registered with server'); return true; } return false; }); }).catch(function(err) { clearTimeout(t); console.warn('[SE] Server registration error:', err.message); return false; }); }; bg.serverVerifyConnection = function() { return fetch(bg.SERVER_URL + '/api/stats').then(function(res) { if (!res.ok) return { ok: false, error: 'HTTP ' + res.status }; return res.json().then(function(data) { return { ok: true, stats: data }; }); }).catch(function(err) { return { ok: false, error: err.message }; }); }; bg.serverBatch = []; bg.serverBatchTimer = null; bg.flushServerBatch = function() { bg.serverBatchTimer = null; var batch = bg.serverBatch; bg.serverBatch = []; if (batch.length === 0) return; bg.debugLog('Server batch flush:', batch.length, 'URLs'); var t0 = performance.now(); bg.serverReadyPromise.then(function(ready) { var s = window.__seState; if (!ready || !s.serverEnabled || !s.serverToken) { batch.forEach(function(item) { item.resolve(null); }); return; } return Promise.all(batch.map(function(item) { return bg.hashUrl(item.url).then(function(hash) { return { url: item.url, hash: hash }; }); })).then(function(urlHashes) { return bg.serverBatchLookup(urlHashes); }).then(function(results) { var hits = Object.keys(results).length; bg.debugLog('Server batch done:', Math.round(performance.now() - t0), 'ms,', hits, 'hits /', batch.length, 'requested'); for (var i = 0; i < batch.length; i++) { var item = batch[i]; var sv = results[item.url]; if (sv) { var tv = (sv.voteBlock || 0) + (sv.voteSafe || 0); if (tv >= bg.SERVER_VOTE_THRESHOLD) { item.resolve({ containsWomen: sv.containsWomen, reason: 'server', priority: 2 }); continue; } } item.resolve(null); } }); }).catch(function(err) { bg.debugLog('Server batch error:', err.message); batch.forEach(function(item) { item.resolve(null); }); }); }; bg.enqueueServerLookup = function(url) { return new Promise(function(resolve) { bg.serverBatch.push({ url: url, resolve: resolve }); if (!bg.serverBatchTimer) bg.serverBatchTimer = setTimeout(bg.flushServerBatch, 100); if (bg.serverBatch.length >= 20) { clearTimeout(bg.serverBatchTimer); bg.flushServerBatch(); } }); }; bg.resizeImageDataUrl = function(dataUrl, maxDim) { return fetch(dataUrl).then(function(r) { return r.blob(); }).then(function(blob) { return createImageBitmap(blob).then(function(bm) { var w = bm.width; var h = bm.height; if (w <= maxDim && h <= maxDim) { bm.close(); return dataUrl; } var sc = maxDim / Math.max(w, h); w = Math.round(w * sc); h = Math.round(h * sc); var c = new OffscreenCanvas(w, h); var ctx = c.getContext('2d'); ctx.drawImage(bm, 0, 0, w, h); bm.close(); return c.convertToBlob({ type: 'image/jpeg', quality: 0.8 }).then(function(rb) { return new Promise(function(resolve) { var reader = new FileReader(); reader.onload = function() { resolve(reader.result); }; reader.readAsDataURL(rb); }); }); }); }); }; bg.classifyWithHaiku = function(imageDataUrl) { var s = window.__seState; if (!s.anthropicApiKey) return Promise.resolve(null); return bg.resizeImageDataUrl(imageDataUrl, 512).then(function(resized) { var match = resized.match(/^data:(image\/\w+);base64,(.+)$/); if (!match) return null; return fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': s.anthropicApiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 50, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } }, { type: 'text', text: 'Does this image contain a woman or girl? Answer with exactly one word: YES or NO.' }] }] }) }).then(function(resp) { if (!resp.ok) { console.warn('[SE] Haiku API error:', resp.status); return null; } return resp.json(); }).then(function(data) { if (!data) return null; var answer = (data.content && data.content[0] && data.content[0].text || '').trim().toUpperCase(); var today = new Date().toISOString().slice(0, 10); if (s.cloudCallsDate !== today) { s.cloudCallsDate = today; s.cloudCallsToday = 0; } s.cloudCallsToday++; return { containsWomen: answer === 'YES' || answer.indexOf('YES') === 0, source: 'haiku', raw: answer }; }); }).catch(function(e) { console.warn('[SE] Haiku error:', e.message); return null; }); }; bg.acquireApiSlot = function() { if (bg.apiSem.active < bg.API_RATE_LIMIT) { bg.apiSem.active++; return Promise.resolve(true); } return new Promise(function(resolve) { bg.apiSem.queue.push(resolve); }); }; bg.releaseApiSlot = function() { bg.apiSem.active--; if (bg.apiSem.queue.length > 0) { var next = bg.apiSem.queue.shift(); bg.apiSem.active++; next(true); } }; bg.rateLimitedHaikuCall = function(imageDataUrl) { return bg.acquireApiSlot().then(function() { return bg.classifyWithHaiku(imageDataUrl).then(function(r) { bg.releaseApiSlot(); return r; }).catch(function(e) { bg.releaseApiSlot(); throw e; }); }); }; bg.cloudClassify = function(imageUrl, imageDataUrl, localResult) { var s = window.__seState; if (s.cloudCache[imageUrl]) { s.cloudSavedCount++; return Promise.resolve(Object.assign({}, s.cloudCache[imageUrl], { source: 'cloud-cache' })); } if (bg.inFlightUrls.has(imageUrl)) return bg.inFlightUrls.get(imageUrl); if (s.cloudMode === 'uncertain' && localResult) { if (localResult.source === 'user') return Promise.resolve(null); if (localResult.knnDistance !== undefined && localResult.knnDistance < 0.3) { s.cloudSavedCount++; return Promise.resolve(null); } if (localResult.classifierConfidence !== undefined && localResult.classifierConfidence > 0.9) { s.cloudSavedCount++; return Promise.resolve(null); } } var p = bg.rateLimitedHaikuCall(imageDataUrl).then(function(r) { bg.inFlightUrls.delete(imageUrl); if (r) { s.cloudCache[imageUrl] = { containsWomen: r.containsWomen, timestamp: Date.now() }; var keys = Object.keys(s.cloudCache); if (keys.length > bg.MAX_CLOUD_CACHE) { var sorted = keys.sort(function(a, b) { return s.cloudCache[a].timestamp - s.cloudCache[b].timestamp; }); for (var i = 0; i < sorted.length - bg.MAX_CLOUD_CACHE; i++) delete s.cloudCache[sorted[i]]; } console.log('[SE] Haiku:', r.raw, 'for', imageUrl.substring(0, 60)); } return r; }).catch(function() { bg.inFlightUrls.delete(imageUrl); return null; }); bg.inFlightUrls.set(imageUrl, p); return p; }; console.log('[SE] BG server+cloud initialized'); });
const Extension_Background_prim__initBgPipeline = ((w) => { var bg = window.__seBg; bg.runMLInference = function(url, imageDataUrl) { var s = window.__seState; return bg.dataUrlToImageData(imageDataUrl).then(function(imageData) { var hasLearning = s.knownFaces.length > 0 || s.knownSafeFaces.length > 0 || s.classifierWeights !== null; var faceTensor = bg.imageDataToTensor(imageData); var personTensor = s.personDetector ? bg.imageDataToTensor(imageData) : null; var faceP; if (hasLearning) { faceP = faceapi.detectAllFaces(faceTensor, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 })).withFaceLandmarks(true).withFaceDescriptors().withAgeAndGender(); } else { faceP = faceapi.detectAllFaces(faceTensor, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 })).withAgeAndGender(); } var personP = personTensor ? bg.runPersonDetection(personTensor) : Promise.resolve([]); var t0 = performance.now(); var timeout = new Promise(function(_, rej) { setTimeout(function() { rej(new Error('detection_timeout')); }, 60000); }); return Promise.race([Promise.all([faceP, personP]), timeout]).then(function(results) { faceTensor.dispose(); if (personTensor) personTensor.dispose(); var dets = results[0]; var persons = results[1]; console.log('[SE] Detection:', Math.round(performance.now() - t0), 'ms, faces:', dets ? dets.length : 0, 'persons:', persons ? persons.length : 0); var cw = false; var reason = ''; var descriptors = []; if (dets && dets.length > 0) { for (var i = 0; i < dets.length; i++) { var det = dets[i]; var fb = false; var fs = false; if (!(det.gender === 'male' && det.genderProbability >= 0.65)) fb = true; if (hasLearning && det.descriptor) { var desc = Array.from(det.descriptor); descriptors.push(desc); if (bg.matchesKnownBlockedFace(desc)) fb = true; if (bg.matchesKnownSafeFace(desc)) fs = true; if (s.classifierWeights && bg.classifyDescriptor(desc) > 0.5) fb = true; } if (fb && !fs) { cw = true; reason = 'face'; break; } } } else if (persons && persons.length > 0) { cw = true; reason = 'person-no-face'; } return { containsWomen: cw, reason: reason, faceCount: dets ? dets.length : 0, personCount: persons ? persons.length : 0, descriptors: descriptors }; }).catch(function(err) { try { faceTensor.dispose(); } catch(e) {} try { if (personTensor) personTensor.dispose(); } catch(e) {} throw err; }); }).catch(function(err) { console.warn('[SE] ML inference error:', url.substring(0, 60), err.message); return { containsWomen: true, reason: 'decode-error' }; }); }; bg.extractDescriptorsFromDataUrl = function(imageDataUrl) { return bg.modelsReadyPromise.then(function(loaded) { if (!loaded) return []; return bg.dataUrlToImageData(imageDataUrl).then(function(imageData) { var tensor = bg.imageDataToTensor(imageData); return faceapi.detectAllFaces(tensor, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 })).withFaceLandmarks(true).withFaceDescriptors().then(function(dets) { tensor.dispose(); return dets.map(function(d) { return Array.from(d.descriptor); }); }).catch(function(e) { tensor.dispose(); throw e; }); }); }).catch(function(err) { console.error('[SE] Descriptor extraction error:', err); return []; }); }; bg.classifyImage = function(url, imageDataUrl) { var s = window.__seState; var su = url.substring(0, 60); if (s.manualBlocklist.includes(url)) { bg.debugLog('classifyImage USER BLOCK:', su); return Promise.resolve({ containsWomen: true, reason: 'user-block' }); } if (s.manualSafelist.includes(url)) { bg.debugLog('classifyImage USER SAFE:', su); return Promise.resolve({ containsWomen: false, reason: 'user-safe' }); } if (s.cloudCache[url]) { bg.debugLog('classifyImage CACHE HIT:', su); return Promise.resolve({ containsWomen: s.cloudCache[url].containsWomen, reason: 'cloud-cache' }); } if (bg.inFlight.has(url)) { bg.debugLog('classifyImage DEDUP:', su); return bg.inFlight.get(url); } bg.debugLog('classifyImage START:', su); var t0 = performance.now(); var sources = []; if (s.serverEnabled && s.serverToken) { sources.push(bg.enqueueServerLookup(url).then(function(r) { return r ? Object.assign(r, { priority: 2 }) : null; }).catch(function() { return null; })); } var mlP = bg.modelsReadyPromise.then(function(loaded) { if (!loaded) return { containsWomen: true, reason: 'models-not-loaded', priority: 1 }; return bg.runMLInference(url, imageDataUrl).then(function(r) { r.priority = 1; if (s.serverEnabled && s.serverToken) bg.hashUrl(url).then(function(hash) { bg.serverSubmitClassification(hash, r.containsWomen, r.reason, 0.8); }).catch(function() {}); return r; }); }).catch(function(err) { console.error('[SE] ML error:', err.message); return { containsWomen: true, reason: 'ml-error', priority: 1 }; }); sources.push(mlP); if (s.anthropicApiKey && s.cloudMode !== 'never') { if (s.cloudMode === 'all') { sources.push(bg.cloudClassify(url, imageDataUrl, null).then(function(r) { return r ? { containsWomen: r.containsWomen, reason: 'haiku', priority: 3, raw: r.raw } : null; }).catch(function() { return null; })); } else { sources.push(mlP.then(function(ml) { if (ml.knnDistance !== undefined && ml.knnDistance < 0.3) { s.cloudSavedCount++; return null; } if (ml.classifierConfidence !== undefined && ml.classifierConfidence > 0.9) { s.cloudSavedCount++; return null; } return bg.cloudClassify(url, imageDataUrl, { source: ml.reason, knnDistance: ml.knnDistance, classifierConfidence: ml.classifierConfidence }).then(function(r) { return r ? { containsWomen: r.containsWomen, reason: 'haiku', priority: 3, raw: r.raw } : null; }); }).catch(function() { return null; })); } } var pNames = ['cache', 'ML', 'server', 'haiku', 'user']; var pipeline = new Promise(function(resolve) { var best = null; var mlDesc = null; var resolved = false; var rem = sources.length; function handle(result) { if (!result) { rem--; if (rem === 0 && !resolved) { resolved = true; resolve(best || { containsWomen: false, reason: 'no-sources' }); } return; } var elapsed = Math.round(performance.now() - t0); bg.debugLog('  ' + pNames[result.priority] + ':', result.containsWomen ? 'BLOCK' : 'SAFE', '(' + elapsed + 'ms)', su); if (result.priority === 1 && result.descriptors) mlDesc = result.descriptors; if (best && result.priority < best.priority && !result.containsWomen) { bg.debugLog('  IGNORED safe', su); rem--; if (rem === 0 && !resolved) { resolved = true; resolve(best); } return; } if (best && best.containsWomen && !result.containsWomen && result.priority < 4) { bg.debugLog('  STRICT: keeping block', su); rem--; if (rem === 0 && !resolved) { resolved = true; resolve(best); } return; } var isFirst = !best; var changed = best && result.containsWomen !== best.containsWomen; best = result; s.cloudCache[url] = { containsWomen: result.containsWomen, timestamp: Date.now() }; if (!resolved) { resolved = true; resolve(result); } if (!isFirst && changed) { console.log('[SE] Override:', result.reason, result.containsWomen ? 'block' : 'safe', url.substring(0, 60)); bg.notifyTabs(url, result.containsWomen, result.reason); } if (result.priority === 3) { if (mlDesc && mlDesc.length > 0) bg.feedHaikuIntoLearning(url, { containsWomen: result.containsWomen }, mlDesc); if (s.serverEnabled && s.serverToken) bg.hashUrl(url).then(function(hash) { bg.serverSubmitClassification(hash, result.containsWomen, 'haiku', 0.95); }).catch(function() {}); } rem--; } sources.forEach(function(src) { src.then(handle).catch(function() { handle(null); }); }); }); bg.inFlight.set(url, pipeline); pipeline.then(function() { bg.inFlight.delete(url); }).catch(function() { bg.inFlight.delete(url); }); return pipeline; }; bg.prefetchServer = function(urls) { if (urls.length === 0) return Promise.resolve({ ok: true, cached: 0 }); return bg.stateReadyPromise.then(function() { return Promise.race([bg.serverReadyPromise, new Promise(function(r) { setTimeout(function() { r(false); }, 2000); })]); }).then(function(ready) { var s = window.__seState; if (!ready || !s.serverEnabled || !s.serverToken) return { ok: true, cached: 0 }; var uncached = urls.filter(function(u) { return !s.cloudCache[u]; }); if (uncached.length === 0) return { ok: true, cached: 0 }; bg.debugLog('prefetchServer:', urls.length, 'URLs'); var t0 = performance.now(); return Promise.all(uncached.map(function(u) { return bg.hashUrl(u).then(function(h) { return { url: u, hash: h }; }); })).then(function(uh) { return bg.serverBatchLookup(uh); }).then(function(results) { var cached = 0; for (var i = 0; i < uncached.length; i++) { var u = uncached[i]; var sv = results[u]; if (sv) { var tv = (sv.voteBlock || 0) + (sv.voteSafe || 0); if (tv >= bg.SERVER_VOTE_THRESHOLD) { s.cloudCache[u] = { containsWomen: sv.containsWomen, timestamp: Date.now() }; cached++; } } } bg.debugLog('prefetchServer done:', Math.round(performance.now() - t0), 'ms,', cached, 'cached /', uncached.length, 'queried'); return { ok: true, cached: cached }; }); }).catch(function() { return { ok: true, cached: 0 }; }); }; bg.checkCacheGated = function(url) { return bg.stateReadyPromise.then(function() { var s = window.__seState; if (s.manualBlocklist.includes(url)) return { hit: true, containsWomen: true, reason: 'user-block' }; if (s.manualSafelist.includes(url)) return { hit: true, containsWomen: false, reason: 'user-safe' }; if (s.cloudCache[url]) return { hit: true, containsWomen: s.cloudCache[url].containsWomen, reason: 'cloud-cache' }; return { hit: false }; }); }; bg.fetchImageAsDataUrl = function(url) { return fetch(url).then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); }).then(function(blob) { return new Promise(function(resolve, reject) { var reader = new FileReader(); reader.onload = function() { resolve(reader.result); }; reader.onerror = reject; reader.readAsDataURL(blob); }); }).catch(function(err) { console.error('[SE] Failed to fetch image:', url, err); return null; }); }; bg.handleServerBatchLookup = function(urls) { return Promise.all(urls.map(function(u) { return bg.hashUrl(u).then(function(h) { return { url: u, hash: h }; }); })).then(function(uh) { return bg.serverBatchLookup(uh); }); }; bg.handleServerSubmitClassification = function(url, cw, source, conf) { return bg.hashUrl(url).then(function(hash) { return bg.serverSubmitClassification(hash, cw, source, conf); }).then(function() { return { success: true }; }); }; bg.setupContextMenuClickHandler = function() { var menusAPI = browser.menus || browser.contextMenus; if (!menusAPI) return; menusAPI.onClicked.addListener(function(info, tab) { var s = window.__seState; var imageUrl = info.srcUrl || s.lastContextMenuImageUrl; s.lastContextMenuImageUrl = null; if (!imageUrl) return; var tabId = tab ? tab.id : null; if (info.menuItemId === 'se-block-image' || info.menuItemId === 'shmirat-block') { if (!s.manualBlocklist.includes(imageUrl)) s.manualBlocklist.push(imageUrl); s.manualSafelist = s.manualSafelist.filter(function(u) { return u !== imageUrl; }); s.cloudCache[imageUrl] = { containsWomen: true, timestamp: Date.now() }; bg.showTemporaryBadge('\u2713', '#2ecc71'); if (tabId) browser.tabs.sendMessage(tabId, { type: 'blockAndLearn', url: imageUrl }).catch(function() {}); } else if (info.menuItemId === 'se-safe-image' || info.menuItemId === 'shmirat-safe') { if (!s.manualSafelist.includes(imageUrl)) s.manualSafelist.push(imageUrl); s.manualBlocklist = s.manualBlocklist.filter(function(u) { return u !== imageUrl; }); s.cloudCache[imageUrl] = { containsWomen: false, timestamp: Date.now() }; if (tabId) browser.tabs.sendMessage(tabId, { type: 'safeAndLearn', url: imageUrl }).catch(function() {}); } }); }; console.log('[SE] BG pipeline initialized'); });
const Extension_Background_prim__initBgCore = ((w) => { var bg = window.__seBg = {}; bg.SERVER_URL = 'http://localhost:8080'; bg.SERVER_VOTE_THRESHOLD = 2; bg.API_RATE_LIMIT = 10; bg.MAX_CLOUD_CACHE = 5000; bg.inFlight = new Map(); bg.inFlightUrls = new Map(); bg.apiSem = { active: 0, queue: [] }; bg.debugTiming = false; bg.t0 = performance.now(); bg.debugEvents = []; bg.stateReadyPromise = new Promise(function(r) { bg.resolveStateReady = r; }); bg.serverReadyPromise = new Promise(function(r) { bg.resolveServerReady = r; }); bg.modelsReadyPromise = new Promise(function(r) { bg.resolveModelsReady = r; }); bg.debugLog = function() { if (!bg.debugTiming) return; var a = Array.from(arguments); var e = '[SE:' + Math.round(performance.now() - bg.t0) + 'ms] ' + a.join(' '); console.log(e); bg.debugEvents.push({ time: Math.round(performance.now() - bg.t0), msg: a.join(' ') }); }; bg.dataUrlToImageData = function(dataUrl) { return fetch(dataUrl).then(function(r) { return r.blob(); }).then(function(blob) { return createImageBitmap(blob); }).then(function(bm) { var w = bm.width; var h = bm.height; var m = 416; if (w > m || h > m) { var sc = m / Math.max(w, h); w = Math.round(w * sc); h = Math.round(h * sc); } var c = new OffscreenCanvas(w, h); var ctx = c.getContext('2d'); ctx.drawImage(bm, 0, 0, w, h); bm.close(); return ctx.getImageData(0, 0, w, h); }); }; bg.imageDataToTensor = function(id) { var d = id.data; var w = id.width; var h = id.height; var rgb = new Uint8Array(w * h * 3); for (var i = 0, j = 0; i < d.length; i += 4, j += 3) { rgb[j] = d[i]; rgb[j+1] = d[i+1]; rgb[j+2] = d[i+2]; } return faceapi.tf.tensor3d(rgb, [h, w, 3], 'int32'); }; bg.euclideanDistance = function(a, b) { var sum = 0; for (var i = 0; i < a.length; i++) { var d = a[i] - b[i]; sum += d * d; } return Math.sqrt(sum); }; bg.matchesKnownBlockedFace = function(desc) { var s = window.__seState; for (var i = 0; i < s.knownFaces.length; i++) { if (bg.euclideanDistance(desc, s.knownFaces[i].descriptor) < 0.5) return true; } return false; }; bg.matchesKnownSafeFace = function(desc) { var s = window.__seState; for (var i = 0; i < s.knownSafeFaces.length; i++) { if (bg.euclideanDistance(desc, s.knownSafeFaces[i].descriptor) < 0.4) return true; } return false; }; bg.classifyDescriptor = function(desc) { var s = window.__seState; if (!s.classifierWeights) return 0; var z = s.classifierWeights.bias; for (var i = 0; i < desc.length; i++) { z += s.classifierWeights.weights[i] * desc[i]; } return 1 / (1 + Math.exp(-z)); }; bg.runPersonDetection = function(tensor) { var s = window.__seState; if (!s.personDetector) return Promise.resolve([]); return s.personDetector.detect(tensor, 20, 0.3).then(function(preds) { return preds.filter(function(p) { return p.class === 'person' && p.score > 0.5 && p.bbox[2] > 60 && p.bbox[3] > 60; }); }).catch(function(e) { console.warn('[SE] Person detection error:', e.message); return []; }); }; bg.hashUrl = function(url) { var enc = new TextEncoder(); return crypto.subtle.digest('SHA-256', enc.encode(url)).then(function(buf) { return Array.from(new Uint8Array(buf)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('').substring(0, 16); }); }; bg.notifyTabs = function(url, cw, reason) { browser.tabs.query({}).then(function(tabs) { for (var i = 0; i < tabs.length; i++) { browser.tabs.sendMessage(tabs[i].id, { type: 'classificationOverride', url: url, containsWomen: cw, reason: reason }).catch(function() {}); } }); }; bg.updateBadge = function(on) { browser.browserAction.setBadgeText({ text: on ? 'ON' : 'OFF' }); browser.browserAction.setBadgeBackgroundColor({ color: on ? '#2ecc71' : '#888' }); }; bg.showTemporaryBadge = function(text, color) { browser.browserAction.setBadgeText({ text: text }); browser.browserAction.setBadgeBackgroundColor({ color: color }); setTimeout(function() { bg.updateBadge(window.__seState.blockingEnabled); }, 2000); }; bg.feedHaikuIntoLearning = function(imageUrl, haikuResult, descriptors) { if (!haikuResult || !descriptors || descriptors.length === 0) return; var s = window.__seState; var now = Date.now(); var block = haikuResult.containsWomen; for (var i = 0; i < descriptors.length; i++) { var d = descriptors[i]; if (block) { s.knownFaces.push({ descriptor: d, url: imageUrl, timestamp: now, source: 'haiku' }); if (s.knownFaces.length > 1000) s.knownFaces.shift(); s.trainingData.push({ descriptor: d, label: 1, source: 'haiku' }); } else { s.knownSafeFaces.push({ descriptor: d, url: imageUrl, timestamp: now, source: 'haiku' }); if (s.knownSafeFaces.length > 1000) s.knownSafeFaces.shift(); s.trainingData.push({ descriptor: d, label: 0, source: 'haiku' }); } if (s.trainingData.length > 500) s.trainingData.shift(); } }; bg.enableDebugTiming = function(enabled) { bg.debugTiming = enabled !== false; bg.debugEvents.length = 0; console.log('[SE] Debug timing:', bg.debugTiming ? 'ON' : 'OFF'); return { ok: true }; }; bg.getDebugEvents = function() { return bg.debugEvents; }; console.log('[SE] BG core initialized'); });
const Extension_Background_prim__importLearning = ((msg, w) => { var s = window.__seState; var d = msg.data || {}; if (d.knownFaces) { s.knownFaces = s.knownFaces.concat(d.knownFaces); if (s.knownFaces.length > 1000) s.knownFaces = s.knownFaces.slice(-1000); } if (d.knownSafeFaces) { s.knownSafeFaces = s.knownSafeFaces.concat(d.knownSafeFaces); if (s.knownSafeFaces.length > 1000) s.knownSafeFaces = s.knownSafeFaces.slice(-1000); } if (d.manualBlocklist) { for (var i = 0; i < d.manualBlocklist.length; i++) { if (!s.manualBlocklist.includes(d.manualBlocklist[i])) s.manualBlocklist.push(d.manualBlocklist[i]); } } if (d.manualSafelist) { for (var i = 0; i < d.manualSafelist.length; i++) { if (!s.manualSafelist.includes(d.manualSafelist[i])) s.manualSafelist.push(d.manualSafelist[i]); } } if (d.trainingData) { s.trainingData = s.trainingData.concat(d.trainingData); if (s.trainingData.length > 500) s.trainingData = s.trainingData.slice(-500); } if (d.classifierWeights) s.classifierWeights = d.classifierWeights; return { success: true }; });
const Extension_Background_prim__getStats = ((w) => { var s = window.__seState; return browser.tabs.query({active: true, currentWindow: true}).then(function(tabs) { var tab = tabs[0]; if (!tab) return { scanned: 0, hidden: 0, backend: s.mlBackend, modelsLoaded: s.modelsLoaded, personDetectorLoaded: s.personDetector !== null }; return browser.tabs.sendMessage(tab.id, {type: 'getStats'}).then(function(cs) { return Object.assign(cs || {}, { backend: s.mlBackend, modelsLoaded: s.modelsLoaded, personDetectorLoaded: s.personDetector !== null }); }).catch(function() { return { scanned: 0, hidden: 0, backend: s.mlBackend, modelsLoaded: s.modelsLoaded, personDetectorLoaded: s.personDetector !== null }; }); }); });
const Extension_Background_prim__getState = ((domain, w) => { var s = window.__seState; return { blockingEnabled: s.blockingEnabled, whitelist: s.whitelist, domain: domain }; });
const Extension_Background_prim__getServerConfig = ((w) => { var s = window.__seState; return { serverUrl: 'http://localhost:8080', hasToken: !!s.serverToken, serverEnabled: s.serverEnabled }; });
const Extension_Background_prim__getLearningStats = ((w) => { var s = window.__seState; return { knownFacesCount: s.knownFaces.length, knownSafeFacesCount: s.knownSafeFaces.length, trainingDataCount: s.trainingData.length, classifierTrained: s.classifierWeights !== null }; });
const Extension_Background_prim__getDebugStatus = ((w) => { var s = window.__seState; return { blockingEnabled: s.blockingEnabled, whitelistCount: s.whitelist.length, knownFacesCount: s.knownFaces.length, knownSafeFacesCount: s.knownSafeFaces.length, trainingDataCount: s.trainingData.length, classifierTrained: s.classifierWeights !== null }; });
const Extension_Background_prim__getDebugEvents = ((w) => window.__seBg.getDebugEvents());
const Extension_Background_prim__getCloudStats = ((w) => { var s = window.__seState; return { cloudMode: s.cloudMode, hasApiKey: !!s.anthropicApiKey, cloudCallsToday: s.cloudCallsToday || 0, cloudSavedCount: s.cloudSavedCount || 0, cloudCacheSize: Object.keys(s.cloudCache || {}).length }; });
const Extension_Background_prim__getBlockingState = ((tabUrl, w) => { var s = window.__seState; var dominated = false; try { var h = new URL(tabUrl).hostname; dominated = s.whitelist.some(function(d) { return h === d || h.endsWith('.' + d); }); } catch(e) {} return { blockingEnabled: s.blockingEnabled, whitelisted: dominated, manualBlocklist: s.manualBlocklist, manualSafelist: s.manualSafelist, serverEnabled: s.serverEnabled }; });
const Extension_Background_prim__fetchImage = ((url, w) => window.__seBg.fetchImageAsDataUrl(url));
const Extension_Background_prim__extractDescriptors = ((imageDataUrl, w) => window.__seBg.extractDescriptorsFromDataUrl(imageDataUrl));
const Extension_Background_prim__exportLearning = ((w) => { var s = window.__seState; return { knownFaces: s.knownFaces, knownSafeFaces: s.knownSafeFaces, manualBlocklist: s.manualBlocklist, manualSafelist: s.manualSafelist, trainingData: s.trainingData, classifierWeights: s.classifierWeights }; });
const Extension_Background_prim__enableDebugTiming = ((enabled, w) => window.__seBg.enableDebugTiming(enabled));
const Extension_Background_prim__emptyResult = ((w) => ({}));
const Extension_Background_prim__contextMenuImage = ((url, w) => { window.__seState.lastContextMenuImageUrl = url || null; return { ok: true }; });
const Extension_Background_prim__clearCloudCache = ((w) => { var s = window.__seState; var count = Object.keys(s.cloudCache).length; s.cloudCache = {}; console.log('[SE] Cloud cache cleared:', count, 'entries'); return { success: true, cleared: count }; });
const Extension_Background_prim__classifyImage = ((url, imageDataUrl, w) => window.__seBg.classifyImage(url, imageDataUrl));
const Extension_Background_prim__classifyCloud = ((msg, w) => { var bg = window.__seBg; var s = window.__seState; var imageUrl = msg.imageUrl; var imageDataUrl = msg.imageDataUrl; var descriptors = msg.descriptors || []; if (!s.anthropicApiKey) return Promise.resolve(null); if (s.cloudMode === 'never') return Promise.resolve(null); if (s.cloudCache[imageUrl]) { s.cloudSavedCount++; return Promise.resolve({ containsWomen: s.cloudCache[imageUrl].containsWomen, source: 'cloud-cache' }); } return bg.cloudClassify(imageUrl, imageDataUrl, null).then(function(r) { if (r && descriptors.length > 0) bg.feedHaikuIntoLearning(imageUrl, r, descriptors); return r; }); });
const Extension_Background_prim__checkCache = ((url, w) => window.__seBg.checkCacheGated(url));
const Extension_Background_prim__blockImage = ((msg, senderId, w) => { var s = window.__seState; var url = msg.url; if (!s.manualBlocklist.includes(url)) s.manualBlocklist.push(url); s.manualSafelist = s.manualSafelist.filter(function(u) { return u !== url; }); s.cloudCache[url] = { containsWomen: true, timestamp: Date.now() }; if (senderId >= 0) { try { browser.tabs.sendMessage(senderId, { type: 'blockAndLearn', url: url }).catch(function() {}); } catch(e) {} } return { success: true }; });
const Extension_Background_prim__asyncInit = ((w) => { (async function() { try { var bg = window.__seBg; var statePromise = browser.storage.local.get(['blockingEnabled','whitelist','anthropicApiKey','cloudMode','cloudCache','cloudCallsToday','cloudCallsDate','cloudSavedCount','serverEnabled','serverToken','serverDeviceId','knownFaces','knownSafeFaces','manualBlocklist','manualSafelist','trainingData','classifierWeights']).then(function(d) { var s = window.__seState; if (d.blockingEnabled !== undefined) s.blockingEnabled = d.blockingEnabled; if (d.whitelist) s.whitelist = d.whitelist; if (d.anthropicApiKey !== undefined) s.anthropicApiKey = d.anthropicApiKey; if (d.cloudMode) s.cloudMode = d.cloudMode; if (d.cloudCache) s.cloudCache = d.cloudCache; if (d.cloudCallsToday !== undefined) s.cloudCallsToday = d.cloudCallsToday; if (d.cloudCallsDate !== undefined) s.cloudCallsDate = d.cloudCallsDate; if (d.cloudSavedCount !== undefined) s.cloudSavedCount = d.cloudSavedCount; if (d.serverEnabled !== undefined) s.serverEnabled = d.serverEnabled; if (d.serverToken) s.serverToken = d.serverToken; if (d.serverDeviceId) s.serverDeviceId = d.serverDeviceId; if (d.knownFaces) s.knownFaces = d.knownFaces; if (d.knownSafeFaces) s.knownSafeFaces = d.knownSafeFaces; if (d.manualBlocklist) s.manualBlocklist = d.manualBlocklist; if (d.manualSafelist) s.manualSafelist = d.manualSafelist; if (d.trainingData) s.trainingData = d.trainingData; if (d.classifierWeights) s.classifierWeights = d.classifierWeights; var today = new Date().toISOString().slice(0, 10); if (s.cloudCallsDate !== today) { s.cloudCallsToday = 0; s.cloudSavedCount = 0; s.cloudCallsDate = today; } console.log('[SE] State loaded'); }); await statePromise; if (bg && bg.resolveStateReady) bg.resolveStateReady(true); if (bg) bg.updateBadge(window.__seState.blockingEnabled); var s = window.__seState; if (!s.serverToken) { bg.serverAutoRegister().then(function() { if (bg && bg.resolveServerReady) bg.resolveServerReady(true); }).catch(function(err) { console.warn('[SE] Auto-register failed:', err.message); if (bg && bg.resolveServerReady) bg.resolveServerReady(false); }); } else { s.serverEnabled = true; if (bg && bg.resolveServerReady) bg.resolveServerReady(true); } console.log('[SE] Background initialization complete'); } catch(err) { console.error('[SE] Init error:', err); } })(); });
const Extension_Background_prim__addWhitelist = ((domain, w) => { var s = window.__seState; if (domain && !s.whitelist.includes(domain)) s.whitelist.push(domain); return { blockingEnabled: s.blockingEnabled, whitelist: s.whitelist }; });
const FFI_Core_prim__consoleWarn = ((tag, msg, w) => console.warn(tag, msg));
const FFI_Core_prim__consoleLog = ((tag, msg, w) => console.log(tag, msg));
const FFI_Browser_Runtime_prim__senderTabUrl = ((sender, w) => sender.tab ? sender.tab.url : '');
const FFI_Browser_Runtime_prim__senderTabId = ((sender, w) => sender.tab ? sender.tab.id : -1);
const FFI_Browser_Runtime_prim__onMessage = ((handler, w) => browser.runtime.onMessage.addListener((msg, sender) => { var p = new Promise((resolve) => { handler(msg)(sender)(v => { resolve(v); return w; })(w); }); return p; }));
const FFI_Browser_Runtime_prim__msgType = ((msg, w) => msg.type);
const FFI_Browser_Runtime_prim__msgGet = ((msg, key, w) => msg[key]);
const FFI_Browser_Runtime_prim__getURL = ((path, w) => browser.runtime.getURL(path));
const FFI_Browser_Menus_prim__menuCreate = ((id, title, ctx, w) => browser.menus.create({id: id, title: title, contexts: JSON.parse(ctx)}));
/* {$tcOpt:1} */
function x24tcOpt_1($0) {
 switch($0.a3.h) {
  case undefined: /* cons */ return {h: 1 /* {TcContinue1:1} */, a1: {a1: $0.a1, a2: $0.a2($0.a3.a1)}, a2: $0.a2, a3: $0.a3.a2};
  case 0: /* nil */ return {h: 0 /* {TcDone:1} */, a1: Prelude_Types_SnocList_x3cx3ex3e($0.a1, {h: 0})};
 }
}

/* Prelude.Types.List.mapAppend : SnocList b -> (a -> b) -> List a -> List b */
function Prelude_Types_List_mapAppend($0, $1, $2) {
 return __tailRec(x24tcOpt_1, {h: 1 /* {TcContinue1:1} */, a1: $0, a2: $1, a3: $2});
}

/* {$tcOpt:2} */
function x24tcOpt_2($0) {
 switch($0.a1.h) {
  case 0: /* nil */ return {h: 0 /* {TcDone:2} */, a1: $0.a2};
  case undefined: /* cons */ return {h: 1 /* {TcContinue2:1} */, a1: $0.a1.a1, a2: {a1: $0.a1.a2, a2: $0.a2}};
 }
}

/* Prelude.Types.SnocList.(<>>) : SnocList a -> List a -> List a */
function Prelude_Types_SnocList_x3cx3ex3e($0, $1) {
 return __tailRec(x24tcOpt_2, {h: 1 /* {TcContinue2:1} */, a1: $0, a2: $1});
}

/* {__mainExpression:0} */
function __mainExpression_0() {
 return PrimIO_unsafePerformIO($2 => Extension_Background_main($2));
}

/* {csegen:13} */
const csegen_13 = __lazy(function () {
 const $c = b => a => $d => $e => $f => {
  const $10 = $d($f);
  const $13 = $e($f);
  return $10($13);
 };
 const $1 = {a1: b => a => func => $3 => $4 => Prelude_IO_map_Functor_IO(func, $3, $4), a2: a => $a => $b => $a, a3: $c};
 const $18 = b => a => $19 => $1a => $1b => {
  const $1c = $19($1b);
  return $1a($1c)($1b);
 };
 const $23 = a => $24 => $25 => {
  const $26 = $24($25);
  return $26($25);
 };
 const $0 = {a1: $1, a2: $18, a3: $23};
 return {a1: $0, a2: a => $2c => $2c};
});

/* {csegen:23} */
const csegen_23 = __lazy(function () {
 return {a1: 'image', a2: {a1: 'link', a2: {a1: 'page', a2: {h: 0}}}};
});

/* prim__sub_Integer : Integer -> Integer -> Integer */
function prim__sub_Integer($0, $1) {
 return ($0-$1);
}

/* Extension.Background.main : IO () */
function Extension_Background_main($0) {
 const $1 = FFI_Core_seLog(csegen_13(), 'Background script initializing...')($0);
 const $8 = Extension_Background_prim__initBgCore($0);
 const $b = Extension_Background_prim__initBgServer($0);
 const $e = Extension_Background_prim__initBgPipeline($0);
 const $11 = Extension_Background_prim__initState($0);
 const $14 = Extension_Background_loadModels($0);
 const $17 = FFI_Browser_Runtime_onMessage(csegen_13(), msg => sender => respond => $1d => Extension_Background_handleMessage(msg, sender, respond, $1d))($0);
 const $24 = Extension_Background_createContextMenus(csegen_13())($0);
 const $2a = Extension_Background_n__4822_9759_prim__setupContextMenuClick($0);
 const $2d = Extension_Background_prim__asyncInit($0);
 return FFI_Core_seLog(csegen_13(), 'Background script initialized')($0);
}

/* Extension.Background.loadModels : IO () */
function Extension_Background_loadModels($0) {
 const $1 = FFI_Core_seLog(csegen_13(), 'Loading ML models...')($0);
 const $8 = FFI_Browser_Runtime_getURL(csegen_13(), 'models/')($0);
 const $f = FFI_Browser_Runtime_getURL(csegen_13(), 'lib/wasm/')($0);
 return Extension_Background_prim__loadAllModels($8, $f, $0);
}

/* Extension.Background.handleMessage : RuntimeMessage -> MessageSender -> (JsValue -> IO ()) -> IO () */
function Extension_Background_handleMessage($0, $1, $2, $3) {
 const $4 = FFI_Browser_Runtime_msgType(csegen_13(), $0)($3);
 switch($4) {
  case 'getState': {
   const $c = FFI_Browser_Runtime_msgGet(csegen_13(), $0, 'domain')($3);
   const $14 = Extension_Background_prim__toStr($c, $3);
   const $18 = Extension_Background_prim__getState($14, $3);
   return $2($18)($3);
  }
  case 'toggle': {
   const $20 = Extension_Background_prim__toggle($3);
   const $23 = Extension_Background_prim__saveState($3);
   const $26 = Extension_Background_prim__reloadActiveTab($3);
   return $2($20)($3);
  }
  case 'addWhitelist': {
   const $2d = FFI_Browser_Runtime_msgGet(csegen_13(), $0, 'domain')($3);
   const $35 = Extension_Background_prim__toStr($2d, $3);
   const $39 = Extension_Background_prim__addWhitelist($35, $3);
   const $3d = Extension_Background_prim__saveState($3);
   const $40 = Extension_Background_prim__reloadActiveTab($3);
   return $2($39)($3);
  }
  case 'removeWhitelist': {
   const $47 = FFI_Browser_Runtime_msgGet(csegen_13(), $0, 'domain')($3);
   const $4f = Extension_Background_prim__toStr($47, $3);
   const $53 = Extension_Background_prim__removeWhitelist($4f, $3);
   const $57 = Extension_Background_prim__saveState($3);
   const $5a = Extension_Background_prim__reloadActiveTab($3);
   return $2($53)($3);
  }
  case 'getBlockingState': {
   const $61 = FFI_Browser_Runtime_senderTabUrl(csegen_13(), $1)($3);
   const $68 = Extension_Background_prim__getBlockingState($61, $3);
   return $2($68)($3);
  }
  case 'getCloudStats': {
   const $70 = Extension_Background_prim__getCloudStats($3);
   return $2($70)($3);
  }
  case 'setApiKey': {
   const $77 = FFI_Browser_Runtime_msgGet(csegen_13(), $0, 'key')($3);
   const $7f = Extension_Background_prim__toStr($77, $3);
   const $83 = Extension_Background_prim__setApiKey($7f, $3);
   const $87 = Extension_Background_prim__saveState($3);
   const $8a = Extension_Background_prim__successResult($3);
   return $2($8a)($3);
  }
  case 'setCloudMode': {
   const $91 = FFI_Browser_Runtime_msgGet(csegen_13(), $0, 'mode')($3);
   const $99 = Extension_Background_prim__toStr($91, $3);
   const $9d = Extension_Background_prim__setCloudMode($99, $3);
   const $a1 = Extension_Background_prim__saveState($3);
   const $a4 = Extension_Background_prim__successResult($3);
   return $2($a4)($3);
  }
  case 'classifyCloud': {
   const $ab = Extension_Background_prim__classifyCloud($0, $3);
   const $af = Extension_Background_prim__saveState($3);
   return $2($ab)($3);
  }
  case 'clearCloudCache': {
   const $b6 = Extension_Background_prim__clearCloudCache($3);
   const $b9 = Extension_Background_prim__saveState($3);
   return $2($b6)($3);
  }
  case 'getLearningStats': {
   const $c0 = Extension_Background_prim__getLearningStats($3);
   return $2($c0)($3);
  }
  case 'learnBlock': {
   const $c7 = Extension_Background_prim__learnBlock($0, $3);
   const $cb = Extension_Background_prim__trainClassifier($3);
   const $ce = Extension_Background_prim__saveLearningData($3);
   return $2($c7)($3);
  }
  case 'learnSafe': {
   const $d5 = Extension_Background_prim__learnSafe($0, $3);
   const $d9 = Extension_Background_prim__trainClassifier($3);
   const $dc = Extension_Background_prim__saveLearningData($3);
   return $2($d5)($3);
  }
  case 'resetLearning': {
   const $e3 = Extension_Background_prim__resetLearning($3);
   const $e6 = Extension_Background_prim__saveLearningData($3);
   return $2($e3)($3);
  }
  case 'exportLearning': {
   const $ed = Extension_Background_prim__exportLearning($3);
   return $2($ed)($3);
  }
  case 'importLearning': {
   const $f4 = Extension_Background_prim__importLearning($0, $3);
   const $f8 = Extension_Background_prim__trainClassifier($3);
   const $fb = Extension_Background_prim__saveLearningData($3);
   return $2($f4)($3);
  }
  case 'blockImage': {
   const $102 = FFI_Browser_Runtime_senderTabId(csegen_13(), $1)($3);
   const $109 = Extension_Background_prim__blockImage($0, $102, $3);
   const $10e = Extension_Background_prim__saveLearningData($3);
   return $2($109)($3);
  }
  case 'safeImage': {
   const $115 = FFI_Browser_Runtime_senderTabId(csegen_13(), $1)($3);
   const $11c = Extension_Background_prim__safeImage($0, $115, $3);
   const $121 = Extension_Background_prim__saveLearningData($3);
   return $2($11c)($3);
  }
  case 'checkCache': {
   const $128 = FFI_Browser_Runtime_msgGet(csegen_13(), $0, 'url')($3);
   const $130 = Extension_Background_prim__toStr($128, $3);
   const $134 = Extension_Background_prim__checkCache($130, $3);
   return $2($134)($3);
  }
  case 'classifyImage': {
   const $13c = FFI_Browser_Runtime_msgGet(csegen_13(), $0, 'url')($3);
   const $144 = Extension_Background_prim__toStr($13c, $3);
   const $148 = FFI_Browser_Runtime_msgGet(csegen_13(), $0, 'imageDataUrl')($3);
   const $150 = Extension_Background_prim__toStr($148, $3);
   const $154 = Extension_Background_prim__classifyImage($144, $150, $3);
   return $2($154)($3);
  }
  case 'extractDescriptors': {
   const $15d = FFI_Browser_Runtime_msgGet(csegen_13(), $0, 'imageDataUrl')($3);
   const $165 = Extension_Background_prim__toStr($15d, $3);
   const $169 = Extension_Background_prim__extractDescriptors($165, $3);
   return $2($169)($3);
  }
  case 'fetchImage': {
   const $171 = FFI_Browser_Runtime_msgGet(csegen_13(), $0, 'url')($3);
   const $179 = Extension_Background_prim__toStr($171, $3);
   const $17d = Extension_Background_prim__fetchImage($179, $3);
   return $2($17d)($3);
  }
  case 'prefetchServer': {
   const $185 = Extension_Background_prim__prefetchServer($0, $3);
   return $2($185)($3);
  }
  case 'getStats': {
   const $18d = Extension_Background_prim__getStats($3);
   return $2($18d)($3);
  }
  case 'getServerConfig': {
   const $194 = Extension_Background_prim__getServerConfig($3);
   return $2($194)($3);
  }
  case 'verifyServer': {
   const $19b = Extension_Background_prim__verifyServer($3);
   return $2($19b)($3);
  }
  case 'serverBatchLookup': {
   const $1a2 = Extension_Background_prim__serverBatchLookup($0, $3);
   return $2($1a2)($3);
  }
  case 'serverSubmitClassification': {
   const $1aa = Extension_Background_prim__serverSubmitClassification($0, $3);
   return $2($1aa)($3);
  }
  case 'serverSubmitDescriptor': {
   const $1b2 = Extension_Background_prim__serverSubmitDescriptor($0, $3);
   return $2($1b2)($3);
  }
  case 'getDebugStatus': {
   const $1ba = Extension_Background_prim__getDebugStatus($3);
   return $2($1ba)($3);
  }
  case 'enableDebugTiming': {
   const $1c1 = FFI_Browser_Runtime_msgGet(csegen_13(), $0, 'enabled')($3);
   const $1c9 = Extension_Background_prim__enableDebugTiming(1, $3);
   return $2($1c9)($3);
  }
  case 'getDebugEvents': {
   const $1d1 = Extension_Background_prim__getDebugEvents($3);
   return $2($1d1)($3);
  }
  case 'contextMenuImage': {
   const $1d8 = FFI_Browser_Runtime_msgGet(csegen_13(), $0, 'url')($3);
   const $1e0 = Extension_Background_prim__toStr($1d8, $3);
   const $1e4 = Extension_Background_prim__contextMenuImage($1e0, $3);
   return $2($1e4)($3);
  }
  default: {
   const $1ec = FFI_Core_seWarn(csegen_13(), ('Unknown message type: '+$4))($3);
   const $1f5 = Extension_Background_prim__emptyResult($3);
   return $2($1f5)($3);
  }
 }
}

/* Extension.Background.createContextMenus : HasIO io => io () */
function Extension_Background_createContextMenus($0) {
 return $0.a1.a2(undefined)(undefined)(FFI_Browser_Menus_menuCreate($0, 'shmirat-block', 'Block {2014} contains women', csegen_23()))($11 => FFI_Browser_Menus_menuCreate($0, 'shmirat-safe', 'Safe {2014} no women here', csegen_23()));
}

/* FFI.Core.seWarn : HasIO io => String -> io () */
function FFI_Core_seWarn($0, $1) {
 return $0.a2(undefined)($7 => FFI_Core_prim__consoleWarn('[Shmirat Eynaim]', $1, $7));
}

/* FFI.Core.seLog : HasIO io => String -> io () */
function FFI_Core_seLog($0, $1) {
 return $0.a2(undefined)($7 => FFI_Core_prim__consoleLog('[Shmirat Eynaim]', $1, $7));
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

/* Prelude.EqOrd.== */
function Prelude_EqOrd_x3dx3d_Eq_Integer($0, $1) {
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

/* Prelude.EqOrd.compareInteger : Integer -> Integer -> Ordering */
function Prelude_EqOrd_compareInteger($0, $1) {
 return Prelude_EqOrd_compare_Ord_Integer($0, $1);
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

/* FFI.Browser.Runtime.senderTabUrl : HasIO io => MessageSender -> io String */
function FFI_Browser_Runtime_senderTabUrl($0, $1) {
 return $0.a2(undefined)($7 => FFI_Browser_Runtime_prim__senderTabUrl($1, $7));
}

/* FFI.Browser.Runtime.senderTabId : HasIO io => MessageSender -> io Int32 */
function FFI_Browser_Runtime_senderTabId($0, $1) {
 return $0.a2(undefined)($7 => FFI_Browser_Runtime_prim__senderTabId($1, $7));
}

/* FFI.Browser.Runtime.onMessage : HasIO io =>
(RuntimeMessage -> MessageSender -> (JsValue -> IO ()) -> IO ()) -> io () */
function FFI_Browser_Runtime_onMessage($0, $1) {
 return $0.a2(undefined)($7 => FFI_Browser_Runtime_prim__onMessage(msg => sender => respond => $1(msg)(sender)(v => respond(v)), $7));
}

/* FFI.Browser.Runtime.msgType : HasIO io => RuntimeMessage -> io String */
function FFI_Browser_Runtime_msgType($0, $1) {
 return $0.a2(undefined)($7 => FFI_Browser_Runtime_prim__msgType($1, $7));
}

/* FFI.Browser.Runtime.msgGet : HasIO io => RuntimeMessage -> String -> io JsValue */
function FFI_Browser_Runtime_msgGet($0, $1, $2) {
 return $0.a2(undefined)($8 => FFI_Browser_Runtime_prim__msgGet($1, $2, $8));
}

/* FFI.Browser.Runtime.getURL : HasIO io => String -> io String */
function FFI_Browser_Runtime_getURL($0, $1) {
 return $0.a2(undefined)($7 => FFI_Browser_Runtime_prim__getURL($1, $7));
}

/* FFI.Browser.Menus.2711:5650:joinBy */
function FFI_Browser_Menus_n__2711_5650_joinBy($0, $1, $2, $3, $4, $5) {
 switch($5.h) {
  case 0: /* nil */ return '';
  case undefined: /* cons */ {
   switch($5.a2.h) {
    case 0: /* nil */ return $5.a1;
    default: return ($5.a1+($4+FFI_Browser_Menus_n__2711_5650_joinBy($0, $1, $2, $3, $4, $5.a2)));
   }
  }
 }
}

/* FFI.Browser.Menus.menuCreate : HasIO io => String -> String -> List String -> io () */
function FFI_Browser_Menus_menuCreate($0, $1, $2, $3) {
 const $4 = ('['+(FFI_Browser_Menus_n__2711_5650_joinBy($0, $3, $2, $1, ',', Prelude_Types_List_mapAppend({h: 0}, c => ('\"'+(c+'\"')), $3))+']'));
 return $0.a2(undefined)($1d => FFI_Browser_Menus_prim__menuCreate($1, $2, $4, $1d));
}


try{__mainExpression_0()}catch(e){if(e instanceof IdrisError){console.log('ERROR: ' + e.message)}else{throw e} }
