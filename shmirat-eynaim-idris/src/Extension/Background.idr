-- Extension.Background — Background page entry point (self-contained, no .js dependencies)
--
-- Compile with: idris2 --cg javascript -o background-idris.js src/Extension/Background.idr
--
-- Architecture:
--   background.html loads: face-api, coco-ssd, background-idris.js
--   All pipeline logic is inline as %foreign lambdas on window.__seBg
--   This module provides: state management, message dispatch, model loading,
--   ML inference, server API, cloud API, classification pipeline
--
-- Message handlers dispatch to per-handler FFI functions.
-- Pipeline functions (classifyImage, ML inference, etc.) live on window.__seBg.

module Extension.Background

import FFI.Core
import FFI.Browser.Runtime
import FFI.Browser.Storage
import FFI.Browser.Tabs
import FFI.Browser.Menus
import FFI.Browser.Action
import FFI.ML.FaceApi
import FFI.ML.CocoSsd
import FFI.Network
import Extension.Types
import Extension.Properties
import Extension.State
import Pipeline.Classification
import Pipeline.Priority
import ML.Detection
import ML.Learning

---------------------------------------------------------------------------
-- State initialization
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w) => { window.__seState = { blockingEnabled: true, whitelist: [], knownFaces: [], knownSafeFaces: [], manualBlocklist: [], manualSafelist: [], trainingData: [], classifierWeights: null, cloudCache: {}, cloudCallsToday: 0, cloudCallsDate: '', cloudSavedCount: 0, anthropicApiKey: '', cloudMode: 'all', serverToken: '', serverEnabled: true, serverDeviceId: '', debugTiming: false, debugEvents: [], lastContextMenuImageUrl: null, modelsLoaded: false, mlBackend: 'none', personDetector: null }; }"
prim__initState : PrimIO ()

---------------------------------------------------------------------------
-- State persistence
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w) => { var s = window.__seState; browser.storage.local.set({ blockingEnabled: s.blockingEnabled, whitelist: s.whitelist, anthropicApiKey: s.anthropicApiKey, cloudMode: s.cloudMode, cloudCache: s.cloudCache, cloudCallsToday: s.cloudCallsToday, cloudCallsDate: s.cloudCallsDate, cloudSavedCount: s.cloudSavedCount, serverEnabled: s.serverEnabled, serverToken: s.serverToken, serverDeviceId: s.serverDeviceId }).catch(function(e) { console.error('[SE] saveState error:', e); }); }"
prim__saveState : PrimIO ()

%foreign "javascript:lambda:(w) => { var s = window.__seState; browser.storage.local.set({ knownFaces: s.knownFaces, knownSafeFaces: s.knownSafeFaces, manualBlocklist: s.manualBlocklist, manualSafelist: s.manualSafelist, trainingData: s.trainingData, classifierWeights: s.classifierWeights }).catch(function(e) { console.error('[SE] saveLearningData error:', e); }); }"
prim__saveLearningData : PrimIO ()

%foreign "javascript:lambda:(w) => { return browser.storage.local.get(['blockingEnabled','whitelist','anthropicApiKey','cloudMode','cloudCache','cloudCallsToday','cloudCallsDate','cloudSavedCount','serverEnabled','serverToken','serverDeviceId','knownFaces','knownSafeFaces','manualBlocklist','manualSafelist','trainingData','classifierWeights']).then(function(d) { var s = window.__seState; if (d.blockingEnabled !== undefined) s.blockingEnabled = d.blockingEnabled; if (d.whitelist) s.whitelist = d.whitelist; if (d.anthropicApiKey !== undefined) s.anthropicApiKey = d.anthropicApiKey; if (d.cloudMode) s.cloudMode = d.cloudMode; if (d.cloudCache) s.cloudCache = d.cloudCache; if (d.cloudCallsToday !== undefined) s.cloudCallsToday = d.cloudCallsToday; if (d.cloudCallsDate !== undefined) s.cloudCallsDate = d.cloudCallsDate; if (d.cloudSavedCount !== undefined) s.cloudSavedCount = d.cloudSavedCount; if (d.serverEnabled !== undefined) s.serverEnabled = d.serverEnabled; if (d.serverToken) s.serverToken = d.serverToken; if (d.serverDeviceId) s.serverDeviceId = d.serverDeviceId; if (d.knownFaces) s.knownFaces = d.knownFaces; if (d.knownSafeFaces) s.knownSafeFaces = d.knownSafeFaces; if (d.manualBlocklist) s.manualBlocklist = d.manualBlocklist; if (d.manualSafelist) s.manualSafelist = d.manualSafelist; if (d.trainingData) s.trainingData = d.trainingData; if (d.classifierWeights) s.classifierWeights = d.classifierWeights; var today = new Date().toISOString().slice(0, 10); if (s.cloudCallsDate !== today) { s.cloudCallsToday = 0; s.cloudSavedCount = 0; s.cloudCallsDate = today; } console.log('[SE] State loaded from storage'); }); }"
prim__loadState : PrimIO JsValue

---------------------------------------------------------------------------
-- Pipeline init: Core utilities, readiness promises, learning helpers
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w) => { var bg = window.__seBg = {}; bg.SERVER_URL = 'http://localhost:8080'; bg.SERVER_VOTE_THRESHOLD = 2; bg.API_RATE_LIMIT = 10; bg.MAX_CLOUD_CACHE = 5000; bg.inFlight = new Map(); bg.inFlightUrls = new Map(); bg.apiSem = { active: 0, queue: [] }; bg.debugTiming = false; bg.t0 = performance.now(); bg.debugEvents = []; bg.stateReadyPromise = new Promise(function(r) { bg.resolveStateReady = r; }); bg.serverReadyPromise = new Promise(function(r) { bg.resolveServerReady = r; }); bg.modelsReadyPromise = new Promise(function(r) { bg.resolveModelsReady = r; }); bg.debugLog = function() { if (!bg.debugTiming) return; var a = Array.from(arguments); var e = '[SE:' + Math.round(performance.now() - bg.t0) + 'ms] ' + a.join(' '); console.log(e); bg.debugEvents.push({ time: Math.round(performance.now() - bg.t0), msg: a.join(' ') }); }; bg.dataUrlToImageData = function(dataUrl) { return fetch(dataUrl).then(function(r) { return r.blob(); }).then(function(blob) { return createImageBitmap(blob); }).then(function(bm) { var w = bm.width; var h = bm.height; var m = 416; if (w > m || h > m) { var sc = m / Math.max(w, h); w = Math.round(w * sc); h = Math.round(h * sc); } var c = new OffscreenCanvas(w, h); var ctx = c.getContext('2d'); ctx.drawImage(bm, 0, 0, w, h); bm.close(); return ctx.getImageData(0, 0, w, h); }); }; bg.imageDataToTensor = function(id) { var d = id.data; var w = id.width; var h = id.height; var rgb = new Uint8Array(w * h * 3); for (var i = 0, j = 0; i < d.length; i += 4, j += 3) { rgb[j] = d[i]; rgb[j+1] = d[i+1]; rgb[j+2] = d[i+2]; } return faceapi.tf.tensor3d(rgb, [h, w, 3], 'int32'); }; bg.euclideanDistance = function(a, b) { var sum = 0; for (var i = 0; i < a.length; i++) { var d = a[i] - b[i]; sum += d * d; } return Math.sqrt(sum); }; bg.matchesKnownBlockedFace = function(desc) { var s = window.__seState; for (var i = 0; i < s.knownFaces.length; i++) { if (bg.euclideanDistance(desc, s.knownFaces[i].descriptor) < 0.5) return true; } return false; }; bg.matchesKnownSafeFace = function(desc) { var s = window.__seState; for (var i = 0; i < s.knownSafeFaces.length; i++) { if (bg.euclideanDistance(desc, s.knownSafeFaces[i].descriptor) < 0.4) return true; } return false; }; bg.classifyDescriptor = function(desc) { var s = window.__seState; if (!s.classifierWeights) return 0; var z = s.classifierWeights.bias; for (var i = 0; i < desc.length; i++) { z += s.classifierWeights.weights[i] * desc[i]; } return 1 / (1 + Math.exp(-z)); }; bg.runPersonDetection = function(tensor) { var s = window.__seState; if (!s.personDetector) return Promise.resolve([]); return s.personDetector.detect(tensor, 20, 0.3).then(function(preds) { return preds.filter(function(p) { return p.class === 'person' && p.score > 0.5 && p.bbox[2] > 60 && p.bbox[3] > 60; }); }).catch(function(e) { console.warn('[SE] Person detection error:', e.message); return []; }); }; bg.hashUrl = function(url) { var enc = new TextEncoder(); return crypto.subtle.digest('SHA-256', enc.encode(url)).then(function(buf) { return Array.from(new Uint8Array(buf)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('').substring(0, 16); }); }; bg.notifyTabs = function(url, cw, reason) { browser.tabs.query({}).then(function(tabs) { for (var i = 0; i < tabs.length; i++) { browser.tabs.sendMessage(tabs[i].id, { type: 'classificationOverride', url: url, containsWomen: cw, reason: reason }).catch(function() {}); } }); }; bg.updateBadge = function(on) { browser.browserAction.setBadgeText({ text: on ? 'ON' : 'OFF' }); browser.browserAction.setBadgeBackgroundColor({ color: on ? '#2ecc71' : '#888' }); }; bg.showTemporaryBadge = function(text, color) { browser.browserAction.setBadgeText({ text: text }); browser.browserAction.setBadgeBackgroundColor({ color: color }); setTimeout(function() { bg.updateBadge(window.__seState.blockingEnabled); }, 2000); }; bg.feedHaikuIntoLearning = function(imageUrl, haikuResult, descriptors) { if (!haikuResult || !descriptors || descriptors.length === 0) return; var s = window.__seState; var now = Date.now(); var block = haikuResult.containsWomen; for (var i = 0; i < descriptors.length; i++) { var d = descriptors[i]; if (block) { s.knownFaces.push({ descriptor: d, url: imageUrl, timestamp: now, source: 'haiku' }); if (s.knownFaces.length > 1000) s.knownFaces.shift(); s.trainingData.push({ descriptor: d, label: 1, source: 'haiku' }); } else { s.knownSafeFaces.push({ descriptor: d, url: imageUrl, timestamp: now, source: 'haiku' }); if (s.knownSafeFaces.length > 1000) s.knownSafeFaces.shift(); s.trainingData.push({ descriptor: d, label: 0, source: 'haiku' }); } if (s.trainingData.length > 500) s.trainingData.shift(); } }; bg.enableDebugTiming = function(enabled) { bg.debugTiming = enabled !== false; bg.debugEvents.length = 0; console.log('[SE] Debug timing:', bg.debugTiming ? 'ON' : 'OFF'); return { ok: true }; }; bg.getDebugEvents = function() { return bg.debugEvents; }; console.log('[SE] BG core initialized'); }"
prim__initBgCore : PrimIO ()

---------------------------------------------------------------------------
-- Pipeline init: Server API, batched lookups, cloud API
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w) => { var bg = window.__seBg; bg.serverFetch = function(endpoint, opts) { var s = window.__seState; if (!s.serverEnabled || !s.serverToken) return Promise.resolve(null); var url = bg.SERVER_URL + endpoint; var ctrl = new AbortController(); var t = setTimeout(function() { ctrl.abort(); }, 5000); return fetch(url, Object.assign({}, opts || {}, { signal: ctrl.signal, headers: Object.assign({ 'Authorization': 'Bearer ' + s.serverToken, 'Content-Type': 'application/json' }, (opts && opts.headers) || {}) })).then(function(res) { clearTimeout(t); if (!res.ok) { console.warn('[SE] Server error:', res.status, endpoint); return null; } return res.json(); }).catch(function(err) { clearTimeout(t); console.warn('[SE] Server fetch failed:', err.message); return null; }); }; bg.serverBatchLookup = function(urlHashes) { if (urlHashes.length === 0) return Promise.resolve({}); var hashes = urlHashes.map(function(h) { return h.hash; }); return bg.serverFetch('/api/classifications/batch', { method: 'POST', body: JSON.stringify({ hashes: hashes }) }).then(function(data) { if (!data || !data.results) return {}; var result = {}; for (var i = 0; i < urlHashes.length; i++) { var e = urlHashes[i]; if (data.results[e.hash]) result[e.url] = data.results[e.hash]; } return result; }); }; bg.serverSubmitClassification = function(hash, cw, source, conf) { return bg.serverFetch('/api/classifications', { method: 'POST', body: JSON.stringify({ hash: hash, containsWomen: cw, source: source, confidence: conf || 0.8 }) }); }; bg.serverSubmitDescriptor = function(descriptor, label, conf) { var buffer = new Float32Array(descriptor).buffer; var base64 = btoa(String.fromCharCode.apply(null, new Uint8Array(buffer))); return bg.serverFetch('/api/descriptors', { method: 'POST', body: JSON.stringify({ descriptor: base64, label: label, confidence: conf }) }); }; bg.serverAutoRegister = function() { var s = window.__seState; if (!s.serverDeviceId) { var bytes = new Uint8Array(16); crypto.getRandomValues(bytes); s.serverDeviceId = 'ext-' + Array.from(bytes, function(b) { return b.toString(16).padStart(2, '0'); }).join(''); } var ctrl = new AbortController(); var t = setTimeout(function() { ctrl.abort(); }, 5000); return fetch(bg.SERVER_URL + '/api/register', { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: s.serverDeviceId }) }).then(function(res) { clearTimeout(t); if (!res.ok) { console.warn('[SE] Server registration failed:', res.status); return false; } return res.json().then(function(data) { if (data.token) { s.serverToken = data.token; s.serverEnabled = true; console.log('[SE] Auto-registered with server'); return true; } return false; }); }).catch(function(err) { clearTimeout(t); console.warn('[SE] Server registration error:', err.message); return false; }); }; bg.serverVerifyConnection = function() { return fetch(bg.SERVER_URL + '/api/stats').then(function(res) { if (!res.ok) return { ok: false, error: 'HTTP ' + res.status }; return res.json().then(function(data) { return { ok: true, stats: data }; }); }).catch(function(err) { return { ok: false, error: err.message }; }); }; bg.serverBatch = []; bg.serverBatchTimer = null; bg.flushServerBatch = function() { bg.serverBatchTimer = null; var batch = bg.serverBatch; bg.serverBatch = []; if (batch.length === 0) return; bg.debugLog('Server batch flush:', batch.length, 'URLs'); var t0 = performance.now(); bg.serverReadyPromise.then(function(ready) { var s = window.__seState; if (!ready || !s.serverEnabled || !s.serverToken) { batch.forEach(function(item) { item.resolve(null); }); return; } return Promise.all(batch.map(function(item) { return bg.hashUrl(item.url).then(function(hash) { return { url: item.url, hash: hash }; }); })).then(function(urlHashes) { return bg.serverBatchLookup(urlHashes); }).then(function(results) { var hits = Object.keys(results).length; bg.debugLog('Server batch done:', Math.round(performance.now() - t0), 'ms,', hits, 'hits /', batch.length, 'requested'); for (var i = 0; i < batch.length; i++) { var item = batch[i]; var sv = results[item.url]; if (sv) { var tv = (sv.voteBlock || 0) + (sv.voteSafe || 0); if (tv >= bg.SERVER_VOTE_THRESHOLD) { item.resolve({ containsWomen: sv.containsWomen, reason: 'server', priority: 2 }); continue; } } item.resolve(null); } }); }).catch(function(err) { bg.debugLog('Server batch error:', err.message); batch.forEach(function(item) { item.resolve(null); }); }); }; bg.enqueueServerLookup = function(url) { return new Promise(function(resolve) { bg.serverBatch.push({ url: url, resolve: resolve }); if (!bg.serverBatchTimer) bg.serverBatchTimer = setTimeout(bg.flushServerBatch, 100); if (bg.serverBatch.length >= 20) { clearTimeout(bg.serverBatchTimer); bg.flushServerBatch(); } }); }; bg.resizeImageDataUrl = function(dataUrl, maxDim) { return fetch(dataUrl).then(function(r) { return r.blob(); }).then(function(blob) { return createImageBitmap(blob).then(function(bm) { var w = bm.width; var h = bm.height; if (w <= maxDim && h <= maxDim) { bm.close(); return dataUrl; } var sc = maxDim / Math.max(w, h); w = Math.round(w * sc); h = Math.round(h * sc); var c = new OffscreenCanvas(w, h); var ctx = c.getContext('2d'); ctx.drawImage(bm, 0, 0, w, h); bm.close(); return c.convertToBlob({ type: 'image/jpeg', quality: 0.8 }).then(function(rb) { return new Promise(function(resolve) { var reader = new FileReader(); reader.onload = function() { resolve(reader.result); }; reader.readAsDataURL(rb); }); }); }); }); }; bg.classifyWithHaiku = function(imageDataUrl) { var s = window.__seState; if (!s.anthropicApiKey) return Promise.resolve(null); return bg.resizeImageDataUrl(imageDataUrl, 512).then(function(resized) { var match = resized.match(/^data:(image\\/\\w+);base64,(.+)$/); if (!match) return null; return fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': s.anthropicApiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 50, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } }, { type: 'text', text: 'Does this image contain a woman or girl? Answer with exactly one word: YES or NO.' }] }] }) }).then(function(resp) { if (!resp.ok) { console.warn('[SE] Haiku API error:', resp.status); return null; } return resp.json(); }).then(function(data) { if (!data) return null; var answer = (data.content && data.content[0] && data.content[0].text || '').trim().toUpperCase(); var today = new Date().toISOString().slice(0, 10); if (s.cloudCallsDate !== today) { s.cloudCallsDate = today; s.cloudCallsToday = 0; } s.cloudCallsToday++; return { containsWomen: answer === 'YES' || answer.indexOf('YES') === 0, source: 'haiku', raw: answer }; }); }).catch(function(e) { console.warn('[SE] Haiku error:', e.message); return null; }); }; bg.acquireApiSlot = function() { if (bg.apiSem.active < bg.API_RATE_LIMIT) { bg.apiSem.active++; return Promise.resolve(true); } return new Promise(function(resolve) { bg.apiSem.queue.push(resolve); }); }; bg.releaseApiSlot = function() { bg.apiSem.active--; if (bg.apiSem.queue.length > 0) { var next = bg.apiSem.queue.shift(); bg.apiSem.active++; next(true); } }; bg.rateLimitedHaikuCall = function(imageDataUrl) { return bg.acquireApiSlot().then(function() { return bg.classifyWithHaiku(imageDataUrl).then(function(r) { bg.releaseApiSlot(); return r; }).catch(function(e) { bg.releaseApiSlot(); throw e; }); }); }; bg.cloudClassify = function(imageUrl, imageDataUrl, localResult) { var s = window.__seState; if (s.cloudCache[imageUrl]) { s.cloudSavedCount++; return Promise.resolve(Object.assign({}, s.cloudCache[imageUrl], { source: 'cloud-cache' })); } if (bg.inFlightUrls.has(imageUrl)) return bg.inFlightUrls.get(imageUrl); if (s.cloudMode === 'uncertain' && localResult) { if (localResult.source === 'user') return Promise.resolve(null); if (localResult.knnDistance !== undefined && localResult.knnDistance < 0.3) { s.cloudSavedCount++; return Promise.resolve(null); } if (localResult.classifierConfidence !== undefined && localResult.classifierConfidence > 0.9) { s.cloudSavedCount++; return Promise.resolve(null); } } var p = bg.rateLimitedHaikuCall(imageDataUrl).then(function(r) { bg.inFlightUrls.delete(imageUrl); if (r) { s.cloudCache[imageUrl] = { containsWomen: r.containsWomen, timestamp: Date.now() }; var keys = Object.keys(s.cloudCache); if (keys.length > bg.MAX_CLOUD_CACHE) { var sorted = keys.sort(function(a, b) { return s.cloudCache[a].timestamp - s.cloudCache[b].timestamp; }); for (var i = 0; i < sorted.length - bg.MAX_CLOUD_CACHE; i++) delete s.cloudCache[sorted[i]]; } console.log('[SE] Haiku:', r.raw, 'for', imageUrl.substring(0, 60)); } return r; }).catch(function() { bg.inFlightUrls.delete(imageUrl); return null; }); bg.inFlightUrls.set(imageUrl, p); return p; }; console.log('[SE] BG server+cloud initialized'); }"
prim__initBgServer : PrimIO ()

---------------------------------------------------------------------------
-- Pipeline init: ML inference, classification pipeline, prefetch, cache
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w) => { var bg = window.__seBg; bg.runMLInference = function(url, imageDataUrl) { var s = window.__seState; return bg.dataUrlToImageData(imageDataUrl).then(function(imageData) { var hasLearning = s.knownFaces.length > 0 || s.knownSafeFaces.length > 0 || s.classifierWeights !== null; var faceTensor = bg.imageDataToTensor(imageData); var personTensor = s.personDetector ? bg.imageDataToTensor(imageData) : null; var faceP; if (hasLearning) { faceP = faceapi.detectAllFaces(faceTensor, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 })).withFaceLandmarks(true).withFaceDescriptors().withAgeAndGender(); } else { faceP = faceapi.detectAllFaces(faceTensor, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 })).withAgeAndGender(); } var personP = personTensor ? bg.runPersonDetection(personTensor) : Promise.resolve([]); var t0 = performance.now(); var timeout = new Promise(function(_, rej) { setTimeout(function() { rej(new Error('detection_timeout')); }, 60000); }); return Promise.race([Promise.all([faceP, personP]), timeout]).then(function(results) { faceTensor.dispose(); if (personTensor) personTensor.dispose(); var dets = results[0]; var persons = results[1]; console.log('[SE] Detection:', Math.round(performance.now() - t0), 'ms, faces:', dets ? dets.length : 0, 'persons:', persons ? persons.length : 0); var cw = false; var reason = ''; var descriptors = []; if (dets && dets.length > 0) { for (var i = 0; i < dets.length; i++) { var det = dets[i]; var fb = false; var fs = false; if (!(det.gender === 'male' && det.genderProbability >= 0.65)) fb = true; if (hasLearning && det.descriptor) { var desc = Array.from(det.descriptor); descriptors.push(desc); if (bg.matchesKnownBlockedFace(desc)) fb = true; if (bg.matchesKnownSafeFace(desc)) fs = true; if (s.classifierWeights && bg.classifyDescriptor(desc) > 0.5) fb = true; } if (fb && !fs) { cw = true; reason = 'face'; break; } } } else if (persons && persons.length > 0) { cw = true; reason = 'person-no-face'; } return { containsWomen: cw, reason: reason, faceCount: dets ? dets.length : 0, personCount: persons ? persons.length : 0, descriptors: descriptors }; }).catch(function(err) { try { faceTensor.dispose(); } catch(e) {} try { if (personTensor) personTensor.dispose(); } catch(e) {} throw err; }); }).catch(function(err) { console.warn('[SE] ML inference error:', url.substring(0, 60), err.message); return { containsWomen: true, reason: 'decode-error' }; }); }; bg.extractDescriptorsFromDataUrl = function(imageDataUrl) { return bg.modelsReadyPromise.then(function(loaded) { if (!loaded) return []; return bg.dataUrlToImageData(imageDataUrl).then(function(imageData) { var tensor = bg.imageDataToTensor(imageData); return faceapi.detectAllFaces(tensor, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 })).withFaceLandmarks(true).withFaceDescriptors().then(function(dets) { tensor.dispose(); return dets.map(function(d) { return Array.from(d.descriptor); }); }).catch(function(e) { tensor.dispose(); throw e; }); }); }).catch(function(err) { console.error('[SE] Descriptor extraction error:', err); return []; }); }; bg.classifyImage = function(url, imageDataUrl) { var s = window.__seState; var su = url.substring(0, 60); if (s.manualBlocklist.includes(url)) { bg.debugLog('classifyImage USER BLOCK:', su); return Promise.resolve({ containsWomen: true, reason: 'user-block' }); } if (s.manualSafelist.includes(url)) { bg.debugLog('classifyImage USER SAFE:', su); return Promise.resolve({ containsWomen: false, reason: 'user-safe' }); } if (s.cloudCache[url]) { bg.debugLog('classifyImage CACHE HIT:', su); return Promise.resolve({ containsWomen: s.cloudCache[url].containsWomen, reason: 'cloud-cache' }); } if (bg.inFlight.has(url)) { bg.debugLog('classifyImage DEDUP:', su); return bg.inFlight.get(url); } bg.debugLog('classifyImage START:', su); var t0 = performance.now(); var sources = []; if (s.serverEnabled && s.serverToken) { sources.push(bg.enqueueServerLookup(url).then(function(r) { return r ? Object.assign(r, { priority: 2 }) : null; }).catch(function() { return null; })); } var mlP = bg.modelsReadyPromise.then(function(loaded) { if (!loaded) return { containsWomen: true, reason: 'models-not-loaded', priority: 1 }; return bg.runMLInference(url, imageDataUrl).then(function(r) { r.priority = 1; if (s.serverEnabled && s.serverToken) bg.hashUrl(url).then(function(hash) { bg.serverSubmitClassification(hash, r.containsWomen, r.reason, 0.8); }).catch(function() {}); return r; }); }).catch(function(err) { console.error('[SE] ML error:', err.message); return { containsWomen: true, reason: 'ml-error', priority: 1 }; }); sources.push(mlP); if (s.anthropicApiKey && s.cloudMode !== 'never') { if (s.cloudMode === 'all') { sources.push(bg.cloudClassify(url, imageDataUrl, null).then(function(r) { return r ? { containsWomen: r.containsWomen, reason: 'haiku', priority: 3, raw: r.raw } : null; }).catch(function() { return null; })); } else { sources.push(mlP.then(function(ml) { if (ml.knnDistance !== undefined && ml.knnDistance < 0.3) { s.cloudSavedCount++; return null; } if (ml.classifierConfidence !== undefined && ml.classifierConfidence > 0.9) { s.cloudSavedCount++; return null; } return bg.cloudClassify(url, imageDataUrl, { source: ml.reason, knnDistance: ml.knnDistance, classifierConfidence: ml.classifierConfidence }).then(function(r) { return r ? { containsWomen: r.containsWomen, reason: 'haiku', priority: 3, raw: r.raw } : null; }); }).catch(function() { return null; })); } } var pNames = ['cache', 'ML', 'server', 'haiku', 'user']; var pipeline = new Promise(function(resolve) { var best = null; var mlDesc = null; var resolved = false; var rem = sources.length; function handle(result) { if (!result) { rem--; if (rem === 0 && !resolved) { resolved = true; resolve(best || { containsWomen: false, reason: 'no-sources' }); } return; } var elapsed = Math.round(performance.now() - t0); bg.debugLog('  ' + pNames[result.priority] + ':', result.containsWomen ? 'BLOCK' : 'SAFE', '(' + elapsed + 'ms)', su); if (result.priority === 1 && result.descriptors) mlDesc = result.descriptors; if (best && result.priority < best.priority && !result.containsWomen) { bg.debugLog('  IGNORED safe', su); rem--; if (rem === 0 && !resolved) { resolved = true; resolve(best); } return; } if (best && best.containsWomen && !result.containsWomen && result.priority < 4) { bg.debugLog('  STRICT: keeping block', su); rem--; if (rem === 0 && !resolved) { resolved = true; resolve(best); } return; } var isFirst = !best; var changed = best && result.containsWomen !== best.containsWomen; best = result; s.cloudCache[url] = { containsWomen: result.containsWomen, timestamp: Date.now() }; if (!resolved) { resolved = true; resolve(result); } if (!isFirst && changed) { console.log('[SE] Override:', result.reason, result.containsWomen ? 'block' : 'safe', url.substring(0, 60)); bg.notifyTabs(url, result.containsWomen, result.reason); } if (result.priority === 3) { if (mlDesc && mlDesc.length > 0) bg.feedHaikuIntoLearning(url, { containsWomen: result.containsWomen }, mlDesc); if (s.serverEnabled && s.serverToken) bg.hashUrl(url).then(function(hash) { bg.serverSubmitClassification(hash, result.containsWomen, 'haiku', 0.95); }).catch(function() {}); } rem--; } sources.forEach(function(src) { src.then(handle).catch(function() { handle(null); }); }); }); bg.inFlight.set(url, pipeline); pipeline.then(function() { bg.inFlight.delete(url); }).catch(function() { bg.inFlight.delete(url); }); return pipeline; }; bg.prefetchServer = function(urls) { if (urls.length === 0) return Promise.resolve({ ok: true, cached: 0 }); return bg.stateReadyPromise.then(function() { return Promise.race([bg.serverReadyPromise, new Promise(function(r) { setTimeout(function() { r(false); }, 2000); })]); }).then(function(ready) { var s = window.__seState; if (!ready || !s.serverEnabled || !s.serverToken) return { ok: true, cached: 0 }; var uncached = urls.filter(function(u) { return !s.cloudCache[u]; }); if (uncached.length === 0) return { ok: true, cached: 0 }; bg.debugLog('prefetchServer:', urls.length, 'URLs'); var t0 = performance.now(); return Promise.all(uncached.map(function(u) { return bg.hashUrl(u).then(function(h) { return { url: u, hash: h }; }); })).then(function(uh) { return bg.serverBatchLookup(uh); }).then(function(results) { var cached = 0; for (var i = 0; i < uncached.length; i++) { var u = uncached[i]; var sv = results[u]; if (sv) { var tv = (sv.voteBlock || 0) + (sv.voteSafe || 0); if (tv >= bg.SERVER_VOTE_THRESHOLD) { s.cloudCache[u] = { containsWomen: sv.containsWomen, timestamp: Date.now() }; cached++; } } } bg.debugLog('prefetchServer done:', Math.round(performance.now() - t0), 'ms,', cached, 'cached /', uncached.length, 'queried'); return { ok: true, cached: cached }; }); }).catch(function() { return { ok: true, cached: 0 }; }); }; bg.checkCacheGated = function(url) { return bg.stateReadyPromise.then(function() { var s = window.__seState; if (s.manualBlocklist.includes(url)) return { hit: true, containsWomen: true, reason: 'user-block' }; if (s.manualSafelist.includes(url)) return { hit: true, containsWomen: false, reason: 'user-safe' }; if (s.cloudCache[url]) return { hit: true, containsWomen: s.cloudCache[url].containsWomen, reason: 'cloud-cache' }; return { hit: false }; }); }; bg.fetchImageAsDataUrl = function(url) { return fetch(url).then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); }).then(function(blob) { return new Promise(function(resolve, reject) { var reader = new FileReader(); reader.onload = function() { resolve(reader.result); }; reader.onerror = reject; reader.readAsDataURL(blob); }); }).catch(function(err) { console.error('[SE] Failed to fetch image:', url, err); return null; }); }; bg.handleServerBatchLookup = function(urls) { return Promise.all(urls.map(function(u) { return bg.hashUrl(u).then(function(h) { return { url: u, hash: h }; }); })).then(function(uh) { return bg.serverBatchLookup(uh); }); }; bg.handleServerSubmitClassification = function(url, cw, source, conf) { return bg.hashUrl(url).then(function(hash) { return bg.serverSubmitClassification(hash, cw, source, conf); }).then(function() { return { success: true }; }); }; bg.setupContextMenuClickHandler = function() { var menusAPI = browser.menus || browser.contextMenus; if (!menusAPI) return; menusAPI.onClicked.addListener(function(info, tab) { var s = window.__seState; var imageUrl = info.srcUrl || s.lastContextMenuImageUrl; s.lastContextMenuImageUrl = null; if (!imageUrl) return; var tabId = tab ? tab.id : null; if (info.menuItemId === 'se-block-image' || info.menuItemId === 'shmirat-block') { if (!s.manualBlocklist.includes(imageUrl)) s.manualBlocklist.push(imageUrl); s.manualSafelist = s.manualSafelist.filter(function(u) { return u !== imageUrl; }); s.cloudCache[imageUrl] = { containsWomen: true, timestamp: Date.now() }; bg.showTemporaryBadge('\\u2713', '#2ecc71'); if (tabId) browser.tabs.sendMessage(tabId, { type: 'blockAndLearn', url: imageUrl }).catch(function() {}); } else if (info.menuItemId === 'se-safe-image' || info.menuItemId === 'shmirat-safe') { if (!s.manualSafelist.includes(imageUrl)) s.manualSafelist.push(imageUrl); s.manualBlocklist = s.manualBlocklist.filter(function(u) { return u !== imageUrl; }); s.cloudCache[imageUrl] = { containsWomen: false, timestamp: Date.now() }; if (tabId) browser.tabs.sendMessage(tabId, { type: 'safeAndLearn', url: imageUrl }).catch(function() {}); } }); }; console.log('[SE] BG pipeline initialized'); }"
prim__initBgPipeline : PrimIO ()

---------------------------------------------------------------------------
-- Model loading — resolves modelsReadyPromise when done
---------------------------------------------------------------------------

%foreign "javascript:lambda:(modelPath, wasmPath, w) => { (async function() { try { await faceapi.tf.setBackend('webgl'); await faceapi.tf.ready(); console.log('[SE] TF backend: webgl'); } catch(e) { try { faceapi.tf.setWasmPaths(wasmPath); await faceapi.tf.setBackend('wasm'); await faceapi.tf.ready(); console.log('[SE] TF backend: wasm'); } catch(e2) { await faceapi.tf.setBackend('cpu'); await faceapi.tf.ready(); console.log('[SE] TF backend: cpu'); } } window.__seState.mlBackend = faceapi.tf.getBackend(); console.log('[SE] TF backend:', faceapi.tf.getBackend()); await faceapi.nets.tinyFaceDetector.loadFromUri(modelPath); await faceapi.nets.ageGenderNet.loadFromUri(modelPath); await faceapi.nets.faceLandmark68TinyNet.loadFromUri(modelPath); await faceapi.nets.faceRecognitionNet.loadFromUri(modelPath); console.log('[SE] Face models loaded'); try { var cocoModelUrl = modelPath + 'coco-ssd/model.json'; window.__seState.personDetector = await cocoSsd.load({ base: 'lite_mobilenet_v2', modelUrl: cocoModelUrl }); console.log('[SE] COCO-SSD loaded'); } catch(cocoErr) { console.warn('[SE] COCO-SSD failed:', cocoErr.message); window.__seState.personDetector = null; } window.__seState.modelsLoaded = true; console.log('[SE] All models loaded'); if (window.__seBg && window.__seBg.resolveModelsReady) { window.__seBg.resolveModelsReady(true); } })().catch(function(err) { console.error('[SE] Model loading failed:', err); window.__seState.modelsLoaded = false; if (window.__seBg && window.__seBg.resolveModelsReady) { window.__seBg.resolveModelsReady(false); } }); }"
prim__loadAllModels : String -> String -> PrimIO ()

loadModels : IO ()
loadModels = do
  seLog "Loading ML models..."
  modelPath <- getURL "models/"
  wasmPath  <- getURL "lib/wasm/"
  primIO $ prim__loadAllModels modelPath wasmPath

---------------------------------------------------------------------------
-- Logistic regression trainer (JS implementation for runtime)
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w) => { var s = window.__seState; if (s.trainingData.length < 10) return; var w128 = new Array(128).fill(0); var b = 0; var lr = 0.01; for (var iter = 0; iter < 100; iter++) { for (var ex of s.trainingData) { var dot = 0; for (var j = 0; j < 128; j++) dot += w128[j] * ex.descriptor[j]; var pred = 1 / (1 + Math.exp(-(dot + b))); var err = pred - ex.label; for (var j = 0; j < 128; j++) w128[j] -= lr * err * ex.descriptor[j]; b -= lr * err; } } s.classifierWeights = { weights: w128, bias: b }; console.log('[SE] Classifier trained on', s.trainingData.length, 'examples'); }"
prim__trainClassifier : PrimIO ()

---------------------------------------------------------------------------
-- Handler helpers
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w) => ({ success: true })"
prim__successResult : PrimIO JsValue

%foreign "javascript:lambda:(w) => ({})"
prim__emptyResult : PrimIO JsValue

%foreign "javascript:lambda:(w) => null"
prim__nullResult : PrimIO JsValue

%foreign "javascript:lambda:(v, w) => typeof v === 'string' ? v : (v == null ? '' : String(v))"
prim__toStr : JsValue -> PrimIO String

toStr : JsValue -> IO String
toStr v = primIO $ prim__toStr v

---------------------------------------------------------------------------
-- Handler: getState
---------------------------------------------------------------------------

%foreign "javascript:lambda:(domain, w) => { var s = window.__seState; return { blockingEnabled: s.blockingEnabled, whitelist: s.whitelist, domain: domain }; }"
prim__getState : String -> PrimIO JsValue

---------------------------------------------------------------------------
-- Handler: toggle
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w) => { var s = window.__seState; s.blockingEnabled = !s.blockingEnabled; window.__seBg.updateBadge(s.blockingEnabled); return { blockingEnabled: s.blockingEnabled, whitelist: s.whitelist }; }"
prim__toggle : PrimIO JsValue

---------------------------------------------------------------------------
-- Handler: addWhitelist
---------------------------------------------------------------------------

%foreign "javascript:lambda:(domain, w) => { var s = window.__seState; if (domain && !s.whitelist.includes(domain)) s.whitelist.push(domain); return { blockingEnabled: s.blockingEnabled, whitelist: s.whitelist }; }"
prim__addWhitelist : String -> PrimIO JsValue

---------------------------------------------------------------------------
-- Handler: removeWhitelist
---------------------------------------------------------------------------

%foreign "javascript:lambda:(domain, w) => { var s = window.__seState; s.whitelist = s.whitelist.filter(function(d) { return d !== domain; }); return { blockingEnabled: s.blockingEnabled, whitelist: s.whitelist }; }"
prim__removeWhitelist : String -> PrimIO JsValue

---------------------------------------------------------------------------
-- Handler: getBlockingState
---------------------------------------------------------------------------

%foreign "javascript:lambda:(tabUrl, w) => { var s = window.__seState; var dominated = false; try { var h = new URL(tabUrl).hostname; dominated = s.whitelist.some(function(d) { return h === d || h.endsWith('.' + d); }); } catch(e) {} return { blockingEnabled: s.blockingEnabled, whitelisted: dominated, manualBlocklist: s.manualBlocklist, manualSafelist: s.manualSafelist, serverEnabled: s.serverEnabled }; }"
prim__getBlockingState : String -> PrimIO JsValue

---------------------------------------------------------------------------
-- Handler: getCloudStats
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w) => { var s = window.__seState; return { cloudMode: s.cloudMode, hasApiKey: !!s.anthropicApiKey, cloudCallsToday: s.cloudCallsToday || 0, cloudSavedCount: s.cloudSavedCount || 0, cloudCacheSize: Object.keys(s.cloudCache || {}).length }; }"
prim__getCloudStats : PrimIO JsValue

---------------------------------------------------------------------------
-- Handler: setApiKey
---------------------------------------------------------------------------

%foreign "javascript:lambda:(key, w) => { window.__seState.anthropicApiKey = key || ''; }"
prim__setApiKey : String -> PrimIO ()

---------------------------------------------------------------------------
-- Handler: setCloudMode
---------------------------------------------------------------------------

%foreign "javascript:lambda:(mode, w) => { window.__seState.cloudMode = mode || 'all'; }"
prim__setCloudMode : String -> PrimIO ()

---------------------------------------------------------------------------
-- Handler: getLearningStats
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w) => { var s = window.__seState; return { knownFacesCount: s.knownFaces.length, knownSafeFacesCount: s.knownSafeFaces.length, trainingDataCount: s.trainingData.length, classifierTrained: s.classifierWeights !== null }; }"
prim__getLearningStats : PrimIO JsValue

---------------------------------------------------------------------------
-- Handler: learnBlock
---------------------------------------------------------------------------

%foreign "javascript:lambda:(msg, w) => { var s = window.__seState; var url = msg.url; var descriptors = msg.descriptors || []; if (!s.manualBlocklist.includes(url)) s.manualBlocklist.push(url); s.manualSafelist = s.manualSafelist.filter(function(u) { return u !== url; }); s.cloudCache[url] = { containsWomen: true, timestamp: Date.now() }; var now = Date.now(); for (var i = 0; i < descriptors.length; i++) { s.knownFaces.push({ descriptor: descriptors[i], url: url, timestamp: now }); if (s.knownFaces.length > 1000) s.knownFaces.shift(); s.trainingData.push({ descriptor: descriptors[i], label: 1 }); if (s.trainingData.length > 500) s.trainingData.shift(); } return { success: true }; }"
prim__learnBlock : RuntimeMessage -> PrimIO JsValue

---------------------------------------------------------------------------
-- Handler: learnSafe
---------------------------------------------------------------------------

%foreign "javascript:lambda:(msg, w) => { var s = window.__seState; var url = msg.url; var descriptors = msg.descriptors || []; if (!s.manualSafelist.includes(url)) s.manualSafelist.push(url); s.manualBlocklist = s.manualBlocklist.filter(function(u) { return u !== url; }); s.cloudCache[url] = { containsWomen: false, timestamp: Date.now() }; var now = Date.now(); for (var i = 0; i < descriptors.length; i++) { s.knownSafeFaces.push({ descriptor: descriptors[i], url: url, timestamp: now }); if (s.knownSafeFaces.length > 1000) s.knownSafeFaces.shift(); s.trainingData.push({ descriptor: descriptors[i], label: 0 }); if (s.trainingData.length > 500) s.trainingData.shift(); } return { success: true }; }"
prim__learnSafe : RuntimeMessage -> PrimIO JsValue

---------------------------------------------------------------------------
-- Handler: resetLearning
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w) => { var s = window.__seState; s.knownFaces = []; s.knownSafeFaces = []; s.manualBlocklist = []; s.manualSafelist = []; s.trainingData = []; s.classifierWeights = null; return { success: true }; }"
prim__resetLearning : PrimIO JsValue

---------------------------------------------------------------------------
-- Handler: exportLearning
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w) => { var s = window.__seState; return { knownFaces: s.knownFaces, knownSafeFaces: s.knownSafeFaces, manualBlocklist: s.manualBlocklist, manualSafelist: s.manualSafelist, trainingData: s.trainingData, classifierWeights: s.classifierWeights }; }"
prim__exportLearning : PrimIO JsValue

---------------------------------------------------------------------------
-- Handler: importLearning
---------------------------------------------------------------------------

%foreign "javascript:lambda:(msg, w) => { var s = window.__seState; var d = msg.data || {}; if (d.knownFaces) { s.knownFaces = s.knownFaces.concat(d.knownFaces); if (s.knownFaces.length > 1000) s.knownFaces = s.knownFaces.slice(-1000); } if (d.knownSafeFaces) { s.knownSafeFaces = s.knownSafeFaces.concat(d.knownSafeFaces); if (s.knownSafeFaces.length > 1000) s.knownSafeFaces = s.knownSafeFaces.slice(-1000); } if (d.manualBlocklist) { for (var i = 0; i < d.manualBlocklist.length; i++) { if (!s.manualBlocklist.includes(d.manualBlocklist[i])) s.manualBlocklist.push(d.manualBlocklist[i]); } } if (d.manualSafelist) { for (var i = 0; i < d.manualSafelist.length; i++) { if (!s.manualSafelist.includes(d.manualSafelist[i])) s.manualSafelist.push(d.manualSafelist[i]); } } if (d.trainingData) { s.trainingData = s.trainingData.concat(d.trainingData); if (s.trainingData.length > 500) s.trainingData = s.trainingData.slice(-500); } if (d.classifierWeights) s.classifierWeights = d.classifierWeights; return { success: true }; }"
prim__importLearning : RuntimeMessage -> PrimIO JsValue

---------------------------------------------------------------------------
-- Handler: clearCloudCache
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w) => { var s = window.__seState; var count = Object.keys(s.cloudCache).length; s.cloudCache = {}; console.log('[SE] Cloud cache cleared:', count, 'entries'); return { success: true, cleared: count }; }"
prim__clearCloudCache : PrimIO JsValue

---------------------------------------------------------------------------
-- Handler: blockImage / safeImage (manual user flags)
---------------------------------------------------------------------------

%foreign "javascript:lambda:(msg, senderId, w) => { var s = window.__seState; var url = msg.url; if (!s.manualBlocklist.includes(url)) s.manualBlocklist.push(url); s.manualSafelist = s.manualSafelist.filter(function(u) { return u !== url; }); s.cloudCache[url] = { containsWomen: true, timestamp: Date.now() }; if (senderId >= 0) { try { browser.tabs.sendMessage(senderId, { type: 'blockAndLearn', url: url }).catch(function() {}); } catch(e) {} } return { success: true }; }"
prim__blockImage : RuntimeMessage -> Int32 -> PrimIO JsValue

%foreign "javascript:lambda:(msg, senderId, w) => { var s = window.__seState; var url = msg.url; if (!s.manualSafelist.includes(url)) s.manualSafelist.push(url); s.manualBlocklist = s.manualBlocklist.filter(function(u) { return u !== url; }); s.cloudCache[url] = { containsWomen: false, timestamp: Date.now() }; if (senderId >= 0) { try { browser.tabs.sendMessage(senderId, { type: 'safeAndLearn', url: url }).catch(function() {}); } catch(e) {} } return { success: true }; }"
prim__safeImage : RuntimeMessage -> Int32 -> PrimIO JsValue

---------------------------------------------------------------------------
-- Handler: getStats (queries content script via pipeline)
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w) => { var s = window.__seState; return browser.tabs.query({active: true, currentWindow: true}).then(function(tabs) { var tab = tabs[0]; if (!tab) return { scanned: 0, hidden: 0, backend: s.mlBackend, modelsLoaded: s.modelsLoaded, personDetectorLoaded: s.personDetector !== null }; return browser.tabs.sendMessage(tab.id, {type: 'getStats'}).then(function(cs) { return Object.assign(cs || {}, { backend: s.mlBackend, modelsLoaded: s.modelsLoaded, personDetectorLoaded: s.personDetector !== null }); }).catch(function() { return { scanned: 0, hidden: 0, backend: s.mlBackend, modelsLoaded: s.modelsLoaded, personDetectorLoaded: s.personDetector !== null }; }); }); }"
prim__getStats : PrimIO JsValue

---------------------------------------------------------------------------
-- Handler: getServerConfig
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w) => { var s = window.__seState; return { serverUrl: 'http://localhost:8080', hasToken: !!s.serverToken, serverEnabled: s.serverEnabled }; }"
prim__getServerConfig : PrimIO JsValue

---------------------------------------------------------------------------
-- Handler: getDebugStatus
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w) => { var s = window.__seState; return { blockingEnabled: s.blockingEnabled, whitelistCount: s.whitelist.length, knownFacesCount: s.knownFaces.length, knownSafeFacesCount: s.knownSafeFaces.length, trainingDataCount: s.trainingData.length, classifierTrained: s.classifierWeights !== null }; }"
prim__getDebugStatus : PrimIO JsValue

---------------------------------------------------------------------------
-- Handler: contextMenuImage
---------------------------------------------------------------------------

%foreign "javascript:lambda:(url, w) => { window.__seState.lastContextMenuImageUrl = url || null; return { ok: true }; }"
prim__contextMenuImage : String -> PrimIO JsValue

---------------------------------------------------------------------------
-- Pipeline handlers (delegate to background-pipeline.js)
---------------------------------------------------------------------------

%foreign "javascript:lambda:(url, imageDataUrl, w) => window.__seBg.classifyImage(url, imageDataUrl)"
prim__classifyImage : String -> String -> PrimIO JsValue

%foreign "javascript:lambda:(imageDataUrl, w) => window.__seBg.extractDescriptorsFromDataUrl(imageDataUrl)"
prim__extractDescriptors : String -> PrimIO JsValue

%foreign "javascript:lambda:(msg, w) => window.__seBg.prefetchServer(msg.urls || [])"
prim__prefetchServer : RuntimeMessage -> PrimIO JsValue

%foreign "javascript:lambda:(url, w) => window.__seBg.checkCacheGated(url)"
prim__checkCache : String -> PrimIO JsValue

%foreign "javascript:lambda:(url, w) => window.__seBg.fetchImageAsDataUrl(url)"
prim__fetchImage : String -> PrimIO JsValue

%foreign "javascript:lambda:(w) => window.__seBg.serverVerifyConnection()"
prim__verifyServer : PrimIO JsValue

%foreign "javascript:lambda:(msg, w) => window.__seBg.handleServerBatchLookup(msg.urls || [])"
prim__serverBatchLookup : RuntimeMessage -> PrimIO JsValue

%foreign "javascript:lambda:(msg, w) => window.__seBg.handleServerSubmitClassification(msg.url, msg.containsWomen, msg.source, msg.confidence)"
prim__serverSubmitClassification : RuntimeMessage -> PrimIO JsValue

%foreign "javascript:lambda:(msg, w) => window.__seBg.serverSubmitDescriptor(msg.descriptor, msg.label, msg.confidence)"
prim__serverSubmitDescriptor : RuntimeMessage -> PrimIO JsValue

%foreign "javascript:lambda:(msg, w) => { var bg = window.__seBg; var s = window.__seState; var imageUrl = msg.imageUrl; var imageDataUrl = msg.imageDataUrl; var descriptors = msg.descriptors || []; if (!s.anthropicApiKey) return Promise.resolve(null); if (s.cloudMode === 'never') return Promise.resolve(null); if (s.cloudCache[imageUrl]) { s.cloudSavedCount++; return Promise.resolve({ containsWomen: s.cloudCache[imageUrl].containsWomen, source: 'cloud-cache' }); } return bg.cloudClassify(imageUrl, imageDataUrl, null).then(function(r) { if (r && descriptors.length > 0) bg.feedHaikuIntoLearning(imageUrl, r, descriptors); return r; }); }"
prim__classifyCloud : RuntimeMessage -> PrimIO JsValue

---------------------------------------------------------------------------
-- Pipeline debug handlers
---------------------------------------------------------------------------

%foreign "javascript:lambda:(enabled, w) => window.__seBg.enableDebugTiming(enabled)"
prim__enableDebugTiming : Bool -> PrimIO JsValue

%foreign "javascript:lambda:(w) => window.__seBg.getDebugEvents()"
prim__getDebugEvents : PrimIO JsValue

---------------------------------------------------------------------------
-- Reload active tab (used after toggle/whitelist changes)
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w) => { browser.tabs.query({active: true, currentWindow: true}).then(function(tabs) { if (tabs[0]) browser.tabs.reload(tabs[0].id); }).catch(function() {}); }"
prim__reloadActiveTab : PrimIO ()

---------------------------------------------------------------------------
-- Message handler — Idris dispatch, FFI execution
---------------------------------------------------------------------------

export
handleMessage : RuntimeMessage -> MessageSender -> (JsValue -> IO ()) -> IO ()
handleMessage msg sender respond = do
  msgT <- msgType msg
  case msgT of
    -- State queries
    "getState" => do
      domainVal <- msgGet msg "domain"
      domain <- primIO $ prim__toStr domainVal
      result <- primIO $ prim__getState domain
      respond result

    "toggle" => do
      result <- primIO prim__toggle
      primIO prim__saveState
      primIO prim__reloadActiveTab
      respond result

    "addWhitelist" => do
      domainVal <- msgGet msg "domain"
      domain <- primIO $ prim__toStr domainVal
      result <- primIO $ prim__addWhitelist domain
      primIO prim__saveState
      primIO prim__reloadActiveTab
      respond result

    "removeWhitelist" => do
      domainVal <- msgGet msg "domain"
      domain <- primIO $ prim__toStr domainVal
      result <- primIO $ prim__removeWhitelist domain
      primIO prim__saveState
      primIO prim__reloadActiveTab
      respond result

    "getBlockingState" => do
      tabUrl <- senderTabUrl sender
      result <- primIO $ prim__getBlockingState tabUrl
      respond result

    -- Cloud
    "getCloudStats" => do
      result <- primIO prim__getCloudStats
      respond result

    "setApiKey" => do
      keyVal <- msgGet msg "key"
      key <- primIO $ prim__toStr keyVal
      primIO $ prim__setApiKey key
      primIO prim__saveState
      result <- primIO prim__successResult
      respond result

    "setCloudMode" => do
      modeVal <- msgGet msg "mode"
      mode <- primIO $ prim__toStr modeVal
      primIO $ prim__setCloudMode mode
      primIO prim__saveState
      result <- primIO prim__successResult
      respond result

    "classifyCloud" => do
      result <- primIO $ prim__classifyCloud msg
      primIO prim__saveState
      respond result

    "clearCloudCache" => do
      result <- primIO prim__clearCloudCache
      primIO prim__saveState
      respond result

    -- Learning
    "getLearningStats" => do
      result <- primIO prim__getLearningStats
      respond result

    "learnBlock" => do
      result <- primIO $ prim__learnBlock msg
      primIO prim__trainClassifier
      primIO prim__saveLearningData
      respond result

    "learnSafe" => do
      result <- primIO $ prim__learnSafe msg
      primIO prim__trainClassifier
      primIO prim__saveLearningData
      respond result

    "resetLearning" => do
      result <- primIO prim__resetLearning
      primIO prim__saveLearningData
      respond result

    "exportLearning" => do
      result <- primIO prim__exportLearning
      respond result

    "importLearning" => do
      result <- primIO $ prim__importLearning msg
      primIO prim__trainClassifier
      primIO prim__saveLearningData
      respond result

    -- Manual flags
    "blockImage" => do
      tabId <- senderTabId sender
      result <- primIO $ prim__blockImage msg tabId
      primIO prim__saveLearningData
      respond result

    "safeImage" => do
      tabId <- senderTabId sender
      result <- primIO $ prim__safeImage msg tabId
      primIO prim__saveLearningData
      respond result

    -- Pipeline handlers (delegate to background-pipeline.js)
    "checkCache" => do
      urlVal <- msgGet msg "url"
      url <- primIO $ prim__toStr urlVal
      result <- primIO $ prim__checkCache url
      respond result

    "classifyImage" => do
      urlVal <- msgGet msg "url"
      url <- primIO $ prim__toStr urlVal
      dataUrlVal <- msgGet msg "imageDataUrl"
      dataUrl <- primIO $ prim__toStr dataUrlVal
      result <- primIO $ prim__classifyImage url dataUrl
      respond result

    "extractDescriptors" => do
      dataUrlVal <- msgGet msg "imageDataUrl"
      dataUrl <- primIO $ prim__toStr dataUrlVal
      result <- primIO $ prim__extractDescriptors dataUrl
      respond result

    "fetchImage" => do
      urlVal <- msgGet msg "url"
      url <- primIO $ prim__toStr urlVal
      result <- primIO $ prim__fetchImage url
      respond result

    "prefetchServer" => do
      result <- primIO $ prim__prefetchServer msg
      respond result

    "getStats" => do
      result <- primIO prim__getStats
      respond result

    -- Server
    "getServerConfig" => do
      result <- primIO prim__getServerConfig
      respond result

    "verifyServer" => do
      result <- primIO prim__verifyServer
      respond result

    "serverBatchLookup" => do
      result <- primIO $ prim__serverBatchLookup msg
      respond result

    "serverSubmitClassification" => do
      result <- primIO $ prim__serverSubmitClassification msg
      respond result

    "serverSubmitDescriptor" => do
      result <- primIO $ prim__serverSubmitDescriptor msg
      respond result

    -- Debug
    "getDebugStatus" => do
      result <- primIO prim__getDebugStatus
      respond result

    "enableDebugTiming" => do
      enabledVal <- msgGet msg "enabled"
      let enabled = True
      result <- primIO $ prim__enableDebugTiming enabled
      respond result

    "getDebugEvents" => do
      result <- primIO prim__getDebugEvents
      respond result

    "contextMenuImage" => do
      urlVal <- msgGet msg "url"
      url <- primIO $ prim__toStr urlVal
      result <- primIO $ prim__contextMenuImage url
      respond result

    -- Unknown message type
    _ => do
      seWarn ("Unknown message type: " ++ msgT)
      result <- primIO prim__emptyResult
      respond result

---------------------------------------------------------------------------
-- Context menus
---------------------------------------------------------------------------

export
createContextMenus : HasIO io => io ()
createContextMenus = do
  menuCreate "shmirat-block" "Block \x{2014} contains women" ["image", "link", "page"]
  menuCreate "shmirat-safe"  "Safe \x{2014} no women here"   ["image", "link", "page"]

---------------------------------------------------------------------------
-- Initialization (async, signals readiness subjects)
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w) => { (async function() { try { var bg = window.__seBg; var statePromise = browser.storage.local.get(['blockingEnabled','whitelist','anthropicApiKey','cloudMode','cloudCache','cloudCallsToday','cloudCallsDate','cloudSavedCount','serverEnabled','serverToken','serverDeviceId','knownFaces','knownSafeFaces','manualBlocklist','manualSafelist','trainingData','classifierWeights']).then(function(d) { var s = window.__seState; if (d.blockingEnabled !== undefined) s.blockingEnabled = d.blockingEnabled; if (d.whitelist) s.whitelist = d.whitelist; if (d.anthropicApiKey !== undefined) s.anthropicApiKey = d.anthropicApiKey; if (d.cloudMode) s.cloudMode = d.cloudMode; if (d.cloudCache) s.cloudCache = d.cloudCache; if (d.cloudCallsToday !== undefined) s.cloudCallsToday = d.cloudCallsToday; if (d.cloudCallsDate !== undefined) s.cloudCallsDate = d.cloudCallsDate; if (d.cloudSavedCount !== undefined) s.cloudSavedCount = d.cloudSavedCount; if (d.serverEnabled !== undefined) s.serverEnabled = d.serverEnabled; if (d.serverToken) s.serverToken = d.serverToken; if (d.serverDeviceId) s.serverDeviceId = d.serverDeviceId; if (d.knownFaces) s.knownFaces = d.knownFaces; if (d.knownSafeFaces) s.knownSafeFaces = d.knownSafeFaces; if (d.manualBlocklist) s.manualBlocklist = d.manualBlocklist; if (d.manualSafelist) s.manualSafelist = d.manualSafelist; if (d.trainingData) s.trainingData = d.trainingData; if (d.classifierWeights) s.classifierWeights = d.classifierWeights; var today = new Date().toISOString().slice(0, 10); if (s.cloudCallsDate !== today) { s.cloudCallsToday = 0; s.cloudSavedCount = 0; s.cloudCallsDate = today; } console.log('[SE] State loaded'); }); await statePromise; if (bg && bg.resolveStateReady) bg.resolveStateReady(true); if (bg) bg.updateBadge(window.__seState.blockingEnabled); var s = window.__seState; if (!s.serverToken) { bg.serverAutoRegister().then(function() { if (bg && bg.resolveServerReady) bg.resolveServerReady(true); }).catch(function(err) { console.warn('[SE] Auto-register failed:', err.message); if (bg && bg.resolveServerReady) bg.resolveServerReady(false); }); } else { s.serverEnabled = true; if (bg && bg.resolveServerReady) bg.resolveServerReady(true); } console.log('[SE] Background initialization complete'); } catch(err) { console.error('[SE] Init error:', err); } })(); }"
prim__asyncInit : PrimIO ()

---------------------------------------------------------------------------
-- Main entry point
---------------------------------------------------------------------------

export
main : IO ()
main = do
  seLog "Background script initializing..."

  -- Initialize pipeline (sets up window.__seBg with all functions)
  primIO prim__initBgCore
  primIO prim__initBgServer
  primIO prim__initBgPipeline

  -- Initialize state
  primIO prim__initState

  -- Load ML models (async — doesn't block, resolves modelsReadyPromise when done)
  loadModels

  -- Set up message listener (Idris dispatch)
  onMessage (\msg, sender, respond => handleMessage msg sender respond)

  -- Create context menus
  createContextMenus

  -- Set up context menu click handler
  primIO prim__setupContextMenuClick

  -- Run async initialization: load state, signal readiness, auto-register
  primIO prim__asyncInit

  seLog "Background script initialized"
  where
    %foreign "javascript:lambda:(w) => { window.__seBg.setupContextMenuClickHandler(); }"
    prim__setupContextMenuClick : PrimIO ()
