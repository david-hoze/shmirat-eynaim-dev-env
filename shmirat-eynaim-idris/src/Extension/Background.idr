-- Extension.Background — Background page entry point
--
-- Compile with: idris2 --cg javascript -o background-idris.js src/Extension/Background.idr
--
-- Message handlers dispatch to per-handler FFI functions.
-- The pure logic is in Extension.State (tested by Test.Main).
-- This module is the thin IO layer that wires state ↔ browser.storage.

module Extension.Background

import FFI.Core
import FFI.Browser.Runtime
import FFI.Browser.Storage
import FFI.Browser.Tabs
import FFI.Browser.Menus
import FFI.Browser.Action
import FFI.RxJS.Observable
import FFI.RxJS.Subject
import FFI.RxJS.Operators
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

%foreign "javascript:lambda:(w) => { browser.storage.local.get(['blockingEnabled','whitelist','anthropicApiKey','cloudMode','cloudCache','cloudCallsToday','cloudCallsDate','cloudSavedCount','serverEnabled','serverToken','serverDeviceId','knownFaces','knownSafeFaces','manualBlocklist','manualSafelist','trainingData','classifierWeights']).then(function(d) { var s = window.__seState; if (d.blockingEnabled !== undefined) s.blockingEnabled = d.blockingEnabled; if (d.whitelist) s.whitelist = d.whitelist; if (d.anthropicApiKey !== undefined) s.anthropicApiKey = d.anthropicApiKey; if (d.cloudMode) s.cloudMode = d.cloudMode; if (d.cloudCache) s.cloudCache = d.cloudCache; if (d.cloudCallsToday !== undefined) s.cloudCallsToday = d.cloudCallsToday; if (d.cloudCallsDate !== undefined) s.cloudCallsDate = d.cloudCallsDate; if (d.cloudSavedCount !== undefined) s.cloudSavedCount = d.cloudSavedCount; if (d.serverEnabled !== undefined) s.serverEnabled = d.serverEnabled; if (d.serverToken) s.serverToken = d.serverToken; if (d.serverDeviceId) s.serverDeviceId = d.serverDeviceId; if (d.knownFaces) s.knownFaces = d.knownFaces; if (d.knownSafeFaces) s.knownSafeFaces = d.knownSafeFaces; if (d.manualBlocklist) s.manualBlocklist = d.manualBlocklist; if (d.manualSafelist) s.manualSafelist = d.manualSafelist; if (d.trainingData) s.trainingData = d.trainingData; if (d.classifierWeights) s.classifierWeights = d.classifierWeights; console.log('[SE] State loaded from storage'); }).catch(function(e) { console.error('[SE] loadState error:', e); }); }"
prim__loadState : PrimIO ()

---------------------------------------------------------------------------
-- Model loading
---------------------------------------------------------------------------

%foreign "javascript:lambda:(modelPath, wasmPath, w) => { (async function() { try { await faceapi.tf.setBackend('webgl'); await faceapi.tf.ready(); console.log('[SE] TF backend: webgl'); } catch(e) { try { faceapi.tf.setWasmPaths(wasmPath); await faceapi.tf.setBackend('wasm'); await faceapi.tf.ready(); console.log('[SE] TF backend: wasm'); } catch(e2) { await faceapi.tf.setBackend('cpu'); await faceapi.tf.ready(); console.log('[SE] TF backend: cpu'); } } window.__seState.mlBackend = faceapi.tf.getBackend(); console.log('[SE] TF backend:', faceapi.tf.getBackend()); await faceapi.nets.tinyFaceDetector.loadFromUri(modelPath); await faceapi.nets.ageGenderNet.loadFromUri(modelPath); await faceapi.nets.faceLandmark68TinyNet.loadFromUri(modelPath); await faceapi.nets.faceRecognitionNet.loadFromUri(modelPath); console.log('[SE] Face models loaded'); var cocoModelUrl = modelPath + 'coco-ssd/model.json'; window.__seState.personDetector = await cocoSsd.load({ base: 'lite_mobilenet_v2', modelUrl: cocoModelUrl }); console.log('[SE] COCO-SSD loaded'); window.__seState.modelsLoaded = true; console.log('[SE] All models loaded'); })(); }"
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

%foreign "javascript:lambda:(w) => { var s = window.__seState; s.blockingEnabled = !s.blockingEnabled; return { blockingEnabled: s.blockingEnabled, whitelist: s.whitelist }; }"
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

%foreign "javascript:lambda:(tabUrl, w) => { var s = window.__seState; var dominated = false; try { var h = new URL(tabUrl).hostname; dominated = s.whitelist.includes(h); } catch(e) {} return { blockingEnabled: s.blockingEnabled, whitelisted: dominated, manualBlocklist: s.manualBlocklist, manualSafelist: s.manualSafelist, serverEnabled: s.serverEnabled }; }"
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
-- Handler: checkCache
---------------------------------------------------------------------------

%foreign "javascript:lambda:(url, w) => { var s = window.__seState; if (s.manualBlocklist.includes(url)) return { hit: true, containsWomen: true, reason: 'user-block' }; if (s.manualSafelist.includes(url)) return { hit: true, containsWomen: false, reason: 'user-safe' }; if (s.cloudCache[url]) return { hit: true, containsWomen: s.cloudCache[url].containsWomen, reason: 'cloud-cache' }; return { hit: false }; }"
prim__checkCache : String -> PrimIO JsValue

---------------------------------------------------------------------------
-- Handler: fetchImage
---------------------------------------------------------------------------

%foreign "javascript:lambda:(url, w) => { return fetch(url).then(function(r) { return r.blob(); }).then(function(b) { return new Promise(function(resolve) { var reader = new FileReader(); reader.onload = function() { resolve(reader.result); }; reader.readAsDataURL(b); }); }).catch(function(e) { console.warn('[SE] fetchImage error:', e); return null; }); }"
prim__fetchImage : String -> PrimIO JsValue

---------------------------------------------------------------------------
-- Handler: classifyCloud (full Haiku API pipeline)
---------------------------------------------------------------------------

%foreign "javascript:lambda:(msg, w) => { var s = window.__seState; var imageUrl = msg.imageUrl; var imageDataUrl = msg.imageDataUrl; var localResult = msg.localResult; var descriptors = msg.descriptors || []; if (!s.anthropicApiKey) return Promise.resolve(null); if (s.cloudMode === 'never') return Promise.resolve(null); if (s.cloudCache[imageUrl]) { s.cloudSavedCount++; return Promise.resolve({ containsWomen: s.cloudCache[imageUrl].containsWomen, source: 'cloud-cache' }); } if (s.cloudMode === 'uncertain' && localResult) { if (localResult.source === 'user') return Promise.resolve(null); if (localResult.knnDistance !== undefined && localResult.knnDistance < 0.4) return Promise.resolve(null); if (localResult.classifierConfidence !== undefined && localResult.classifierConfidence > 0.9) return Promise.resolve(null); } return (function() { var match = (imageDataUrl || '').match(/^data:(image\\/\\w+);base64,(.+)$/); if (!match) return Promise.resolve(null); var mediaType = match[1]; var base64Data = match[2]; return fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': s.anthropicApiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 50, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } }, { type: 'text', text: 'Does this image contain a woman or girl? Answer with exactly one word: YES or NO.' }] }] }) }).then(function(resp) { if (!resp.ok) { console.warn('[SE] Haiku API error:', resp.status); return null; } return resp.json(); }).then(function(data) { if (!data) return null; var answer = (data.content && data.content[0] && data.content[0].text || '').trim().toUpperCase(); var containsWomen = answer === 'YES' || answer.indexOf('YES') === 0; var today = new Date().toISOString().slice(0, 10); if (s.cloudCallsDate !== today) { s.cloudCallsDate = today; s.cloudCallsToday = 0; } s.cloudCallsToday++; s.cloudCache[imageUrl] = { containsWomen: containsWomen, timestamp: Date.now() }; if (descriptors.length > 0) { var now = Date.now(); for (var i = 0; i < descriptors.length; i++) { if (containsWomen) { s.knownFaces.push({ descriptor: descriptors[i], url: imageUrl, timestamp: now }); if (s.knownFaces.length > 1000) s.knownFaces.shift(); } else { s.knownSafeFaces.push({ descriptor: descriptors[i], url: imageUrl, timestamp: now }); if (s.knownSafeFaces.length > 1000) s.knownSafeFaces.shift(); } s.trainingData.push({ descriptor: descriptors[i], label: containsWomen ? 1 : 0 }); if (s.trainingData.length > 500) s.trainingData.shift(); } } return { containsWomen: containsWomen, source: 'haiku', raw: answer }; }).catch(function(e) { console.warn('[SE] Haiku error:', e); return null; }); })(); }"
prim__classifyCloud : RuntimeMessage -> PrimIO JsValue

---------------------------------------------------------------------------
-- Handler: getStats
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w) => { var s = window.__seState; return browser.tabs.query({active: true, currentWindow: true}).then(function(tabs) { var tab = tabs[0]; if (!tab) return { scanned: 0, hidden: 0, backend: s.mlBackend, modelsLoaded: s.modelsLoaded, personDetectorLoaded: s.personDetector !== null }; return browser.tabs.sendMessage(tab.id, {type: 'getStats'}).then(function(cs) { return Object.assign(cs || {}, { backend: s.mlBackend, modelsLoaded: s.modelsLoaded, personDetectorLoaded: s.personDetector !== null }); }).catch(function() { return { scanned: 0, hidden: 0, backend: s.mlBackend, modelsLoaded: s.modelsLoaded, personDetectorLoaded: s.personDetector !== null }; }); }); }"
prim__getStats : PrimIO JsValue

---------------------------------------------------------------------------
-- Handler: getServerConfig
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w) => { var s = window.__seState; return { serverUrl: 'https://shmirat-eynaim.example.com', hasToken: !!s.serverToken, serverEnabled: s.serverEnabled }; }"
prim__getServerConfig : PrimIO JsValue

---------------------------------------------------------------------------
-- Handler: getDebugStatus
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w) => { var s = window.__seState; return { blockingEnabled: s.blockingEnabled, whitelistCount: s.whitelist.length, knownFacesCount: s.knownFaces.length, knownSafeFacesCount: s.knownSafeFaces.length, trainingDataCount: s.trainingData.length, classifierTrained: s.classifierWeights !== null }; }"
prim__getDebugStatus : PrimIO JsValue

---------------------------------------------------------------------------
-- Handler: enableDebugTiming / getDebugEvents
---------------------------------------------------------------------------

%foreign "javascript:lambda:(enabled, w) => { window.__seState.debugTiming = enabled; window.__seState.debugEvents = []; console.log('[SE] Debug timing:', enabled ? 'ON' : 'OFF'); return { ok: true }; }"
prim__enableDebugTiming : Bool -> PrimIO JsValue

%foreign "javascript:lambda:(w) => window.__seState.debugEvents || []"
prim__getDebugEvents : PrimIO JsValue

---------------------------------------------------------------------------
-- Handler: contextMenuImage
---------------------------------------------------------------------------

%foreign "javascript:lambda:(url, w) => { window.__seState.lastContextMenuImageUrl = url || null; return { ok: true }; }"
prim__contextMenuImage : String -> PrimIO JsValue

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

    -- Cache & pipeline
    "checkCache" => do
      urlVal <- msgGet msg "url"
      url <- primIO $ prim__toStr urlVal
      result <- primIO $ prim__checkCache url
      respond result

    "fetchImage" => do
      urlVal <- msgGet msg "url"
      url <- primIO $ prim__toStr urlVal
      result <- primIO $ prim__fetchImage url
      respond result

    "getStats" => do
      result <- primIO prim__getStats
      respond result

    -- Server
    "getServerConfig" => do
      result <- primIO prim__getServerConfig
      respond result

    -- Debug
    "getDebugStatus" => do
      result <- primIO prim__getDebugStatus
      respond result

    "enableDebugTiming" => do
      enabledVal <- msgGet msg "enabled"
      let enabled = True  -- default to true; FFI handles the actual value
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
  menuCreate "se-block-image" "Shmirat Eynaim: Block this image" ["image"]
  menuCreate "se-safe-image"  "Shmirat Eynaim: Mark as safe"     ["image"]

---------------------------------------------------------------------------
-- Badge
---------------------------------------------------------------------------

export
updateBadge : HasIO io => Nat -> io ()
updateBadge 0 = setBadgeText ""
updateBadge n = do
  setBadgeText (show n)
  setBadgeColor "#e74c3c"

---------------------------------------------------------------------------
-- Main entry point
---------------------------------------------------------------------------

export
main : IO ()
main = do
  seLog "Background script initializing..."

  -- Initialize state
  primIO prim__initState

  -- Load persisted state from browser.storage
  primIO prim__loadState

  -- Load ML models (async — doesn't block)
  loadModels

  -- Set up message listener
  onMessage (\msg, sender, respond => handleMessage msg sender respond)

  -- Create context menus
  createContextMenus

  seLog "Background script initialized"
