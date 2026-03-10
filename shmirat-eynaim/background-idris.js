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

const Extension_Background_prim__trainClassifier = ((w) => { var s = window.__seState; if (s.trainingData.length < 10) return; var w128 = new Array(128).fill(0); var b = 0; var lr = 0.01; for (var iter = 0; iter < 100; iter++) { for (var ex of s.trainingData) { var dot = 0; for (var j = 0; j < 128; j++) dot += w128[j] * ex.descriptor[j]; var pred = 1 / (1 + Math.exp(-(dot + b))); var err = pred - ex.label; for (var j = 0; j < 128; j++) w128[j] -= lr * err * ex.descriptor[j]; b -= lr * err; } } s.classifierWeights = { weights: w128, bias: b }; console.log('[SE] Classifier trained on', s.trainingData.length, 'examples'); });
const Extension_Background_prim__toggle = ((w) => { var s = window.__seState; s.blockingEnabled = !s.blockingEnabled; return { blockingEnabled: s.blockingEnabled, whitelist: s.whitelist }; });
const Extension_Background_prim__toStr = ((v, w) => typeof v === 'string' ? v : (v == null ? '' : String(v)));
const Extension_Background_prim__successResult = ((w) => ({ success: true }));
const Extension_Background_prim__setCloudMode = ((mode, w) => { window.__seState.cloudMode = mode || 'all'; });
const Extension_Background_prim__setApiKey = ((key, w) => { window.__seState.anthropicApiKey = key || ''; });
const Extension_Background_prim__saveState = ((w) => { var s = window.__seState; browser.storage.local.set({ blockingEnabled: s.blockingEnabled, whitelist: s.whitelist, anthropicApiKey: s.anthropicApiKey, cloudMode: s.cloudMode, cloudCache: s.cloudCache, cloudCallsToday: s.cloudCallsToday, cloudCallsDate: s.cloudCallsDate, cloudSavedCount: s.cloudSavedCount, serverEnabled: s.serverEnabled, serverToken: s.serverToken, serverDeviceId: s.serverDeviceId }).catch(function(e) { console.error('[SE] saveState error:', e); }); });
const Extension_Background_prim__saveLearningData = ((w) => { var s = window.__seState; browser.storage.local.set({ knownFaces: s.knownFaces, knownSafeFaces: s.knownSafeFaces, manualBlocklist: s.manualBlocklist, manualSafelist: s.manualSafelist, trainingData: s.trainingData, classifierWeights: s.classifierWeights }).catch(function(e) { console.error('[SE] saveLearningData error:', e); }); });
const Extension_Background_prim__safeImage = ((msg, senderId, w) => { var s = window.__seState; var url = msg.url; if (!s.manualSafelist.includes(url)) s.manualSafelist.push(url); s.manualBlocklist = s.manualBlocklist.filter(function(u) { return u !== url; }); s.cloudCache[url] = { containsWomen: false, timestamp: Date.now() }; if (senderId >= 0) { try { browser.tabs.sendMessage(senderId, { type: 'safeAndLearn', url: url }).catch(function() {}); } catch(e) {} } return { success: true }; });
const Extension_Background_prim__resetLearning = ((w) => { var s = window.__seState; s.knownFaces = []; s.knownSafeFaces = []; s.manualBlocklist = []; s.manualSafelist = []; s.trainingData = []; s.classifierWeights = null; return { success: true }; });
const Extension_Background_prim__removeWhitelist = ((domain, w) => { var s = window.__seState; s.whitelist = s.whitelist.filter(function(d) { return d !== domain; }); return { blockingEnabled: s.blockingEnabled, whitelist: s.whitelist }; });
const Extension_Background_prim__reloadActiveTab = ((w) => { browser.tabs.query({active: true, currentWindow: true}).then(function(tabs) { if (tabs[0]) browser.tabs.reload(tabs[0].id); }).catch(function() {}); });
const Extension_Background_prim__loadState = ((w) => { browser.storage.local.get(['blockingEnabled','whitelist','anthropicApiKey','cloudMode','cloudCache','cloudCallsToday','cloudCallsDate','cloudSavedCount','serverEnabled','serverToken','serverDeviceId','knownFaces','knownSafeFaces','manualBlocklist','manualSafelist','trainingData','classifierWeights']).then(function(d) { var s = window.__seState; if (d.blockingEnabled !== undefined) s.blockingEnabled = d.blockingEnabled; if (d.whitelist) s.whitelist = d.whitelist; if (d.anthropicApiKey !== undefined) s.anthropicApiKey = d.anthropicApiKey; if (d.cloudMode) s.cloudMode = d.cloudMode; if (d.cloudCache) s.cloudCache = d.cloudCache; if (d.cloudCallsToday !== undefined) s.cloudCallsToday = d.cloudCallsToday; if (d.cloudCallsDate !== undefined) s.cloudCallsDate = d.cloudCallsDate; if (d.cloudSavedCount !== undefined) s.cloudSavedCount = d.cloudSavedCount; if (d.serverEnabled !== undefined) s.serverEnabled = d.serverEnabled; if (d.serverToken) s.serverToken = d.serverToken; if (d.serverDeviceId) s.serverDeviceId = d.serverDeviceId; if (d.knownFaces) s.knownFaces = d.knownFaces; if (d.knownSafeFaces) s.knownSafeFaces = d.knownSafeFaces; if (d.manualBlocklist) s.manualBlocklist = d.manualBlocklist; if (d.manualSafelist) s.manualSafelist = d.manualSafelist; if (d.trainingData) s.trainingData = d.trainingData; if (d.classifierWeights) s.classifierWeights = d.classifierWeights; console.log('[SE] State loaded from storage'); }).catch(function(e) { console.error('[SE] loadState error:', e); }); });
const Extension_Background_prim__loadAllModels = ((modelPath, wasmPath, w) => { (async function() { try { await faceapi.tf.setBackend('webgl'); await faceapi.tf.ready(); console.log('[SE] TF backend: webgl'); } catch(e) { try { faceapi.tf.setWasmPaths(wasmPath); await faceapi.tf.setBackend('wasm'); await faceapi.tf.ready(); console.log('[SE] TF backend: wasm'); } catch(e2) { await faceapi.tf.setBackend('cpu'); await faceapi.tf.ready(); console.log('[SE] TF backend: cpu'); } } window.__seState.mlBackend = faceapi.tf.getBackend(); console.log('[SE] TF backend:', faceapi.tf.getBackend()); await faceapi.nets.tinyFaceDetector.loadFromUri(modelPath); await faceapi.nets.ageGenderNet.loadFromUri(modelPath); await faceapi.nets.faceLandmark68TinyNet.loadFromUri(modelPath); await faceapi.nets.faceRecognitionNet.loadFromUri(modelPath); console.log('[SE] Face models loaded'); var cocoModelUrl = modelPath + 'coco-ssd/model.json'; window.__seState.personDetector = await cocoSsd.load({ base: 'lite_mobilenet_v2', modelUrl: cocoModelUrl }); console.log('[SE] COCO-SSD loaded'); window.__seState.modelsLoaded = true; console.log('[SE] All models loaded'); })(); });
const Extension_Background_prim__learnSafe = ((msg, w) => { var s = window.__seState; var url = msg.url; var descriptors = msg.descriptors || []; if (!s.manualSafelist.includes(url)) s.manualSafelist.push(url); s.manualBlocklist = s.manualBlocklist.filter(function(u) { return u !== url; }); s.cloudCache[url] = { containsWomen: false, timestamp: Date.now() }; var now = Date.now(); for (var i = 0; i < descriptors.length; i++) { s.knownSafeFaces.push({ descriptor: descriptors[i], url: url, timestamp: now }); if (s.knownSafeFaces.length > 1000) s.knownSafeFaces.shift(); s.trainingData.push({ descriptor: descriptors[i], label: 0 }); if (s.trainingData.length > 500) s.trainingData.shift(); } return { success: true }; });
const Extension_Background_prim__learnBlock = ((msg, w) => { var s = window.__seState; var url = msg.url; var descriptors = msg.descriptors || []; if (!s.manualBlocklist.includes(url)) s.manualBlocklist.push(url); s.manualSafelist = s.manualSafelist.filter(function(u) { return u !== url; }); s.cloudCache[url] = { containsWomen: true, timestamp: Date.now() }; var now = Date.now(); for (var i = 0; i < descriptors.length; i++) { s.knownFaces.push({ descriptor: descriptors[i], url: url, timestamp: now }); if (s.knownFaces.length > 1000) s.knownFaces.shift(); s.trainingData.push({ descriptor: descriptors[i], label: 1 }); if (s.trainingData.length > 500) s.trainingData.shift(); } return { success: true }; });
const Extension_Background_prim__initState = ((w) => { window.__seState = { blockingEnabled: true, whitelist: [], knownFaces: [], knownSafeFaces: [], manualBlocklist: [], manualSafelist: [], trainingData: [], classifierWeights: null, cloudCache: {}, cloudCallsToday: 0, cloudCallsDate: '', cloudSavedCount: 0, anthropicApiKey: '', cloudMode: 'all', serverToken: '', serverEnabled: true, serverDeviceId: '', debugTiming: false, debugEvents: [], lastContextMenuImageUrl: null, modelsLoaded: false, mlBackend: 'none', personDetector: null }; });
const Extension_Background_prim__importLearning = ((msg, w) => { var s = window.__seState; var d = msg.data || {}; if (d.knownFaces) { s.knownFaces = s.knownFaces.concat(d.knownFaces); if (s.knownFaces.length > 1000) s.knownFaces = s.knownFaces.slice(-1000); } if (d.knownSafeFaces) { s.knownSafeFaces = s.knownSafeFaces.concat(d.knownSafeFaces); if (s.knownSafeFaces.length > 1000) s.knownSafeFaces = s.knownSafeFaces.slice(-1000); } if (d.manualBlocklist) { for (var i = 0; i < d.manualBlocklist.length; i++) { if (!s.manualBlocklist.includes(d.manualBlocklist[i])) s.manualBlocklist.push(d.manualBlocklist[i]); } } if (d.manualSafelist) { for (var i = 0; i < d.manualSafelist.length; i++) { if (!s.manualSafelist.includes(d.manualSafelist[i])) s.manualSafelist.push(d.manualSafelist[i]); } } if (d.trainingData) { s.trainingData = s.trainingData.concat(d.trainingData); if (s.trainingData.length > 500) s.trainingData = s.trainingData.slice(-500); } if (d.classifierWeights) s.classifierWeights = d.classifierWeights; return { success: true }; });
const Extension_Background_prim__getStats = ((w) => { var s = window.__seState; return browser.tabs.query({active: true, currentWindow: true}).then(function(tabs) { var tab = tabs[0]; if (!tab) return { scanned: 0, hidden: 0, backend: s.mlBackend, modelsLoaded: s.modelsLoaded, personDetectorLoaded: s.personDetector !== null }; return browser.tabs.sendMessage(tab.id, {type: 'getStats'}).then(function(cs) { return Object.assign(cs || {}, { backend: s.mlBackend, modelsLoaded: s.modelsLoaded, personDetectorLoaded: s.personDetector !== null }); }).catch(function() { return { scanned: 0, hidden: 0, backend: s.mlBackend, modelsLoaded: s.modelsLoaded, personDetectorLoaded: s.personDetector !== null }; }); }); });
const Extension_Background_prim__getState = ((domain, w) => { var s = window.__seState; return { blockingEnabled: s.blockingEnabled, whitelist: s.whitelist, domain: domain }; });
const Extension_Background_prim__getServerConfig = ((w) => { var s = window.__seState; return { serverUrl: 'https://shmirat-eynaim.example.com', hasToken: !!s.serverToken, serverEnabled: s.serverEnabled }; });
const Extension_Background_prim__getLearningStats = ((w) => { var s = window.__seState; return { knownFacesCount: s.knownFaces.length, knownSafeFacesCount: s.knownSafeFaces.length, trainingDataCount: s.trainingData.length, classifierTrained: s.classifierWeights !== null }; });
const Extension_Background_prim__getDebugStatus = ((w) => { var s = window.__seState; return { blockingEnabled: s.blockingEnabled, whitelistCount: s.whitelist.length, knownFacesCount: s.knownFaces.length, knownSafeFacesCount: s.knownSafeFaces.length, trainingDataCount: s.trainingData.length, classifierTrained: s.classifierWeights !== null }; });
const Extension_Background_prim__getDebugEvents = ((w) => window.__seState.debugEvents || []);
const Extension_Background_prim__getCloudStats = ((w) => { var s = window.__seState; return { cloudMode: s.cloudMode, hasApiKey: !!s.anthropicApiKey, cloudCallsToday: s.cloudCallsToday || 0, cloudSavedCount: s.cloudSavedCount || 0, cloudCacheSize: Object.keys(s.cloudCache || {}).length }; });
const Extension_Background_prim__getBlockingState = ((tabUrl, w) => { var s = window.__seState; var dominated = false; try { var h = new URL(tabUrl).hostname; dominated = s.whitelist.includes(h); } catch(e) {} return { blockingEnabled: s.blockingEnabled, whitelisted: dominated, manualBlocklist: s.manualBlocklist, manualSafelist: s.manualSafelist, serverEnabled: s.serverEnabled }; });
const Extension_Background_prim__fetchImage = ((url, w) => { return fetch(url).then(function(r) { return r.blob(); }).then(function(b) { return new Promise(function(resolve) { var reader = new FileReader(); reader.onload = function() { resolve(reader.result); }; reader.readAsDataURL(b); }); }).catch(function(e) { console.warn('[SE] fetchImage error:', e); return null; }); });
const Extension_Background_prim__exportLearning = ((w) => { var s = window.__seState; return { knownFaces: s.knownFaces, knownSafeFaces: s.knownSafeFaces, manualBlocklist: s.manualBlocklist, manualSafelist: s.manualSafelist, trainingData: s.trainingData, classifierWeights: s.classifierWeights }; });
const Extension_Background_prim__enableDebugTiming = ((enabled, w) => { window.__seState.debugTiming = enabled; window.__seState.debugEvents = []; console.log('[SE] Debug timing:', enabled ? 'ON' : 'OFF'); return { ok: true }; });
const Extension_Background_prim__emptyResult = ((w) => ({}));
const Extension_Background_prim__contextMenuImage = ((url, w) => { window.__seState.lastContextMenuImageUrl = url || null; return { ok: true }; });
const Extension_Background_prim__clearCloudCache = ((w) => { var s = window.__seState; var count = Object.keys(s.cloudCache).length; s.cloudCache = {}; console.log('[SE] Cloud cache cleared:', count, 'entries'); return { success: true, cleared: count }; });
const Extension_Background_prim__classifyCloud = ((msg, w) => { var s = window.__seState; var imageUrl = msg.imageUrl; var imageDataUrl = msg.imageDataUrl; var localResult = msg.localResult; var descriptors = msg.descriptors || []; if (!s.anthropicApiKey) return Promise.resolve(null); if (s.cloudMode === 'never') return Promise.resolve(null); if (s.cloudCache[imageUrl]) { s.cloudSavedCount++; return Promise.resolve({ containsWomen: s.cloudCache[imageUrl].containsWomen, source: 'cloud-cache' }); } if (s.cloudMode === 'uncertain' && localResult) { if (localResult.source === 'user') return Promise.resolve(null); if (localResult.knnDistance !== undefined && localResult.knnDistance < 0.4) return Promise.resolve(null); if (localResult.classifierConfidence !== undefined && localResult.classifierConfidence > 0.9) return Promise.resolve(null); } return (function() { var match = (imageDataUrl || '').match(/^data:(image\/\w+);base64,(.+)$/); if (!match) return Promise.resolve(null); var mediaType = match[1]; var base64Data = match[2]; return fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': s.anthropicApiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 50, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } }, { type: 'text', text: 'Does this image contain a woman or girl? Answer with exactly one word: YES or NO.' }] }] }) }).then(function(resp) { if (!resp.ok) { console.warn('[SE] Haiku API error:', resp.status); return null; } return resp.json(); }).then(function(data) { if (!data) return null; var answer = (data.content && data.content[0] && data.content[0].text || '').trim().toUpperCase(); var containsWomen = answer === 'YES' || answer.indexOf('YES') === 0; var today = new Date().toISOString().slice(0, 10); if (s.cloudCallsDate !== today) { s.cloudCallsDate = today; s.cloudCallsToday = 0; } s.cloudCallsToday++; s.cloudCache[imageUrl] = { containsWomen: containsWomen, timestamp: Date.now() }; if (descriptors.length > 0) { var now = Date.now(); for (var i = 0; i < descriptors.length; i++) { if (containsWomen) { s.knownFaces.push({ descriptor: descriptors[i], url: imageUrl, timestamp: now }); if (s.knownFaces.length > 1000) s.knownFaces.shift(); } else { s.knownSafeFaces.push({ descriptor: descriptors[i], url: imageUrl, timestamp: now }); if (s.knownSafeFaces.length > 1000) s.knownSafeFaces.shift(); } s.trainingData.push({ descriptor: descriptors[i], label: containsWomen ? 1 : 0 }); if (s.trainingData.length > 500) s.trainingData.shift(); } } return { containsWomen: containsWomen, source: 'haiku', raw: answer }; }).catch(function(e) { console.warn('[SE] Haiku error:', e); return null; }); })(); });
const Extension_Background_prim__checkCache = ((url, w) => { var s = window.__seState; if (s.manualBlocklist.includes(url)) return { hit: true, containsWomen: true, reason: 'user-block' }; if (s.manualSafelist.includes(url)) return { hit: true, containsWomen: false, reason: 'user-safe' }; if (s.cloudCache[url]) return { hit: true, containsWomen: s.cloudCache[url].containsWomen, reason: 'cloud-cache' }; return { hit: false }; });
const Extension_Background_prim__blockImage = ((msg, senderId, w) => { var s = window.__seState; var url = msg.url; if (!s.manualBlocklist.includes(url)) s.manualBlocklist.push(url); s.manualSafelist = s.manualSafelist.filter(function(u) { return u !== url; }); s.cloudCache[url] = { containsWomen: true, timestamp: Date.now() }; if (senderId >= 0) { try { browser.tabs.sendMessage(senderId, { type: 'blockAndLearn', url: url }).catch(function() {}); } catch(e) {} } return { success: true }; });
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

/* prim__sub_Integer : Integer -> Integer -> Integer */
function prim__sub_Integer($0, $1) {
 return ($0-$1);
}

/* Extension.Background.main : IO () */
function Extension_Background_main($0) {
 const $1 = FFI_Core_seLog(csegen_13(), 'Background script initializing...')($0);
 const $8 = Extension_Background_prim__initState($0);
 const $b = Extension_Background_prim__loadState($0);
 const $e = Extension_Background_loadModels($0);
 const $11 = FFI_Browser_Runtime_onMessage(csegen_13(), msg => sender => respond => $17 => Extension_Background_handleMessage(msg, sender, respond, $17))($0);
 const $1e = Extension_Background_createContextMenus(csegen_13())($0);
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
  case 'fetchImage': {
   const $13c = FFI_Browser_Runtime_msgGet(csegen_13(), $0, 'url')($3);
   const $144 = Extension_Background_prim__toStr($13c, $3);
   const $148 = Extension_Background_prim__fetchImage($144, $3);
   return $2($148)($3);
  }
  case 'getStats': {
   const $150 = Extension_Background_prim__getStats($3);
   return $2($150)($3);
  }
  case 'getServerConfig': {
   const $157 = Extension_Background_prim__getServerConfig($3);
   return $2($157)($3);
  }
  case 'getDebugStatus': {
   const $15e = Extension_Background_prim__getDebugStatus($3);
   return $2($15e)($3);
  }
  case 'enableDebugTiming': {
   const $165 = FFI_Browser_Runtime_msgGet(csegen_13(), $0, 'enabled')($3);
   const $16d = Extension_Background_prim__enableDebugTiming(1, $3);
   return $2($16d)($3);
  }
  case 'getDebugEvents': {
   const $175 = Extension_Background_prim__getDebugEvents($3);
   return $2($175)($3);
  }
  case 'contextMenuImage': {
   const $17c = FFI_Browser_Runtime_msgGet(csegen_13(), $0, 'url')($3);
   const $184 = Extension_Background_prim__toStr($17c, $3);
   const $188 = Extension_Background_prim__contextMenuImage($184, $3);
   return $2($188)($3);
  }
  default: {
   const $190 = FFI_Core_seWarn(csegen_13(), ('Unknown message type: '+$4))($3);
   const $199 = Extension_Background_prim__emptyResult($3);
   return $2($199)($3);
  }
 }
}

/* Extension.Background.createContextMenus : HasIO io => io () */
function Extension_Background_createContextMenus($0) {
 return $0.a1.a2(undefined)(undefined)(FFI_Browser_Menus_menuCreate($0, 'se-block-image', 'Shmirat Eynaim: Block this image', {a1: 'image', a2: {h: 0}}))($12 => FFI_Browser_Menus_menuCreate($0, 'se-safe-image', 'Shmirat Eynaim: Mark as safe', {a1: 'image', a2: {h: 0}}));
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
