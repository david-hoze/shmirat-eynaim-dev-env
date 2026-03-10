// background.js — State management, ML inference (off main thread), learning,
// cloud classification (Haiku), shared server communication, and popup messaging

let blockingEnabled = true;
let whitelist = [];

// --- Learning data (in-memory caches, persisted to storage) ---

let knownFaces = [];       // {descriptor: number[], url: string, timestamp: number}
let knownSafeFaces = [];   // {descriptor: number[], url: string, timestamp: number}
let manualBlocklist = [];   // URL strings
let manualSafelist = [];    // URL strings
let trainingData = [];      // {descriptor: number[], label: number}
let classifierWeights = null; // {weights: number[128], bias: number} or null

const MAX_KNOWN_FACES = 1000;
const MAX_TRAINING_DATA = 500;
const MAX_CLOUD_CACHE = 5000;

// --- Cloud API state ---

let anthropicApiKey = "";
let cloudMode = "all"; // "all" | "uncertain" | "never"
let cloudCache = {};   // { [url]: { containsWomen: boolean, timestamp: number } }
let cloudCallsToday = 0;
let cloudCallsDate = "";  // "YYYY-MM-DD"
let cloudSavedCount = 0;  // images handled locally that would have gone to cloud

// --- Shared server state ---

const SERVER_URL = "http://localhost:8080";
let serverToken = "";   // 64-char hex API token, auto-generated
let serverEnabled = false;
let serverDeviceId = ""; // unique per-install identifier used as "email" for registration

// --- State management ---

async function loadState() {
  const data = await browser.storage.local.get([
    "blockingEnabled", "whitelist", "anthropicApiKey", "cloudMode",
    "cloudCache", "cloudCallsToday", "cloudCallsDate", "cloudSavedCount",
    "serverToken", "serverEnabled", "serverDeviceId",
  ]);
  if (data.blockingEnabled !== undefined) blockingEnabled = data.blockingEnabled;
  if (data.whitelist) whitelist = data.whitelist;
  if (data.anthropicApiKey) anthropicApiKey = data.anthropicApiKey;
  if (data.cloudMode) cloudMode = data.cloudMode;
  if (data.cloudCache) cloudCache = data.cloudCache;
  if (data.cloudCallsToday !== undefined) cloudCallsToday = data.cloudCallsToday;
  if (data.cloudCallsDate) cloudCallsDate = data.cloudCallsDate;
  if (data.cloudSavedCount !== undefined) cloudSavedCount = data.cloudSavedCount;
  if (data.serverToken) serverToken = data.serverToken;
  if (data.serverEnabled !== undefined) serverEnabled = data.serverEnabled;
  if (data.serverDeviceId) serverDeviceId = data.serverDeviceId;

  // Reset daily counter if date changed
  const today = new Date().toISOString().slice(0, 10);
  if (cloudCallsDate !== today) {
    cloudCallsToday = 0;
    cloudSavedCount = 0;
    cloudCallsDate = today;
  }
}

async function saveState() {
  await browser.storage.local.set({
    blockingEnabled, whitelist, anthropicApiKey, cloudMode,
    cloudCache, cloudCallsToday, cloudCallsDate, cloudSavedCount,
    serverToken, serverEnabled, serverDeviceId,
  });
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

// --- ML Detection (runs on background thread, off main page thread) ---

let modelsLoaded = false;
let modelsLoading = false;
let mlBackend = "none";
let personDetector = null;

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
    // Background page can try WebGL (content scripts can't due to SecurityError).
    // Fall back to WASM, then CPU.
    const backends = ['webgl', 'wasm', 'cpu'];
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
    await loadNetFromUri(faceapi.nets.faceLandmark68TinyNet, "face_landmark_68_tiny_model", basePath);
    await loadNetFromUri(faceapi.nets.faceRecognitionNet, "face_recognition_model", basePath);

    try {
      const cocoModelUrl = browser.runtime.getURL("models/coco-ssd/model.json");
      personDetector = await cocoSsd.load({
        base: "lite_mobilenet_v2",
        modelUrl: cocoModelUrl,
      });
      console.log("[SE] COCO-SSD person detector loaded");
    } catch (cocoErr) {
      console.warn("[SE] COCO-SSD failed to load:", cocoErr.message);
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

// Start loading models immediately — emits true/false once, then completes
const modelsReady$ = new rxjs.ReplaySubject(1);
loadModels().then(ok => { modelsReady$.next(ok); modelsReady$.complete(); });

function dataUrlToImageData(dataUrl) {
  return new Promise(async (resolve, reject) => {
    try {
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      let { width, height } = bitmap;
      const maxDim = 416;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      resolve(ctx.getImageData(0, 0, width, height));
    } catch (err) {
      reject(err);
    }
  });
}

function imageDataToTensor(imageData) {
  const { data, width, height } = imageData;
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }
  return faceapi.tf.tensor3d(rgb, [height, width, 3], "int32");
}

// Learning helpers (KNN + classifier)
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

function classifyDescriptor(descriptor) {
  if (!classifierWeights) return 0;
  let z = classifierWeights.bias;
  for (let i = 0; i < descriptor.length; i++) {
    z += classifierWeights.weights[i] * descriptor[i];
  }
  return 1 / (1 + Math.exp(-z));
}

async function runPersonDetection(tensorInput) {
  if (!personDetector) return [];
  try {
    const predictions = await personDetector.detect(tensorInput, 20, 0.3);
    return predictions.filter(p =>
      p.class === "person" && p.score > 0.5 && p.bbox[2] > 60 && p.bbox[3] > 60
    );
  } catch (err) {
    console.warn("[SE] Person detection error:", err.message);
    return [];
  }
}

// --- RxJS classification pipeline ---
// All sources run in parallel. Each emits a result with a priority.
// Higher-priority sources override lower ones. Haiku always wins over ML.
//
// Priority (highest wins):
//   0 = local cache (instant, but trust depends on original source)
//   1 = ML (local face-api + COCO-SSD)
//   2 = server (community consensus, 2+ votes)
//   3 = haiku (Claude API — most trusted)
//   4 = user manual (explicit block/safe — absolute override)

const { Subject, ReplaySubject, merge, from, of, EMPTY, race, timer, forkJoin, defer } = rxjs;
const { filter, map, tap, catchError, mergeMap, bufferWhen, share, debounceTime, take, switchMap, defaultIfEmpty } = rxjs.operators;

const PRIORITY = { CACHE: 0, ML: 1, SERVER: 2, HAIKU: 3, USER: 4 };
const PRIORITY_NAMES = ["cache", "ML", "server", "haiku", "user"];

// State readiness — emits once loadState + loadLearningData complete.
// All message handlers that depend on cloudCache/learning data gate on this.
const stateReady$ = new ReplaySubject(1);

// Debug timing — set to true for pipeline analysis
let debugTiming = false;
const pipelineT0 = performance.now();
const debugEvents = []; // { time, msg } — retrievable via getDebugEvents message
function debugLog(...args) {
  if (!debugTiming) return;
  const entry = `[SE:${Math.round(performance.now() - pipelineT0)}ms] ${args.join(" ")}`;
  console.log(entry);
  debugEvents.push({ time: Math.round(performance.now() - pipelineT0), msg: args.join(" ") });
}

// In-flight deduplication: url → { subject, subscription }
const inFlightClassifications = new Map();

// --- Server readiness (emits once when auto-registration completes) ---
const serverReady$ = new ReplaySubject(1);

const SERVER_VOTE_THRESHOLD = 2; // min votes to trust server result

// --- Batched server lookups via RxJS ---
// Individual pipelines push {url, resolve} into serverLookup$.
// buffer closes on: 100ms debounce OR 500ms max wait (whichever first).
const serverLookup$ = new Subject();
const serverLookupShared$ = serverLookup$.pipe(share());

serverLookupShared$.pipe(
  bufferWhen(() =>
    // Close the buffer when items stop arriving (100ms quiet) OR after 500ms max
    race(
      serverLookupShared$.pipe(debounceTime(100), take(1)),
      timer(500),
    )
  ),
  filter(batch => batch.length > 0),
  // Wait for server registration, then hash + lookup
  mergeMap(batch => {
    const t0 = performance.now();
    debugLog("Server batch flush:", batch.length, "URLs");
    // Race server readiness against a 2s timeout
    return race(
      serverReady$.pipe(take(1)),
      timer(2000).pipe(map(() => false)),
    ).pipe(
      switchMap(ready => {
        if (!ready || !serverEnabled || !serverToken) {
          batch.forEach(({ result$ }) => { result$.next(null); result$.complete(); });
          return EMPTY;
        }
        // Hash all URLs in parallel
        return forkJoin(batch.map(({ url }) =>
          from(hashUrl(url)).pipe(map(hash => ({ url, hash })))
        )).pipe(
          // Batch lookup on server
          switchMap(urlHashes => from(serverBatchLookup(urlHashes))),
          // Fan results back to each waiting pipeline
          tap(results => {
            const hits = Object.keys(results).length;
            debugLog("Server batch done:", Math.round(performance.now() - t0), "ms,",
              hits, "hits /", batch.length, "requested");
            for (const { url, result$ } of batch) {
              const sv = results[url];
              if (sv) {
                const totalVotes = (sv.voteBlock || 0) + (sv.voteSafe || 0);
                if (totalVotes >= SERVER_VOTE_THRESHOLD) {
                  result$.next({ containsWomen: sv.containsWomen, reason: "server", priority: PRIORITY.SERVER });
                  result$.complete();
                  continue;
                }
              }
              result$.next(null);
              result$.complete();
            }
          }),
          catchError(err => {
            debugLog("Server batch error:", err.message);
            batch.forEach(({ result$ }) => { result$.next(null); result$.complete(); });
            return EMPTY;
          }),
        );
      }),
    );
  }),
).subscribe();

// Enqueue a server lookup — returns an Observable that emits the result when the batch completes
function enqueueServerLookup$(url) {
  const result$ = new ReplaySubject(1);
  serverLookup$.next({ url, result$ });
  return result$.pipe(take(1));
}

// Notify all tabs of a classification update
function notifyTabs(url, containsWomen, reason) {
  browser.tabs.query({}).then(tabs => {
    for (const tab of tabs) {
      browser.tabs.sendMessage(tab.id, {
        type: "classificationOverride",
        url, containsWomen, reason,
      }).catch(() => {});
    }
  });
}

// Create the observable pipeline for a single image URL.
// Returns an Observable that emits { containsWomen, reason, priority } as
// each source resolves, using scan to track the highest-priority result.
function createClassificationPipeline(url, imageDataUrl) {
  const sources = [];
  const shortUrl = url.substring(0, 60);
  const pipeStart = performance.now();

  // Source 1: Local cache (sync)
  if (cloudCache[url]) {
    debugLog("Pipeline CACHE HIT:", shortUrl);
    sources.push(of({
      containsWomen: cloudCache[url].containsWomen,
      reason: "cloud-cache",
      priority: PRIORITY.CACHE,
    }));
  }

  // Source 2: Server check (batched — multiple images share one HTTP call)
  if (serverEnabled && serverToken) {
    sources.push(
      enqueueServerLookup$(url).pipe(filter(r => r !== null), catchError(() => EMPTY))
    );
  }

  // Source 3: Local ML (async, CPU/WASM/WebGL)
  // Waits for models to load, then runs detection.
  // Shared via a ReplaySubject so Haiku (in "uncertain" mode) can wait for it.
  const mlSubject = new ReplaySubject(1);
  const ml$ = modelsReady$.pipe(
    take(1),
    switchMap(loaded => {
      if (!loaded) return of({ containsWomen: true, reason: "models-not-loaded" });
      // defer ensures the async detection runs only when subscribed
      return defer(() => runMLInference(url, imageDataUrl));
    }),
    map(r => ({ ...r, reason: r.reason || "local", priority: PRIORITY.ML })),
    tap(mlResult => {
      mlSubject.next(mlResult);
      mlSubject.complete();
      // Side effect: submit ML result to server (non-blocking)
      if (serverEnabled && serverToken) {
        from(hashUrl(url)).pipe(
          switchMap(hash => from(serverSubmitClassification(hash, mlResult.containsWomen, mlResult.reason, 0.8))),
          catchError(() => EMPTY),
        ).subscribe();
      }
    }),
    catchError(err => {
      console.error("[SE] ML detection error:", err.message);
      const fallback = { containsWomen: true, reason: "ml-error", priority: PRIORITY.ML };
      mlSubject.next(fallback);
      mlSubject.complete();
      return of(fallback);
    }),
  );
  sources.push(ml$);

  // Source 4: Haiku (async API call — most trusted)
  const mapHaikuResult = map(r => ({
    containsWomen: r.containsWomen,
    reason: "haiku",
    priority: PRIORITY.HAIKU,
    raw: r.raw,
  }));
  if (anthropicApiKey && cloudMode !== "never") {
    if (cloudMode === "all") {
      // "all" mode: run Haiku in parallel with ML — don't wait
      sources.push(
        cloudClassify$(url, imageDataUrl, null).pipe(mapHaikuResult, catchError(() => EMPTY))
      );
    } else {
      // "uncertain" mode: wait for ML, only call Haiku if ML isn't confident
      const haiku$ = mlSubject.pipe(
        switchMap(mlResult => {
          if (mlResult.knnDistance !== undefined && mlResult.knnDistance < 0.3) {
            cloudSavedCount++;
            return EMPTY;
          }
          if (mlResult.classifierConfidence !== undefined && mlResult.classifierConfidence > 0.9) {
            cloudSavedCount++;
            return EMPTY;
          }
          return cloudClassify$(url, imageDataUrl, {
            source: mlResult.reason,
            knnDistance: mlResult.knnDistance,
            classifierConfidence: mlResult.classifierConfidence,
          }).pipe(mapHaikuResult, catchError(() => EMPTY));
        }),
      );
      sources.push(haiku$);
    }
  }

  // Merge all sources — emit each result as it arrives.
  // Priority resolution happens in the subscriber.
  return merge(...sources);
}

// The main entry point for classification. Returns a Promise that resolves
// with the first result, but the pipeline continues running — later results
// (server, Haiku) notify tabs via classificationOverride messages.
function classifyImage(url, imageDataUrl) {
  const shortUrl = url.substring(0, 60);

  // User manual flags have absolute priority — skip the entire pipeline
  if (manualBlocklist.includes(url)) {
    debugLog("classifyImage USER BLOCK:", shortUrl);
    return Promise.resolve({ containsWomen: true, reason: "user-block" });
  }
  if (manualSafelist.includes(url)) {
    debugLog("classifyImage USER SAFE:", shortUrl);
    return Promise.resolve({ containsWomen: false, reason: "user-safe" });
  }

  // Instant cache hit — no pipeline needed
  if (cloudCache[url]) {
    debugLog("classifyImage CACHE HIT:", shortUrl);
    return Promise.resolve({
      containsWomen: cloudCache[url].containsWomen,
      reason: "cloud-cache",
    });
  }

  // Deduplication: if this URL is already being classified, wait for its first result
  if (inFlightClassifications.has(url)) {
    debugLog("classifyImage DEDUP:", shortUrl);
    return rxjs.firstValueFrom(inFlightClassifications.get(url).subject);
  }

  debugLog("classifyImage START:", shortUrl);
  const classifyStart = performance.now();

  // Create a ReplaySubject so late subscribers (dedup) get the latest result
  const resultSubject = new ReplaySubject(1);
  let bestResult = null;   // highest-priority result seen so far
  let mlDescriptors = null; // saved from ML result for learning

  const pipeline$ = createClassificationPipeline(url, imageDataUrl);

  const subscription = pipeline$.subscribe({
    next(result) {
      const elapsed = Math.round(performance.now() - classifyStart);
      debugLog(`  ${PRIORITY_NAMES[result.priority]}:`, result.containsWomen ? "BLOCK" : "SAFE",
        `(${elapsed}ms)`, shortUrl);

      // Save ML descriptors for later learning
      if (result.priority === PRIORITY.ML && result.descriptors) {
        mlDescriptors = result.descriptors;
      }

      // STRICT MODE priority resolution:
      //   - BLOCK wins: if ANY source says block, stay blocked.
      //     Only a USER-level (priority 4) SAFE can override a block.
      //   - SAFE only sticks if no source has said block yet.
      // This ensures false negatives are minimized (strict mode principle).
      if (bestResult && result.priority < bestResult.priority) {
        // Lower-priority result arriving late — only accept if it's a BLOCK
        // (blocks always escalate, but safe from lower priority is ignored)
        if (!result.containsWomen) {
          debugLog(`  IGNORED safe (${PRIORITY_NAMES[result.priority]} < ${PRIORITY_NAMES[bestResult.priority]})`, shortUrl);
          return;
        }
      }

      // A higher-priority source says SAFE, but a previous source said BLOCK:
      // Only USER-level can override a block to safe. All other safe results
      // are ignored once any source has said block (strict mode).
      if (bestResult && bestResult.containsWomen && !result.containsWomen
          && result.priority < PRIORITY.USER) {
        debugLog(`  STRICT: keeping block despite ${PRIORITY_NAMES[result.priority]} safe`, shortUrl);
        return;
      }

      const isFirst = !bestResult;
      const changed = bestResult && result.containsWomen !== bestResult.containsWomen;
      bestResult = result;

      // Cache every accepted result
      cloudCache[url] = { containsWomen: result.containsWomen, timestamp: Date.now() };
      resultSubject.next(result);

      if (isFirst) {
        debugLog("  FIRST RESULT:", PRIORITY_NAMES[result.priority], `(${elapsed}ms)`, shortUrl);
      } else if (changed) {
        // Source escalated from safe to block — notify tabs to update the DOM
        console.log("[SE] Override:", result.reason, "says", result.containsWomen ? "block" : "safe",
          "for", url.substring(0, 60));
        notifyTabs(url, result.containsWomen, result.reason);
      }

      // Haiku-specific side effects (whether it agrees or disagrees)
      if (result.priority === PRIORITY.HAIKU) {
        if (mlDescriptors && mlDescriptors.length > 0) {
          feedHaikuIntoLearning(url, { containsWomen: result.containsWomen }, mlDescriptors);
        }
        if (serverEnabled && serverToken) {
          from(hashUrl(url)).pipe(
            switchMap(hash => from(serverSubmitClassification(hash, result.containsWomen, "haiku", 0.95))),
            catchError(() => EMPTY),
          ).subscribe();
        }
      }
    },
    complete() {
      inFlightClassifications.delete(url);
      // If no source emitted, push a strict-mode fallback before completing
      if (!bestResult) resultSubject.next({ containsWomen: true, reason: "no-sources" });
      resultSubject.complete();
    },
    error(err) {
      console.error("[SE] Pipeline error:", err);
      inFlightClassifications.delete(url);
      if (!bestResult) resultSubject.next({ containsWomen: true, reason: "error" });
      resultSubject.complete();
    },
  });

  inFlightClassifications.set(url, { subject: resultSubject, subscription });

  // Return the first emitted result (defaultIfEmpty for safety)
  return rxjs.firstValueFrom(
    resultSubject.pipe(defaultIfEmpty({ containsWomen: true, reason: "no-sources" }))
  );
}

// Core ML inference — models are guaranteed loaded by the pipeline's modelsReady$ gate
async function runMLInference(url, imageDataUrl) {

  let imageData;
  try {
    imageData = await dataUrlToImageData(imageDataUrl);
  } catch (err) {
    console.warn("[SE] Failed to decode image:", url.substring(0, 60), err.message);
    return { containsWomen: true, reason: "decode-error" };
  }

  const hasLearning = knownFaces.length > 0 || knownSafeFaces.length > 0 || classifierWeights !== null;

  const faceTensor = imageDataToTensor(imageData);
  const personTensor = personDetector ? imageDataToTensor(imageData) : null;

  let faceDetectionPromise;
  if (hasLearning) {
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

  const DETECT_TIMEOUT = 60_000;
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("detection_timeout")), DETECT_TIMEOUT)
  );

  const t0 = performance.now();
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
    "persons:", persons ? persons.length : 0, "src:", url.substring(0, 80));

  let containsWomen = false;
  let reason = "";
  let descriptors = [];

  if (detections && detections.length > 0) {
    for (const det of detections) {
      let flagBlock = false;
      let flagSafe = false;

      // Strict mode: only SHOW if confidently male (>0.65).
      // Block if female, uncertain, or gender data missing.
      const isConfidentlyMale = det.gender === "male" && det.genderProbability >= 0.65;
      if (!isConfidentlyMale) {
        flagBlock = true;
      }

      if (hasLearning && det.descriptor) {
        const descriptor = Array.from(det.descriptor);
        descriptors.push(descriptor);
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
    containsWomen = true;
    reason = "person-no-face";
  }

  return {
    containsWomen,
    reason,
    faceCount: detections ? detections.length : 0,
    personCount: persons ? persons.length : 0,
    descriptors,
  };
}

async function extractDescriptorsFromDataUrl(imageDataUrl) {
  const loaded = await rxjs.firstValueFrom(modelsReady$);
  if (!loaded) return [];
  try {
    const imageData = await dataUrlToImageData(imageDataUrl);
    const tensor = imageDataToTensor(imageData);
    let detections;
    try {
      detections = await faceapi
        .detectAllFaces(tensor, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }))
        .withFaceLandmarks(true)
        .withFaceDescriptors();
    } finally {
      tensor.dispose();
    }
    return detections.map(d => Array.from(d.descriptor));
  } catch (err) {
    console.error("[SE] Descriptor extraction error:", err);
    return [];
  }
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

// --- Cloud API: Claude Haiku classification ---

const API_RATE_LIMIT = 10;
// RxJS-based semaphore: pending Haiku calls wait on Subjects released by completed calls
const apiSemaphore = { active: 0, queue: [] };

// In-flight tracking: prevents sending the same URL twice concurrently
const inFlightUrls = new Map(); // url → Observable (shared)

async function resizeImageDataUrl(dataUrl, maxDim) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  let { width, height } = bitmap;
  if (width <= maxDim && height <= maxDim) {
    bitmap.close();
    return dataUrl;
  }
  const scale = maxDim / Math.max(width, height);
  width = Math.round(width * scale);
  height = Math.round(height * scale);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const resizedBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(resizedBlob);
  });
}

async function classifyWithHaiku(imageDataUrl) {
  if (!anthropicApiKey) return null;

  const resizedDataUrl = await resizeImageDataUrl(imageDataUrl, 512);
  const match = resizedDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return null;
  const [, mediaType, base64Data] = match;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 50,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64Data },
            },
            {
              type: "text",
              text: "Does this image contain a woman or girl? Answer with exactly one word: YES or NO.",
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      console.warn("[Shmirat Eynaim] Haiku API error:", response.status);
      return null;
    }

    const data = await response.json();
    const answer = data.content?.[0]?.text?.trim().toUpperCase();

    // Track daily usage
    const today = new Date().toISOString().slice(0, 10);
    if (cloudCallsDate !== today) {
      cloudCallsToday = 0;
      cloudSavedCount = 0;
      cloudCallsDate = today;
    }
    cloudCallsToday++;
    saveState();

    return {
      containsWomen: answer === "YES" || (answer && answer.startsWith("YES")),
      source: "haiku",
      raw: answer,
    };
  } catch (err) {
    console.warn("[Shmirat Eynaim] Haiku API call failed:", err.message);
    return null;
  }
}

// Acquire a semaphore slot — returns an Observable that emits once a slot is free
function acquireApiSlot$() {
  if (apiSemaphore.active < API_RATE_LIMIT) {
    apiSemaphore.active++;
    return of(true);
  }
  const slot$ = new ReplaySubject(1);
  apiSemaphore.queue.push(slot$);
  return slot$.pipe(take(1));
}

function releaseApiSlot() {
  apiSemaphore.active--;
  if (apiSemaphore.queue.length > 0) {
    const next = apiSemaphore.queue.shift();
    apiSemaphore.active++;
    next.next(true);
    next.complete();
  }
}

// Rate-limited Haiku call — waits for semaphore slot, runs classification, releases slot
function rateLimitedHaikuCall$(imageDataUrl) {
  return acquireApiSlot$().pipe(
    switchMap(() => defer(() => classifyWithHaiku(imageDataUrl))),
    tap({ complete: releaseApiSlot, error: releaseApiSlot }),
  );
}

// Process a cloud classification request. Deduplicates by URL.
// Called from the RxJS pipeline — server check is handled separately there.
// Returns an Observable that emits one Haiku result (or EMPTY if skipped).
// Deduplicates in-flight requests via inFlightUrls.
function cloudClassify$(imageUrl, imageDataUrl, localResult) {
  // Check cloud cache — never send the same URL twice
  if (cloudCache[imageUrl]) {
    cloudSavedCount++;
    return of({ ...cloudCache[imageUrl], source: "cloud-cache" });
  }

  // Dedup: if this URL is already in-flight, share the existing observable
  if (inFlightUrls.has(imageUrl)) {
    return inFlightUrls.get(imageUrl);
  }

  // In "uncertain" mode, skip if local is confident
  if (cloudMode === "uncertain" && localResult) {
    if (localResult.source === "user") return EMPTY;
    if (localResult.knnDistance !== undefined && localResult.knnDistance < 0.3) {
      cloudSavedCount++;
      return EMPTY;
    }
    if (localResult.classifierConfidence !== undefined && localResult.classifierConfidence > 0.9) {
      cloudSavedCount++;
      return EMPTY;
    }
  }

  // Rate-limited Haiku call → cache result → emit
  const haiku$ = rateLimitedHaikuCall$(imageDataUrl).pipe(
    filter(r => r !== null),
    tap(haikuResult => {
      // Cache the result
      cloudCache[imageUrl] = {
        containsWomen: haikuResult.containsWomen,
        timestamp: Date.now(),
      };
      // Trim cache if too large
      const keys = Object.keys(cloudCache);
      if (keys.length > MAX_CLOUD_CACHE) {
        const sorted = keys.sort((a, b) => cloudCache[a].timestamp - cloudCache[b].timestamp);
        for (let i = 0; i < sorted.length - MAX_CLOUD_CACHE; i++) {
          delete cloudCache[sorted[i]];
        }
      }
      saveState();
      console.log("[Shmirat Eynaim] Haiku:", haikuResult.raw, "for", imageUrl.substring(0, 60));
    }),
    tap({ complete: () => inFlightUrls.delete(imageUrl), error: () => inFlightUrls.delete(imageUrl) }),
    share(), // share among dedup subscribers
  );

  inFlightUrls.set(imageUrl, haiku$);
  return haiku$;
}

// Feed Haiku result into the learning system
function feedHaikuIntoLearning(imageUrl, haikuResult, descriptors) {
  if (!haikuResult || !descriptors || descriptors.length === 0) return;

  const now = Date.now();
  const shouldBlock = haikuResult.containsWomen;

  for (const descriptor of descriptors) {
    if (shouldBlock) {
      knownFaces.push({ descriptor, url: imageUrl, timestamp: now, source: "haiku" });
      if (knownFaces.length > MAX_KNOWN_FACES) knownFaces.shift();
      trainingData.push({ descriptor, label: 1, source: "haiku" });
    } else {
      knownSafeFaces.push({ descriptor, url: imageUrl, timestamp: now, source: "haiku" });
      if (knownSafeFaces.length > MAX_KNOWN_FACES) knownSafeFaces.shift();
      trainingData.push({ descriptor, label: 0, source: "haiku" });
    }
    if (trainingData.length > MAX_TRAINING_DATA) trainingData.shift();
  }

  // Retrain periodically
  if (trainingData.length >= 10 && trainingData.length % 20 === 0) {
    trainClassifier();
  }
  saveLearningData();
}

// --- Shared server API ---

// Simple hash: SHA-256 of the URL, truncated to 16 hex chars.
// Used as a lightweight "perceptual hash" stand-in for server lookups.
async function hashUrl(url) {
  const encoder = new TextEncoder();
  const data = encoder.encode(url);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").substring(0, 16);
}

async function serverFetch(endpoint, options = {}) {
  if (!serverEnabled || !serverToken) return null;
  const url = SERVER_URL + endpoint;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${serverToken}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn("[Shmirat Eynaim] Server error:", res.status, endpoint);
      return null;
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timeout);
    console.warn("[Shmirat Eynaim] Server fetch failed:", err.message);
    return null;
  }
}

// Look up multiple hashes from the shared server
async function serverBatchLookup(urlHashes) {
  // urlHashes: [{url, hash}]
  if (urlHashes.length === 0) return {};
  const hashes = urlHashes.map(h => h.hash);
  const data = await serverFetch("/api/classifications/batch", {
    method: "POST",
    body: JSON.stringify({ hashes }),
  });
  if (!data || !data.results) return {};
  // Map hashes back to URLs
  const result = {};
  for (const { url, hash } of urlHashes) {
    if (data.results[hash]) {
      result[url] = data.results[hash];
    }
  }
  return result;
}

// Submit a classification to the shared server
async function serverSubmitClassification(hash, containsWomen, source, confidence) {
  return serverFetch("/api/classifications", {
    method: "POST",
    body: JSON.stringify({
      hash,
      containsWomen,
      source,
      confidence: confidence || 0.8,
    }),
  });
}

// Submit a face descriptor to the shared server
async function serverSubmitDescriptor(descriptor, label, confidence) {
  // descriptor is a number[128], encode as base64 float32 array
  const buffer = new Float32Array(descriptor).buffer;
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  return serverFetch("/api/descriptors", {
    method: "POST",
    body: JSON.stringify({ descriptor: base64, label, confidence }),
  });
}

// Auto-register with the shared server. Generates a device ID on first run,
// calls POST /api/register, and stores the returned token.
async function serverAutoRegister() {
  // Generate a stable device ID if we don't have one
  if (!serverDeviceId) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    serverDeviceId = "ext-" + Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    await saveState();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(SERVER_URL + "/api/register", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: serverDeviceId }),
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn("[Shmirat Eynaim] Server registration failed:", res.status);
      return false;
    }
    const data = await res.json();
    if (data.token) {
      serverToken = data.token;
      serverEnabled = true;
      await saveState();
      console.log("[Shmirat Eynaim] Auto-registered with server");
      return true;
    }
  } catch (err) {
    clearTimeout(timeout);
    console.warn("[Shmirat Eynaim] Server registration error:", err.message);
  }
  return false;
}

// Verify server connection by calling GET /api/stats (no auth required)
async function serverVerifyConnection() {
  const url = SERVER_URL + "/api/stats";
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, stats: data };
  } catch (err) {
    return { ok: false, error: err.message };
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

const menusAPI = browser.menus || browser.contextMenus;

function createContextMenus() {
  if (!menusAPI) {
    console.warn("[Shmirat Eynaim] No menus API available");
    return;
  }
  // Include "link" and "page" so the menu appears on elements that aren't
  // standard <img> (e.g. YouTube thumbnails wrapped in <a> tags).
  menusAPI.create({
    id: "shmirat-block",
    title: "Block — contains women",
    contexts: ["image", "link", "page"]
  });
  menusAPI.create({
    id: "shmirat-safe",
    title: "Safe — no women here",
    contexts: ["image", "link", "page"]
  });
}

// Track the image URL under the cursor, reported by content script on contextmenu.
// Used as fallback when info.srcUrl is unavailable (e.g. YouTube thumbnails).
let lastContextMenuImageUrl = null;

if (menusAPI) {
  menusAPI.onClicked.addListener(async (info, tab) => {
    // Use srcUrl for native images, fall back to content-script-detected URL
    const imageUrl = info.srcUrl || lastContextMenuImageUrl;
    lastContextMenuImageUrl = null;
    if (!imageUrl) return;
    const tabId = tab ? tab.id : null;

    if (info.menuItemId === "shmirat-block") {
      if (!manualBlocklist.includes(imageUrl)) {
        manualBlocklist.push(imageUrl);
      }
      manualSafelist = manualSafelist.filter(u => u !== imageUrl);
      // Update cloudCache so checkCache returns block on next page load
      cloudCache[imageUrl] = { containsWomen: true, timestamp: Date.now() };
      await saveLearningData();
      showTemporaryBadge("✓", "#2ecc71");
      // Tell content script to hide + extract descriptors
      if (tabId) {
        try {
          await browser.tabs.sendMessage(tabId, { type: "blockAndLearn", url: imageUrl });
        } catch { /* tab may not have content script */ }
      }
    } else if (info.menuItemId === "shmirat-safe") {
      if (!manualSafelist.includes(imageUrl)) {
        manualSafelist.push(imageUrl);
      }
      manualBlocklist = manualBlocklist.filter(u => u !== imageUrl);
      // Update cloudCache so checkCache returns safe on next page load
      cloudCache[imageUrl] = { containsWomen: false, timestamp: Date.now() };
      await saveLearningData();
      // Tell content script to show + extract descriptors
      if (tabId) {
        try {
          await browser.tabs.sendMessage(tabId, { type: "safeAndLearn", url: imageUrl });
        } catch { /* tab may not have content script */ }
      }
    }
  });
}

// --- Message handling ---

browser.runtime.onMessage.addListener((msg, sender) => {
  switch (msg.type) {
    case "contextMenuImage": {
      // Content script reports the image URL under the cursor before context menu opens
      lastContextMenuImageUrl = msg.url || null;
      return Promise.resolve({ ok: true });
    }

    case "enableDebugTiming": {
      debugTiming = msg.enabled !== false;
      debugEvents.length = 0; // clear previous events
      console.log("[SE] Debug timing:", debugTiming ? "ON" : "OFF");
      return Promise.resolve({ ok: true });
    }

    case "getDebugEvents": {
      return Promise.resolve(debugEvents);
    }

    case "getDebugStatus":
      return Promise.resolve({
        blockingEnabled,
        whitelistCount: whitelist.length,
        knownFacesCount: knownFaces.length,
        knownSafeFacesCount: knownSafeFaces.length,
        trainingDataCount: trainingData.length,
        classifierTrained: classifierWeights !== null,
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
      return Promise.resolve({
        blockingEnabled,
        whitelisted,
        manualBlocklist,
        manualSafelist,
        serverEnabled,
      });
    }

    case "fetchImage": {
      return fetchImageAsDataUrl(msg.url);
    }

    case "prefetchServer": {
      // Batch-query the server for all URLs at once, populating cloudCache.
      // Called by content.js discoverImages before individual classifyImage calls.
      const urls = msg.urls || [];
      if (urls.length === 0) {
        return Promise.resolve({ ok: true, cached: 0 });
      }
      // Wait for state + server readiness (race against 2s timeout for server)
      return rxjs.firstValueFrom(stateReady$.pipe(
        take(1),
        switchMap(() => race(
          serverReady$.pipe(take(1)),
          timer(2000).pipe(map(() => false)),
        )),
      ).pipe(
        switchMap(ready => {
          if (!ready || !serverEnabled || !serverToken) {
            return of({ ok: true, cached: 0 });
          }
          const t0 = performance.now();
          const uncached = urls.filter(u => !cloudCache[u]);
          if (uncached.length === 0) {
            debugLog("prefetchServer: all cached");
            return of({ ok: true, cached: 0 });
          }
          debugLog("prefetchServer:", urls.length, "URLs");
          // Hash all URLs, then batch lookup, then populate cache
          return forkJoin(
            uncached.map(url => from(hashUrl(url)).pipe(map(hash => ({ url, hash }))))
          ).pipe(
            switchMap(urlHashes => from(serverBatchLookup(urlHashes))),
            map(results => {
              let cached = 0;
              for (const url of uncached) {
                const sv = results[url];
                if (sv) {
                  const totalVotes = (sv.voteBlock || 0) + (sv.voteSafe || 0);
                  if (totalVotes >= SERVER_VOTE_THRESHOLD) {
                    cloudCache[url] = { containsWomen: sv.containsWomen, timestamp: Date.now() };
                    cached++;
                  }
                }
              }
              debugLog("prefetchServer done:", Math.round(performance.now() - t0), "ms,",
                cached, "cached /", uncached.length, "queried");
              return { ok: true, cached };
            }),
          );
        }),
        catchError(() => of({ ok: true, cached: 0 })),
      ));
    }

    case "checkCache": {
      // Fast cache check — waits for state to load, then checks cloudCache
      // User manual flags take absolute priority over any cache
      const url = msg.url;
      return rxjs.firstValueFrom(stateReady$.pipe(
        take(1),
        map(() => {
          if (manualBlocklist.includes(url)) {
            return { hit: true, containsWomen: true, reason: "user-block" };
          }
          if (manualSafelist.includes(url)) {
            return { hit: true, containsWomen: false, reason: "user-safe" };
          }
          if (cloudCache[url]) {
            return { hit: true, containsWomen: cloudCache[url].containsWomen, reason: "cloud-cache" };
          }
          return { hit: false };
        }),
      ));
    }

    case "classifyImage": {
      // Full RxJS pipeline: cache + server + ML + Haiku in parallel
      const { url: imgUrl, imageDataUrl: imgData } = msg;
      return classifyImage(imgUrl, imgData);
    }

    case "extractDescriptors": {
      return extractDescriptorsFromDataUrl(msg.imageDataUrl);
    }

    case "getStats": {
      return browser.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
        let contentStats = { scanned: 0, hidden: 0 };
        if (tab) {
          try {
            contentStats = await browser.tabs.sendMessage(tab.id, { type: "getStats" });
          } catch { /* tab may not have content script */ }
        }
        // Merge ML status from background
        return {
          ...contentStats,
          backend: mlBackend,
          modelsLoaded,
          personDetectorLoaded: personDetector !== null,
        };
      });
    }

    // Content script sends learned descriptors after user blocks an image
    case "learnBlock": {
      const { url, descriptors } = msg;
      if (!manualBlocklist.includes(url)) manualBlocklist.push(url);
      manualSafelist = manualSafelist.filter(u => u !== url);
      cloudCache[url] = { containsWomen: true, timestamp: Date.now() };
      const now = Date.now();
      for (const descriptor of descriptors) {
        knownFaces.push({ descriptor, url, timestamp: now });
        if (knownFaces.length > MAX_KNOWN_FACES) knownFaces.shift();
        trainingData.push({ descriptor, label: 1 });
        if (trainingData.length > MAX_TRAINING_DATA) trainingData.shift();
      }
      if (trainingData.length >= 10) trainClassifier();
      saveLearningData();
      return Promise.resolve({ success: true });
    }

    // Content script sends learned descriptors after user marks image safe
    case "learnSafe": {
      const { url: safeUrl, descriptors: safeDescriptors } = msg;
      if (!manualSafelist.includes(safeUrl)) manualSafelist.push(safeUrl);
      manualBlocklist = manualBlocklist.filter(u => u !== safeUrl);
      cloudCache[safeUrl] = { containsWomen: false, timestamp: Date.now() };
      const now = Date.now();
      for (const descriptor of safeDescriptors) {
        knownSafeFaces.push({ descriptor, url: safeUrl, timestamp: now });
        if (knownSafeFaces.length > MAX_KNOWN_FACES) knownSafeFaces.shift();
        trainingData.push({ descriptor, label: 0 });
        if (trainingData.length > MAX_TRAINING_DATA) trainingData.shift();
      }
      if (trainingData.length >= 10) trainClassifier();
      saveLearningData();
      return Promise.resolve({ success: true });
    }

    case "blockImage": {
      const url = msg.url;
      if (!manualBlocklist.includes(url)) manualBlocklist.push(url);
      manualSafelist = manualSafelist.filter(u => u !== url);
      cloudCache[url] = { containsWomen: true, timestamp: Date.now() };
      saveLearningData();
      const tabId = sender.tab ? sender.tab.id : null;
      if (tabId) {
        browser.tabs.sendMessage(tabId, { type: "blockAndLearn", url }).catch(() => {});
      }
      return Promise.resolve({ success: true });
    }

    case "safeImage": {
      const url = msg.url;
      if (!manualSafelist.includes(url)) manualSafelist.push(url);
      manualBlocklist = manualBlocklist.filter(u => u !== url);
      cloudCache[url] = { containsWomen: false, timestamp: Date.now() };
      saveLearningData();
      const tabId = sender.tab ? sender.tab.id : null;
      if (tabId) {
        browser.tabs.sendMessage(tabId, { type: "safeAndLearn", url }).catch(() => {});
      }
      return Promise.resolve({ success: true });
    }

    case "classifyCloud": {
      const { imageUrl, imageDataUrl, localResult, descriptors } = msg;
      return handleCloudClassify(imageUrl, imageDataUrl, localResult).then(result => {
        if (result && descriptors && descriptors.length > 0) {
          feedHaikuIntoLearning(imageUrl, result, descriptors);
        }
        return result;
      });
    }

    case "setApiKey": {
      anthropicApiKey = msg.key || "";
      saveState();
      return Promise.resolve({ success: true });
    }

    case "setCloudMode": {
      cloudMode = msg.mode || "all";
      saveState();
      return Promise.resolve({ success: true });
    }

    case "getCloudStats": {
      return Promise.resolve({
        cloudMode,
        hasApiKey: !!anthropicApiKey,
        cloudCallsToday,
        cloudSavedCount,
        cloudCacheSize: Object.keys(cloudCache).length,
      });
    }

    case "getServerConfig": {
      return Promise.resolve({
        serverUrl: SERVER_URL,
        hasToken: !!serverToken,
        serverEnabled,
      });
    }

    case "verifyServer": {
      return serverVerifyConnection();
    }

    case "serverBatchLookup": {
      // msg.urls: string[]
      const urls = msg.urls || [];
      return rxjs.firstValueFrom(
        forkJoin(urls.map(url => from(hashUrl(url)).pipe(map(hash => ({ url, hash }))))).pipe(
          switchMap(urlHashes => from(serverBatchLookup(urlHashes))),
          defaultIfEmpty({}),
        )
      );
    }

    case "serverSubmitClassification": {
      const { url: classUrl, containsWomen: cw, source: src, confidence: conf } = msg;
      return rxjs.firstValueFrom(
        from(hashUrl(classUrl)).pipe(
          switchMap(hash => from(serverSubmitClassification(hash, cw, src, conf))),
          map(() => ({ success: true })),
          defaultIfEmpty({ success: true }),
        )
      );
    }

    case "serverSubmitDescriptor": {
      const { descriptor: desc, label: lbl, confidence: dConf } = msg;
      return serverSubmitDescriptor(desc, lbl, dConf);
    }

    case "getLearningStats": {
      return Promise.resolve({
        knownFacesCount: knownFaces.length,
        knownSafeFacesCount: knownSafeFaces.length,
        trainingDataCount: trainingData.length,
        classifierTrained: classifierWeights !== null,
      });
    }

    case "clearCloudCache": {
      const count = Object.keys(cloudCache).length;
      cloudCache = {};
      saveState();
      console.log("[SE] Cloud cache cleared:", count, "entries");
      return Promise.resolve({ success: true, cleared: count });
    }

    case "resetLearning": {
      knownFaces = [];
      knownSafeFaces = [];
      manualBlocklist = [];
      manualSafelist = [];
      trainingData = [];
      classifierWeights = null;
      return saveLearningData().then(() => ({ success: true }));
    }

    case "exportLearning": {
      return Promise.resolve({
        knownFaces, knownSafeFaces, manualBlocklist, manualSafelist,
        trainingData, classifierWeights,
      });
    }

    case "importLearning": {
      const d = msg.data;
      if (d.knownFaces) {
        knownFaces = knownFaces.concat(d.knownFaces);
        if (knownFaces.length > MAX_KNOWN_FACES) knownFaces = knownFaces.slice(-MAX_KNOWN_FACES);
      }
      if (d.knownSafeFaces) {
        knownSafeFaces = knownSafeFaces.concat(d.knownSafeFaces);
        if (knownSafeFaces.length > MAX_KNOWN_FACES) knownSafeFaces = knownSafeFaces.slice(-MAX_KNOWN_FACES);
      }
      if (d.manualBlocklist) {
        for (const url of d.manualBlocklist) {
          if (!manualBlocklist.includes(url)) manualBlocklist.push(url);
        }
      }
      if (d.manualSafelist) {
        for (const url of d.manualSafelist) {
          if (!manualSafelist.includes(url)) manualSafelist.push(url);
        }
      }
      if (d.trainingData) {
        trainingData = trainingData.concat(d.trainingData);
        if (trainingData.length > MAX_TRAINING_DATA) trainingData = trainingData.slice(-MAX_TRAINING_DATA);
      }
      if (d.classifierWeights) classifierWeights = d.classifierWeights;
      if (trainingData.length >= 10) trainClassifier();
      return saveLearningData().then(() => ({ success: true }));
    }

    default:
      return Promise.resolve({});
  }
});

// --- Init ---

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
    stateReady$.next(true); stateReady$.complete();
    updateBadge();
    // Auto-register with the shared server if we don't have a token yet
    if (!serverToken) {
      serverAutoRegister()
        .then(() => { serverReady$.next(true); serverReady$.complete(); })
        .catch(err => {
          console.warn("[Shmirat Eynaim] Auto-register failed:", err.message);
          serverReady$.next(false); serverReady$.complete();
        });
    } else {
      serverEnabled = true;
      serverReady$.next(true); serverReady$.complete();
    }
    console.log("[Shmirat Eynaim] Background script initialized");
  } catch (err) {
    console.error("[Shmirat Eynaim] Init error:", err);
  }
})();
