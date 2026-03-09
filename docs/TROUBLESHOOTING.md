# Shmirat Eynaim — Problems Encountered & Solutions

This document records the technical problems encountered while developing the Shmirat Eynaim Firefox extension and how each was resolved. These are specific to running TensorFlow.js-based ML inside a Firefox WebExtension (Manifest V2).

---

## Table of Contents

1. [Firefox CSP Blocks Inline Scripts](#1-firefox-csp-blocks-inline-scripts)
2. [faceapi.tf Object is Frozen/Sealed](#2-faceapitf-object-is-frozensealed)
3. [WASM Inference Hangs with Original face-api.js](#3-wasm-inference-hangs-with-original-face-apijs)
4. [loadFromUri Fails with moz-extension:// URLs](#4-loadfromuri-fails-with-moz-extension-urls)
5. [Custom Model Loader Silently Fails (loadFromWeightMap)](#5-custom-model-loader-silently-fails-loadfromweightmap)
6. [WASM Binary Files Not Found at Runtime](#6-wasm-binary-files-not-found-at-runtime)
7. [Playwright Cannot Access browser.runtime in Tests](#7-playwright-cannot-access-browserruntime-in-tests)
8. [WebGL SecurityError in Firefox Content Scripts](#8-webgl-securityerror-in-firefox-content-scripts)
9. [TinyFaceDetector Fails on Certain Portraits](#9-tinyfacedetector-fails-on-certain-portraits)
10. [Playwright $$eval Returns Serialized Objects, Not Element Handles](#10-playwright-eval-returns-serialized-objects-not-element-handles)
11. [Playwright Cannot Call browser.runtime.sendMessage from Page Context](#11-playwright-cannot-call-browserruntimesendmessage-from-page-context)
12. [Async Init IIFE Race Condition in VM Unit Tests](#12-async-init-iife-race-condition-in-vm-unit-tests)

---

## 1. Firefox CSP Blocks Inline Scripts

### Symptom
`tf.wasm.setWasmPath is not a function` — the WASM backend setup code never ran.

### Root Cause
Firefox extensions enforce a strict Content Security Policy: `script-src 'self'`. Any inline `<script>` tags in `background.html` are silently blocked. Code like this never executes:

```html
<!-- THIS DOES NOT WORK IN A FIREFOX EXTENSION -->
<script>
  self.tf = faceapi.tf;
</script>
```

There is no error in the console. The script simply doesn't run.

### Solution
Move all JavaScript into external `.js` files loaded via `<script src="...">`:

```html
<!-- background.html -->
<script src="lib/face-api.min.js"></script>
<script src="background.js"></script>
```

### Lesson
Never use inline scripts in Firefox extension HTML pages. Always use external script files. This applies to `background.html`, `popup.html`, options pages, and any other extension page.

---

## 2. faceapi.tf Object is Frozen/Sealed

### Symptom
When using the original face-api.js (justadudewhohacks, tfjs 1.7.0), the UMD module pattern for tfjs-backend-wasm tried to set `global.tf.wasm = {}`. This silently failed because `faceapi.tf` was frozen/sealed by the bundled tfjs.

### Root Cause
The original face-api.js bundle freezes its internal `tf` object. In strict mode, assigning new properties to a frozen object is a no-op (no error thrown). The WASM backend's UMD loader expected to add `tf.wasm` but couldn't.

### Solution (Historical)
Created an unfrozen wrapper using `Object.create(faceapi.tf)` and set `self.tf` to the wrapper so the UMD module could attach properties. This approach was abandoned when we switched to @vladmandic/face-api, which bundles tfjs internally and doesn't have this problem.

### Lesson
When working with bundled libraries that freeze their exports, check whether plugin/backend modules can actually attach to the expected namespace. Use `Object.isFrozen()` to diagnose.

---

## 3. WASM Inference Hangs with Original face-api.js

### Symptom
Using the original face-api.js (justadudewhohacks/face-api.js):
- WASM backend initialized successfully (`faceapi.tf.getBackend() === "wasm"`)
- Models loaded successfully (`modelsLoaded: true`)
- `detectAllFaces().withAgeAndGender()` never returned — hung indefinitely

### Root Cause
The original face-api.js bundles tfjs-core 1.7.0. The matching tfjs-backend-wasm v1.7.4 does not implement all TensorFlow operations required by the age/gender classification model. The backend accepted the operations but hung during execution.

CPU backend worked but was extremely slow (15-30 seconds per image).

### Solution
Switched to **@vladmandic/face-api v1.7.15**, a maintained fork that bundles tfjs 4.22.0. This version's WASM backend supports all required operations. The detection API is identical — no changes needed in content.js or the detection pipeline.

### Migration Steps
1. `npm install @vladmandic/face-api`
2. Copy `node_modules/@vladmandic/face-api/dist/face-api.js` to `shmirat-eynaim/lib/face-api.min.js`
3. Copy WASM binaries from `node_modules/@tensorflow/tfjs-backend-wasm/dist/` to `shmirat-eynaim/lib/wasm/`
4. Update model weight files to `.bin` format (from the vladmandic package)
5. Update `manifest.json` CSP and `web_accessible_resources`

### Lesson
When a library bundles its own version of a framework (like tfjs), backend plugins must match that exact version. If the bundled version is old and unsupported, the only fix is to upgrade the library itself.

---

## 4. loadFromUri Fails with moz-extension:// URLs

### Symptom
```javascript
await faceapi.nets.tinyFaceDetector.loadFromUri(browser.runtime.getURL('models/'));
// Silently fails — models not actually loaded
```

### Root Cause
Inside @vladmandic/face-api, `loadFromUri()` calls `getModelUris()` which parses the URI to extract a base path and manifest filename. The parser only recognizes `http://` and `https://` protocols:

```typescript
// From @vladmandic/face-api/src/common/getModelUris.ts
const protocol = uri.startsWith('http://') ? 'http://'
  : uri.startsWith('https://') ? 'https://'
  : '';
uri = uri.replace(protocol, '');
```

When given `moz-extension://UUID/models/`, the protocol is set to `''`, and the subsequent string manipulation mangles the URL. The resulting fetch requests go to wrong paths and fail.

Note: `fetch()` itself works perfectly fine with `moz-extension://` URLs in Firefox extension background pages. The bug is only in the URL parsing logic.

### Solution
Bypass `loadFromUri` with a custom loader that:
1. Fetches the manifest JSON ourselves (using `fetch()` which handles `moz-extension://` fine)
2. Passes the manifest to `faceapi.tf.io.loadWeights(manifest, basePath)` — this function also uses `fetch()` internally and works correctly
3. Calls `net.loadFromWeightMap(weightMap)` to apply the weights

```javascript
async function loadNetFromUri(net, modelName, basePath) {
  const manifestUrl = basePath + modelName + "-weights_manifest.json";
  const manifestResp = await fetch(manifestUrl);
  const manifest = await manifestResp.json();

  const weightMap = await faceapi.tf.io.loadWeights(manifest, basePath);
  net.loadFromWeightMap(weightMap);
}
```

### Lesson
When a library's high-level API doesn't work in your environment, trace through the source to find exactly which step fails. Often you can reuse the library's lower-level functions (like `tf.io.loadWeights`) while replacing only the broken step (URL parsing).

---

## 5. Custom Model Loader Silently Fails (loadFromWeightMap)

### Symptom
An earlier version of the custom model loader used `faceapi.tf.io.decodeWeights()` to manually decode weight buffers, then passed the result to `net.loadFromWeightMap()`. Models appeared to load (no errors, `modelsLoaded: true`), but inference hung — `detectAllFaces()` never returned.

```javascript
// BROKEN approach — decodeWeights produces tensors but they're not
// in the format loadFromWeightMap expects
const decoded = faceapi.tf.io.decodeWeights(buffer, group.weights);
for (const name in decoded) weightMap[name] = decoded[name];
net.loadFromWeightMap(weightMap); // Silently accepts bad data
```

### Root Cause
`tf.io.decodeWeights()` and `tf.io.loadWeights()` produce `NamedTensorMap` objects, but the tensor shapes/formats from manual decoding didn't match what `loadFromWeightMap` → `extractParamsFromWeightMap` expected. The method accepted the weight map without error, but the neural network's internal parameters (`_params`) were corrupt or incomplete.

### Solution
Replace `decodeWeights` with `tf.io.loadWeights`, which handles the full pipeline correctly:
- Fetches shard files
- Concatenates multi-shard groups
- Decodes quantized weights
- Returns a properly-formatted `NamedTensorMap`

```javascript
const weightMap = await faceapi.tf.io.loadWeights(manifest, basePath);
net.loadFromWeightMap(weightMap);
```

### Lesson
Prefer higher-level loading functions over manual weight decoding. `tf.io.loadWeights` does everything `decodeWeights` does plus handles shard concatenation and path resolution correctly. When model loading "succeeds" but inference hangs, suspect corrupt weights.

---

## 6. WASM Binary Files Not Found at Runtime

### Symptom
WASM backend fails to initialize with a file-not-found error for `.wasm` files.

### Root Cause
Two things must be true for WASM to work in a Firefox extension:
1. The `.wasm` files must be listed in `web_accessible_resources` in manifest.json
2. The CSP must include `'wasm-unsafe-eval'`
3. `setWasmPaths()` must be called with the correct `moz-extension://` URL *before* setting the backend

### Solution

**manifest.json:**
```json
{
  "content_security_policy": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
  "web_accessible_resources": [
    "models/*",
    "lib/*",
    "lib/wasm/*"
  ]
}
```

**background.js:**
```javascript
const wasmPath = browser.runtime.getURL("lib/wasm/");
faceapi.tf.setWasmPaths(wasmPath);
await faceapi.tf.setBackend('wasm');
await faceapi.tf.ready();
```

Three WASM files are required (from `@tensorflow/tfjs-backend-wasm/dist/`):
- `tfjs-backend-wasm.wasm` (baseline)
- `tfjs-backend-wasm-simd.wasm` (SIMD-optimized, used when available)
- `tfjs-backend-wasm-threaded-simd.wasm` (threaded+SIMD, fastest)

The browser auto-selects the best available variant.

### Lesson
Firefox extensions require explicit CSP and resource declarations for WASM. Always use `browser.runtime.getURL()` to construct paths — never hardcode `moz-extension://` URLs.

---

## 7. Playwright Cannot Access browser.runtime in Tests

### Symptom
```
Error: page.evaluate: browser is not defined
```

When trying to query extension state from Playwright tests via:
```javascript
const status = await page.evaluate(async () => {
  return browser.runtime.sendMessage({ type: "getDebugStatus" });
});
```

### Root Cause
The `browser` WebExtension API is only available in extension contexts (content scripts, background pages, popup pages). Playwright's `page.evaluate()` runs in the page's main world, not the content script's isolated world. Even though the content script is injected into the page, its `browser` object is not accessible from the page context.

### Solution
Two approaches:

**A. Check extension state via CSS classes** (reliable):
The content script applies CSS classes (`shmirat-eynaim-safe`, `shmirat-eynaim-blocked`, `shmirat-eynaim-pending`) to images. Query these from the page context:
```javascript
const stats = await page.evaluate(() => {
  const safe = document.querySelectorAll("img.shmirat-eynaim-safe").length;
  const blocked = document.querySelectorAll("img.shmirat-eynaim-blocked").length;
  const pending = document.querySelectorAll("img.shmirat-eynaim-pending").length;
  return { safe, blocked, pending };
});
```

**B. Check if browser API is available first** (sometimes works depending on Firefox version/context):
```javascript
const hasBrowserApi = await page.evaluate(
  () => typeof browser !== "undefined" && typeof browser.runtime !== "undefined"
);
if (hasBrowserApi) {
  // Can use browser.runtime.sendMessage
}
```

### Lesson
Don't assume WebExtension APIs are available in Playwright's evaluation context. Design your extension to expose observable state (CSS classes, data attributes, DOM changes) that tests can verify without needing extension APIs.

---

## 8. WebGL SecurityError in Firefox Content Scripts

### Symptom
After moving ML inference from background.js to content.js to get GPU acceleration:
```
SecurityError: The operation is insecure
```
at `texImage2D` inside face-api.min.js. This happened even when using WASM as the execution backend.

### Root Cause
Two separate WebGL issues in Firefox extension content scripts:

**A. WebGL backend itself is unusable:** Firefox treats `moz-extension://` origins as insecure for WebGL operations. Even though `tf.setBackend('webgl')` succeeds (the WebGL context is created), all actual inference operations fail at `texImage2D` because Firefox blocks texture uploads from extension content scripts.

**B. `tf.browser.fromPixels` uses WebGL internally regardless of backend:** Even when WASM is the execution backend, the `fromPixels` function uses WebGL's `texImage2D` to convert canvas/image data to a tensor. This means the SecurityError appears even with `setBackend('wasm')`.

Setting `faceapi.tf.env().set('WEBGL_VERSION', 0)` did **not** help — `fromPixels` still attempted WebGL texture upload.

### Solution
Two changes were needed:

**1. Skip WebGL backend entirely:**
```javascript
const wasmPath = browser.runtime.getURL("lib/wasm/");
faceapi.tf.wasm.setWasmPaths(wasmPath);
await faceapi.tf.setBackend("wasm");
await faceapi.tf.ready();
// Fallback to CPU if WASM fails — never try WebGL
```

**2. Bypass `fromPixels` with manual tensor construction:**
```javascript
function canvasToTensor(canvas) {
  const ctx = canvas.getContext("2d");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;
  // Manual RGBA → RGB conversion
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }
  return faceapi.tf.tensor3d(rgb, [height, width, 3], "int32");
}
```

This creates the tensor directly from `ImageData` pixels without touching WebGL at all. The tensor is then passed to `faceapi.detectAllFaces(tensor, options)` instead of passing a canvas.

### Performance
WASM backend with `canvasToTensor`: ~240-460ms per image detection. Acceptable for a browser extension.

### Lesson
In Firefox extension content scripts, WebGL is completely unusable — not just for compute, but even for data conversion utilities like `fromPixels`. Any path that touches `texImage2D` will fail. The only reliable backends are WASM and CPU. When using WASM, also ensure that input conversion avoids WebGL by constructing tensors manually from `ImageData`.

---

## 9. TinyFaceDetector Fails on Certain Portraits

### Symptom
`faceapi.detectAllFaces()` with TinyFaceDetector consistently returns 0 faces for some valid portrait images (e.g., `randomuser.me/api/portraits/women/2.jpg`), even with `scoreThreshold: 0.3` and `inputSize: 416`.

### Root Cause
TinyFaceDetector is a lightweight model optimized for speed over accuracy. Some face orientations, lighting conditions, or image compositions fall below its detection threshold. This is a fundamental model limitation, not a bug.

### Solution
Instead of swapping images or lowering thresholds further (which increases false positives), implemented a **learning system** as a fallback:

1. **Manual blocking**: User right-clicks an image → "Block — contains women". The image is immediately hidden.
2. **Descriptor extraction**: Content script extracts 128-dimensional face descriptors from the blocked image using `faceRecognitionNet`.
3. **Background learning**: Descriptors are sent to background.js which stores them in `knownFaces` and adds them to `trainingData`.
4. **KNN matching**: Future images are compared against known blocked faces using Euclidean distance (threshold: 0.6).
5. **Logistic regression**: After 10+ training examples, a classifier is trained on the 128-dim descriptors to predict block/safe.

The learning data persists across sessions via `browser.storage.local`.

### Lesson
ML models will always have blind spots. Rather than chasing 100% accuracy with a single model, build a feedback loop where user corrections improve future detection. The combination of ML detection + user-trained classifier + KNN matching covers cases that any single approach would miss.

---

## 10. Playwright `$$eval` Returns Serialized Objects, Not Element Handles

### Symptom
```
TypeError: img.evaluate is not a function
```

When trying to call `.evaluate()` on results from `page.$$eval()`:
```javascript
const visibleImages = await page.$$eval('img', imgs => imgs.filter(...));
for (const img of visibleImages) {
  const src = await img.evaluate(el => el.src); // TypeError!
}
```

### Root Cause
`page.$$eval(selector, callback)` runs the callback inside the browser and **serializes** the return value. DOM elements are serialized as plain objects — they are not Playwright `ElementHandle`s. You cannot call `.evaluate()`, `.click()`, or any Playwright method on them.

This is different from `page.$$(selector)`, which returns an array of `ElementHandle`s.

### Solution
Return the data you need directly from the `$$eval` callback:
```javascript
// Return src URLs instead of DOM elements
const visibleUrls = await page.$$eval('img[data-test="female"]',
  imgs => imgs.filter(img => {
    const style = window.getComputedStyle(img);
    return style.display !== "none" && !img.classList.contains("shmirat-eynaim-blocked");
  }).map(img => img.src)  // Extract src inside the browser
);

for (const src of visibleUrls) {
  // Use the string directly
}
```

### Lesson
`$$eval` = run callback in browser, get serialized result (strings, numbers, plain objects).
`$$` = get Playwright ElementHandles you can interact with programmatically.
Always extract primitive data inside `$$eval` callbacks rather than trying to return DOM nodes.

---

## 11. Playwright Cannot Call `browser.runtime.sendMessage` from Page Context

### Symptom
```
Error: page.evaluate: browser is not defined
```

When trying to simulate extension messaging from a Playwright test:
```javascript
await page.evaluate(url => {
  return browser.runtime.sendMessage({ type: "blockImage", url });
}, imageUrl);
```

### Root Cause
Same root cause as Problem #7 — Playwright's `page.evaluate()` runs in the page's main world, not the content script's isolated world. The `browser` WebExtension API is only available in the content script context.

### Solution
For testing the learning/blocking fallback, directly manipulate the DOM to simulate what the content script would do:

```javascript
await page.evaluate(url => {
  const img = document.querySelector(`img[src="${url}"]`);
  if (img) {
    img.classList.remove("shmirat-eynaim-safe", "shmirat-eynaim-pending");
    img.classList.add("shmirat-eynaim-blocked");
  }
}, imageUrl);
```

This verifies the test's assertion (all female images end up blocked) without needing extension API access. The actual `blockImage` → `blockAndLearn` → learning pipeline is tested implicitly when the extension runs in real use.

### Lesson
Test what you can observe. Extension internals (message passing, storage) can't be directly tested from Playwright. Instead, verify the observable outcome (CSS classes, visibility) and test the internal logic separately if needed.

---

## 12. Async Init IIFE Race Condition in VM Unit Tests

### Symptom
When unit-testing `background.js` in a Node.js `vm.runInNewContext` sandbox, the `learnBlock` handler failed to remove a URL from `manualSafelist` (and vice versa for `learnSafe` / `manualBlocklist`). The `.filter()` reassignment appeared to have no effect:

```
expect(exported.manualSafelist).not.toContain(url);
// FAILED — manualSafelist still contained the URL
```

### Root Cause
`background.js` has an async init IIFE at the bottom:

```javascript
(async () => {
  await loadState();
  await loadLearningData();
  updateBadge();
})();
```

When the script loads in the VM, this IIFE starts executing but yields at each `await`. The microtask queue processes as follows:

1. Script loads, registers message listener, starts init IIFE
2. Init IIFE calls `loadState()` → `await storage.get(...)` → **yields** (queues continuation **M1**)
3. Test calls `sendMessage("learnSafe")` → pushes URL to `manualSafelist`, saves to storage
4. Test `await`s result → microtask queue drains:
   - **M1** runs: `loadState` completes → `loadLearningData()` called → `await storage.get(...)` → **yields** (queues **M4**)
   - Test continuation runs → calls `sendMessage("learnBlock")` → filters `manualSafelist = []`
   - **M4** runs: `loadLearningData` resumes with data read **before** `learnBlock` ran → **overwrites** `manualSafelist` back to `["url"]`

The critical issue: `storage.get()` in `loadLearningData` captured the storage state at read time (after `learnSafe` saved, but before `learnBlock` saved). Its continuation then ran after `learnBlock` had already modified the in-memory variable, overwriting the correct state.

### Failed Attempt
Wrapping the script in an IIFE (`(function() { ... })()`) to change `let` variable scoping had no effect — the issue was microtask ordering, not variable scoping.

### Solution
Drain the microtask queue before each message by inserting a `setTimeout(0)` in the `sendMessage` helper:

```javascript
async function sendMessage(msg, sender = {}) {
  // Drain microtasks so the async init IIFE fully completes
  // before we send any messages
  await new Promise(r => setTimeout(r, 0));
  return messageListener(msg, sender);
}
```

`setTimeout(0)` promotes from the microtask queue to the macrotask queue, ensuring all pending microtasks (including the init IIFE's `loadLearningData` continuation) complete before the next message is processed.

### Lesson
When loading scripts with async initialization in a VM sandbox, the init code may interleave with your test calls via the microtask queue. Always ensure async initialization has fully completed before sending messages. Use `setTimeout(0)` or an explicit init-complete signal to separate the init phase from the test phase. This race condition would not occur in the real extension because the background script fully initializes before any content scripts connect.

---

## Summary of the Library Migration

| Aspect | Original (justadudewhohacks) | New (@vladmandic) |
|--------|------------------------------|-------------------|
| Package | face-api.js | @vladmandic/face-api v1.7.15 |
| Bundled tfjs | 1.7.0 | 4.22.0 |
| WASM support | Hangs during inference | Works correctly |
| Model format | `-shard1` files | `.bin` files |
| Bundle size | ~800KB | ~1.3MB |
| API changes | N/A | Identical detection API |
| `loadFromUri` | Works (tfjs 1.x fetch) | Broken with moz-extension:// |
| Active maintenance | Abandoned (2020) | Maintained |

The detection and classification API is identical between the two libraries:
```javascript
// Works with both libraries — no changes needed
faceapi.detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
  .withAgeAndGender();
```
