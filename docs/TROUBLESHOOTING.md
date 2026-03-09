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
