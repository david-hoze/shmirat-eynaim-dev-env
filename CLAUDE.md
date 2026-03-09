# Shmirat Eynaim — Firefox Extension Development

## Project Overview

You are developing **Shmirat Eynaim**, a Firefox WebExtension (Manifest V2) that uses client-side ML (face-api.js) to detect and hide images containing women on any website. This is a religious/modesty filter. The guiding principle is **strict mode**: when in doubt, hide the image. False positives are acceptable; false negatives are not.

## Your Development Loop

You are an autonomous coding agent. Follow this loop continuously:

```
1. READ the current state of the code and any test results
2. IDENTIFY the next issue, bug, or missing feature
3. IMPLEMENT the fix or feature
4. TEST using the Playwright test harness (npm test)
5. VISUALLY VERIFY using screenshots (npm run test:visual)
6. If tests pass → commit and move to the next task
7. If tests fail → analyze the failure, fix, and re-test
8. Repeat until all acceptance criteria pass
```

## Key Architecture

```
shmirat-eynaim/
├── manifest.json          # Manifest V2
├── background.js          # ML engine: face-api.js face detection + gender classification
├── content.js             # Image discovery, analysis orchestration, hiding
├── content.css            # Hide/show CSS classes
├── popup/                 # Toggle UI, whitelist, stats
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── models/                # face-api.js model weights (bundled)
├── lib/
│   └── face-api.min.js   # face-api.js library
└── icons/                 # Extension icons
```

## Testing Infrastructure

### Playwright + Firefox
All browser testing uses **Playwright with Firefox**. This is critical — the extension is Firefox-only.

```bash
# Run all tests (headless)
npm test

# Run tests with visible browser (for debugging)
npm run test:headed

# Run visual verification tests (takes screenshots)
npm run test:visual

# Run a specific test file
npx playwright test tests/basic-loading.spec.js

# Run with Firefox DevTools open
PWDEBUG=1 npx playwright test
```

### Test Categories (in priority order)

1. **Extension Loading** — Does it install and initialize without errors?
2. **Icon/SVG Passthrough** — Small images, SVGs, and known icon domains are never hidden
3. **Safe Image Passthrough** — Landscape photos, objects, male-only photos stay visible
4. **Female Face Detection** — Images with women are hidden
5. **Strict Mode** — Ambiguous/uncertain images are hidden (not shown)
6. **Toggle & Whitelist** — On/off toggle and per-domain whitelisting work
7. **Performance** — Pages with <30 images load without noticeable delay
8. **Edge Cases** — Background images, lazy-loaded images, data URIs, broken images

### Test Pages

The `tests/fixtures/` directory contains local HTML test pages:
- `test-icons.html` — Only icons/SVGs (should show everything)
- `test-safe-images.html` — Landscapes, objects, male portraits (should show everything)
- `test-female-faces.html` — Female portraits (should hide all)
- `test-mixed.html` — Mix of all types (verify correct hide/show)
- `test-edge-cases.html` — Background images, lazy-load, data URIs, broken images
- `test-performance.html` — 50+ images for performance testing

### Screenshot Verification

After running `npm run test:visual`, screenshots are saved to `test-results/screenshots/`.
Compare these to verify:
- Hidden images should be replaced with a neutral placeholder or invisible
- Visible images should look normal (no flashing, no layout shift)
- Icons and UI elements should be untouched

## ML Pipeline Details

### face-api.js
- **Face Detection**: Tiny Face Detector (fastest)
- **Gender Classification**: Gender Recognition Net
- Models loaded from `models/` directory bundled in the extension
- Detection + classification: `faceapi.detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions()).withAgeAndGender()`

### Decision Logic
```
For each image:
  1. Skip if < 40x40 pixels
  2. Skip if SVG or from icon domain
  3. Run face detection
  4. No faces → SHOW
  5. Faces found → classify gender
  6. ANY face female OR confidence < 0.65 male → HIDE
  7. ALL faces confidently male (>0.65) → SHOW
```

### Strict Mode Principle
- When models fail to load → hide ALL images
- When an image fails to fetch/analyze → hide it
- When gender confidence is ambiguous → hide it
- Threshold for "male" must be > 0.65

## Coding Standards

- All JS: async/await, well-commented
- No console errors in production
- Images start hidden (CSS), fade in only when confirmed safe
- Use OffscreenCanvas for image analysis
- MutationObserver for dynamic content
- Concurrency limit of 3 simultaneous analyses
- Per-session cache of analyzed URLs

## Git Workflow

After each successful test cycle:
```bash
git add -A
git commit -m "feat: <description of what changed>"
```

Use conventional commits: feat, fix, test, refactor, docs, chore.

## Current Task List

Check `TASKS.md` for the current prioritized task list. Update it as you complete tasks.

## When You're Stuck

1. Check the browser console logs (captured in test output)
2. Take a screenshot and analyze what's visible
3. Check if face-api.js models loaded (look for "[Shmirat Eynaim]" log prefix)
4. Try a simpler test case first
5. If a test is flaky, add retry logic or increase timeouts

## Definition of Done

ALL of these must pass before signaling completion:
- [ ] Extension loads in Firefox without errors
- [ ] face-api.js models load successfully
- [ ] Icons, SVGs, and small images are never hidden
- [ ] Landscapes and object-only images are shown
- [ ] Images with female faces are hidden
- [ ] Images with only male faces are shown
- [ ] Ambiguous/uncertain images are hidden (strict mode)
- [ ] Toggle on/off works
- [ ] Whitelist per domain works
- [ ] Popup shows correct stats
- [ ] No image "flash" before hiding
- [ ] Performance acceptable on pages with 30+ images
- [ ] All Playwright tests pass
- [ ] Visual screenshots match expectations

## Testing Popup Stats (Scanned/Hidden Counts)

The popup can't be opened via Playwright toolbar clicks. Use these two approaches:

### Approach A: Query stats via content script messaging
In Playwright tests, after waiting for ML processing to finish, evaluate this in the page:
```javascript
const stats = await page.evaluate(async () => {
  return browser.runtime.sendMessage({ type: "getStats" });
});
expect(stats.scanned).toBeGreaterThan(0);
expect(stats.hidden).toBe(expectedHiddenCount);
```

### Approach B: Open the popup as a page
1. After launching Firefox with the extension profile, read the extension UUID from the profile's `extensions.json` file
2. Navigate to `moz-extension://{uuid}/popup/popup.html`
3. Use Playwright to check the DOM: `await page.textContent('#stats')` should contain the correct scanned/hidden counts
4. Also verify the toggle switch, domain display, and whitelist entries render correctly

Use both approaches. Approach A verifies the data is correct. Approach B verifies the popup UI displays it correctly.

## CRITICAL: Switch from face-api.js to @vladmandic/face-api

The original face-api.js is abandoned and pinned to tfjs 1.7.4. Its WASM backend doesn't support all ops needed for gender classification (inference hangs). Switch to the maintained fork.

### Steps

1. **Download @vladmandic/face-api** from npm or CDN:
   - npm: `@vladmandic/face-api` (latest version)
   - CDN: `https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.esm.js` (or the non-ESM bundle)
   - Place the bundled JS in `lib/` replacing `face-api.min.js`

2. **Download the matching model weights** from https://github.com/nicolo-ribaudo/face-api.js/tree/master/model or from the npm package's `model/` directory. You need:
   - `tiny_face_detector_model-weights_manifest.json` + shard(s)
   - `gender_recognition_model-weights_manifest.json` + shard(s)
   - These replace the old model files in `models/`. The format is compatible but grab the ones from vladmandic's repo to be safe.

3. **Bundle the tfjs WASM backend binaries**. The @vladmandic/face-api build includes tfjs 3.x+. You need the WASM files:
   - `tfjs-backend-wasm.wasm`
   - `tfjs-backend-wasm-simd.wasm`
   - `tfjs-backend-wasm-threaded-simd.wasm`
   - Get these from `node_modules/@tensorflow/tfjs-backend-wasm/dist/` or from the CDN
   - Place them in `lib/wasm/`
   - Add `lib/wasm/*` to `web_accessible_resources` in manifest.json

4. **Update background.js model loading**:
   ```javascript
   // Set WASM path BEFORE loading models
   const wasmPath = browser.runtime.getURL('lib/wasm/');
   faceapi.tf.setWasmPaths(wasmPath);
   await faceapi.tf.setBackend('wasm');
   await faceapi.tf.ready();

   // Then load models as before
   const modelPath = browser.runtime.getURL('models/');
   await faceapi.nets.tinyFaceDetector.loadFromUri(modelPath);
   await faceapi.nets.ageGenderNet.loadFromUri(modelPath);
   ```

5. **The detection/classification API is identical**. No changes needed to:
   - `faceapi.detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions()).withAgeAndGender()`
   - Result format: `.gender` ("male"/"female"), `.genderProbability` (0-1)
   - Decision logic stays the same

6. **If background.js needs a DOM context for canvas operations**, use `background.html` instead of a plain background script. In manifest.json:
   ```json
   "background": {
     "page": "background.html"
   }
   ```
   And in `background.html`:
   ```html
   <!DOCTYPE html>
   <html><head>
     <script src="lib/face-api.min.js"></script>
     <script src="background.js"></script>
   </head><body></body></html>
   ```

7. **Test that WASM initializes** by checking the console for backend confirmation:
   ```javascript
   console.log("[Shmirat Eynaim] tfjs backend:", faceapi.tf.getBackend());
   // Should print "wasm", not "cpu"
   ```

8. **If WASM fails to load** (missing files, CSP issues), fall back to CPU:
   ```javascript
   try {
     faceapi.tf.setWasmPaths(wasmPath);
     await faceapi.tf.setBackend('wasm');
     await faceapi.tf.ready();
   } catch (err) {
     console.warn("[Shmirat Eynaim] WASM failed, falling back to CPU:", err);
     await faceapi.tf.setBackend('cpu');
     await faceapi.tf.ready();
   }
   ```

9. **CSP note**: Firefox extensions block inline scripts. All scripts must be loaded via `<script src="...">` in background.html, never inline. The WASM files must be in `web_accessible_resources`.

### Expected result
- WASM backend loads successfully
- detectAllFaces().withAgeAndGender() completes in 1-3 seconds per image (vs 15-30s on CPU)
- All existing tests pass within their timeouts
- No API changes needed in content.js or popup.js

### Verification
After making this switch, run:
```bash
npm test
```
The stats query test should now pass — images should move from "pending" to "safe" or "blocked" within the test timeout.

## Add Person Detection (COCO-SSD) for Body-Only Images

The current pipeline only detects faces. Images of women without visible faces (back turned, face cropped, hat/sunglasses) slip through. Fix this by adding COCO-SSD person detection.

### New Decision Logic

```
For each image:
  1. Skip if < 40x40 pixels, SVG, or icon domain
  2. Run face detection (Tiny Face Detector)
  3. Run person detection (COCO-SSD) in parallel
  4. Apply this decision matrix:

  Face found + male (>0.65 confidence)     → SHOW
  Face found + female or uncertain          → HIDE
  No face + person detected                 → HIDE (strict mode)
  No face + no person                       → SHOW
  Error in either detection                 → HIDE (strict mode)
```

### Implementation Steps

1. **Get COCO-SSD model**. Use @tensorflow-models/coco-ssd. It's available as:
   - npm: `@tensorflow-models/coco-ssd`
   - CDN: `https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd`
   - It depends on tfjs core which @vladmandic/face-api already includes
   - Bundle the model files. COCO-SSD uses mobilenet_v2 by default — the model weights load from a URL. Download them and put in `models/coco-ssd/` so they work offline.
   - Add `models/coco-ssd/*` to `web_accessible_resources` in manifest.json

2. **Load COCO-SSD alongside face-api models at startup**:
   ```javascript
   // In background.js (or wherever models load)
   const cocoModel = await cocoSsd.load({
     base: 'mobilenet_v2',
     modelUrl: browser.runtime.getURL('models/coco-ssd/model.json')
   });
   ```
   If running inference in content.js (WebGL approach), load it there instead.

3. **Run both detections together**. For each image, run them in parallel:
   ```javascript
   async function analyzeImage(canvas) {
     const [faces, objects] = await Promise.all([
       faceapi.detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions())
         .withAgeAndGender(),
       cocoModel.detect(canvas)
     ]);

     const persons = objects.filter(obj => obj.class === 'person');

     // Decision logic
     if (faces.length > 0) {
       // Face path: check gender
       const hasFemaleOrUncertain = faces.some(f =>
         f.gender === 'female' || f.genderProbability < 0.65
       );
       return { containsWomen: hasFemaleOrUncertain, faces: faces.length, persons: persons.length };
     }

     if (persons.length > 0) {
       // Person detected but no face → strict mode → hide
       return { containsWomen: true, faces: 0, persons: persons.length, reason: 'person-no-face' };
     }

     // No faces, no persons → safe
     return { containsWomen: false, faces: 0, persons: 0 };
   }
   ```

4. **COCO-SSD filters**. The model detects 80 object classes. Only care about `person`. Ignore everything else (cars, dogs, chairs, etc.). Set a minimum confidence threshold:
   ```javascript
   const persons = objects.filter(obj =>
     obj.class === 'person' && obj.score > 0.5
   );
   ```
   Use 0.5 confidence, not higher — strict mode means we'd rather have false positives than miss someone.

5. **Small person detections**. If COCO-SSD detects a "person" bounding box that's very small (under 60x60 pixels in the original image), it's likely a distant figure or a false positive. You can skip those:
   ```javascript
   const persons = objects.filter(obj =>
     obj.class === 'person' &&
     obj.score > 0.5 &&
     obj.bbox[2] > 60 &&  // width
     obj.bbox[3] > 60     // height
   );
   ```

6. **Update the stats**. The popup and stats message should now track three categories:
   - `hidden` — total hidden images
   - `hiddenFace` — hidden because female face detected
   - `hiddenBody` — hidden because person detected but no face (new)
   This helps with debugging and tells the user why an image was hidden.

7. **Update test fixtures**. Add a new test page:

   **`tests/fixtures/test-bodies.html`** — Images of people without visible faces:
   - Person photographed from behind
   - Person with face cropped out of frame
   - Silhouette of a person
   - Group photo where some faces are obscured
   - Should ALL be hidden (strict mode: person + no identifiable male face = hide)

   Add a corresponding test in the Playwright spec:
   ```javascript
   test("person without visible face is hidden", async () => {
     const page = await context.newPage();
     await page.goto("http://localhost:3999/test-bodies.html", {
       waitUntil: "networkidle",
     });
     await page.waitForTimeout(10_000);

     const visiblePersons = await page.$$eval(
       'img[data-test="person-no-face"]',
       (imgs) => imgs.filter(img =>
         !img.classList.contains("shmirat-eynaim-blocked")
       ).length
     );
     expect(visiblePersons).toBe(0);
   });
   ```

8. **Performance note**. COCO-SSD on WebGL adds ~50-100ms per image. Running it in parallel with face detection means the total time is max(face, coco) not face + coco. This should be fine.

9. **Bundle size**. COCO-SSD mobilenet_v2 adds ~5MB of model weights. Total extension size goes from ~8MB to ~13MB. This is acceptable.

### Verification
After implementing, these should all pass:
- Existing face detection tests (no regression)
- New body detection tests (person-no-face → hidden)
- Icon/landscape tests still pass (no person = show)
- Stats show correct hiddenFace vs hiddenBody counts

## Cloud API Integration (Claude Haiku) with Learning System

Every image that passes the initial skip filters (not an icon, not SVG, not < 40x40) gets sent to Claude Haiku for classification. Haiku's results feed into the existing three-layer learning system.

### Architecture Overview

```
Image discovered
  │
  ├─ Skip filters (size, SVG, icon domain) → SHOW immediately
  │
  ├─ Check local cache (URL blocklist/allowlist) → instant result if hit
  │
  ├─ Check KNN face similarity → instant result if confident match
  │
  ├─ Run local ML (face-api.js + COCO-SSD) → fast local result
  │
  └─ Send to Haiku API (every image) → authoritative cloud result
        │
        ├─ Cache the URL result
        ├─ Feed face descriptors into KNN (if faces detected locally)
        ├─ Feed into trainable classifier training set
        └─ HIDE or SHOW based on Haiku's answer

Decision priority (highest to lowest):
  1. User manual flag (right-click block/safe) → absolute, never overridden
  2. Haiku cloud result → authoritative
  3. KNN confident match (distance < 0.4) → trusted
  4. Local trainable classifier (if trained, confidence > 0.8) → trusted
  5. Local face-api.js gender detection → baseline
  6. COCO-SSD person-no-face → strict mode hide

If ANY layer says HIDE and no higher-priority layer says SHOW → HIDE.
If layers conflict, the higher-priority layer wins.
```

### API Implementation

1. **Add API key storage**. The user enters their Anthropic API key in the popup settings. Store it in `browser.storage.local`:
   ```javascript
   // In popup — add a settings section
   // Input field for API key, saved on change
   await browser.storage.local.set({ anthropicApiKey: key });
   ```

2. **Create the API call function in background.js**:
   ```javascript
   async function classifyWithHaiku(imageDataUrl) {
     const { anthropicApiKey } = await browser.storage.local.get("anthropicApiKey");
     if (!anthropicApiKey) return null; // No API key, skip cloud

     // Resize image to 512px max before sending (saves tokens/cost)
     const resizedDataUrl = await resizeImageDataUrl(imageDataUrl, 512);

     // Extract base64 data and media type
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
         },
         body: JSON.stringify({
           model: "claude-haiku-4-5-20251001",
           max_tokens: 50,
           messages: [{
             role: "user",
             content: [
               {
                 type: "image",
                 source: {
                   type: "base64",
                   media_type: mediaType,
                   data: base64Data,
                 },
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
         return null; // API error — fall back to local ML
       }

       const data = await response.json();
       const answer = data.content?.[0]?.text?.trim().toUpperCase();

       return {
         containsWomen: answer === "YES" || answer?.startsWith("YES"),
         source: "haiku",
         raw: answer,
       };
     } catch (err) {
       console.warn("[Shmirat Eynaim] Haiku API call failed:", err);
       return null; // Network error — fall back to local ML
     }
   }
   ```

3. **Resize helper** to keep tokens low:
   ```javascript
   async function resizeImageDataUrl(dataUrl, maxDim) {
     const response = await fetch(dataUrl);
     const blob = await response.blob();
     const bitmap = await createImageBitmap(blob);

     let { width, height } = bitmap;
     if (width <= maxDim && height <= maxDim) {
       bitmap.close();
       return dataUrl; // Already small enough
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
   ```

### Feeding Haiku Results into the Learning System

4. **After every Haiku classification**, feed the result into the existing learning layers. Add this to the analysis pipeline:

   ```javascript
   async function processHaikuResult(imageDataUrl, haikuResult, localDetections) {
     if (!haikuResult) return; // API was unavailable

     const shouldBlock = haikuResult.containsWomen;

     // Layer 1: Cache the URL result (same as URL blocklist)
     // Use the image URL (not data URL) as key if available
     addToCloudCache(imageUrl, shouldBlock);

     // Layer 2: Feed face descriptors into KNN
     // Only if local ML detected faces in this image
     if (localDetections && localDetections.length > 0) {
       for (const det of localDetections) {
         if (det.descriptor) {
           // Store descriptor with label from Haiku
           // "block" if Haiku says woman, "safe" if Haiku says no woman
           const label = shouldBlock ? "block" : "safe";
           await addToKnnDatabase(det.descriptor, label, "haiku");
         }
       }
     }

     // Layer 3: Feed into trainable classifier training set
     // Only add to training data — don't retrain on every image
     if (localDetections && localDetections.length > 0) {
       for (const det of localDetections) {
         if (det.descriptor) {
           await addTrainingExample(det.descriptor, shouldBlock, "haiku");
         }
       }
       // Retrain periodically (every 20 new examples)
       const count = await getTrainingExampleCount();
       if (count % 20 === 0 && count >= 10) {
         await retrainClassifier();
       }
     }
   }
   ```

5. **Differentiate user flags from Haiku flags** in the KNN/training databases. Add a `source` field:
   ```javascript
   // Example stored descriptor
   {
     descriptor: Float32Array(128),
     label: "block",        // or "safe"
     source: "user",        // or "haiku"
     confidence: 1.0,       // user = 1.0, haiku = 0.9
     timestamp: Date.now(),
   }
   ```

   When doing KNN matching, weight user-flagged examples higher:
   ```javascript
   function knnMatch(queryDescriptor, database) {
     const matches = database.map(entry => {
       const distance = euclideanDistance(queryDescriptor, entry.descriptor);
       // User flags get a distance bonus (effectively closer match)
       const adjustedDistance = entry.source === "user"
         ? distance * 0.8
         : distance;
       return { ...entry, distance: adjustedDistance };
     });
     matches.sort((a, b) => a.distance - b.distance);
     return matches[0]; // Nearest neighbor
   }
   ```

### Reducing API Calls as the System Learns

6. **Skip the Haiku API call when local systems are confident**. After the local learning layers have accumulated enough data, they can handle most images without cloud help:

   ```javascript
   async function shouldCallHaiku(localResult, knnResult, classifierResult) {
     // Always call Haiku if no local result at all
     if (!localResult && !knnResult && !classifierResult) return true;

     // Skip Haiku if user manually flagged this exact URL
     if (localResult?.source === "user") return false;

     // Skip Haiku if KNN is very confident (distance < 0.3)
     if (knnResult && knnResult.distance < 0.3) return false;

     // Skip Haiku if trainable classifier is very confident (> 0.9)
     if (classifierResult && classifierResult.confidence > 0.9) return false;

     // Skip Haiku if we already have a cached cloud result for this URL
     if (await getCloudCache(imageUrl)) return false;

     // Otherwise, call Haiku
     return true;
   }
   ```

   This means on day 1 you call Haiku for everything. After a week of browsing, the local system handles most images and Haiku only gets called for genuinely new/uncertain cases. This naturally reduces cost over time.

7. **Add a setting to control cloud usage**. In the popup settings:
   ```
   Cloud Classification:
   [x] Send all images (most strict)
   [ ] Send only uncertain images (balanced)
   [ ] Never send images (local only)
   ```
   Default to "send all images" as the user requested. Store in `browser.storage.local`.

### Parallel Execution Flow

8. **Run local ML and Haiku in parallel**, not sequentially. Show the result from whichever finishes first, then update if the other disagrees:

   ```javascript
   async function analyzeImage(imageElement, imageDataUrl, imageUrl) {
     // Check instant caches first
     const cachedResult = await checkAllCaches(imageUrl);
     if (cachedResult) return cachedResult;

     // Run local and cloud in parallel
     const [localResult, haikuResult] = await Promise.allSettled([
       analyzeLocally(imageDataUrl),     // face-api + COCO-SSD + KNN + classifier
       classifyWithHaiku(imageDataUrl),  // cloud API
     ]);

     const local = localResult.status === "fulfilled" ? localResult.value : null;
     const cloud = haikuResult.status === "fulfilled" ? haikuResult.value : null;

     // Decide: cloud wins over local when available
     let finalDecision;
     if (cloud) {
       finalDecision = cloud.containsWomen;
       // Feed cloud result into learning system
       await processHaikuResult(imageDataUrl, cloud, local?.detections);
     } else {
       // Cloud unavailable — use local result
       finalDecision = local?.containsWomen ?? true; // strict: hide if no result
     }

     // Cache the final decision by URL
     await cacheDecision(imageUrl, finalDecision);

     return { containsWomen: finalDecision };
   }
   ```

### Rate Limiting and Batching

9. **Rate limit API calls** to avoid burning through quota:
   ```javascript
   const API_RATE_LIMIT = 10; // max concurrent Haiku calls
   let activeApiCalls = 0;
   const apiQueue = [];

   async function rateLimitedHaikuCall(imageDataUrl) {
     if (activeApiCalls >= API_RATE_LIMIT) {
       await new Promise(resolve => apiQueue.push(resolve));
     }
     activeApiCalls++;
     try {
       return await classifyWithHaiku(imageDataUrl);
     } finally {
       activeApiCalls--;
       if (apiQueue.length > 0) {
         const next = apiQueue.shift();
         next();
       }
     }
   }
   ```

10. **Track API usage** and show it in the popup:
    ```
    Cloud API: 47 calls today (~$0.09)
    Local matches: 312 (saved ~$0.62)
    ```
    Store daily call count in `browser.storage.local` with a date key.

### Popup Changes

11. **Add to popup UI**:
    - Settings section with API key input (masked like a password field)
    - Cloud usage toggle (all / uncertain / never)
    - Daily API call count and estimated cost
    - Count of locally learned examples
    - "Export learning data" / "Import learning data" buttons (these already exist from the learning system — make sure they include cloud cache data too)

### Strict Mode Consistency

12. **When Haiku is unavailable** (no API key, network error, rate limit), fall back to local ML only. Local ML follows the same strict mode rules as before — uncertain means hide.

13. **When Haiku says SAFE but local says BLOCK**: Haiku wins (it's more accurate). The only exception is user manual flags — those always win.

14. **When Haiku says BLOCK but local says SAFE**: Hide it. Haiku caught something local missed. Feed the face descriptors as "block" examples so local learns.

### CSP and Permissions

15. **The extension already has `<all_urls>` permission**, which covers the Anthropic API domain. No manifest changes needed for the fetch call.

16. **The API key must never be logged** to the console or exposed in content scripts. Keep it in background.js only. Content scripts send image data to background, background calls the API.

### Testing

Add test for cloud integration:
```javascript
test("Haiku API classification (requires API key)", async () => {
  // This test only runs if ANTHROPIC_API_KEY env var is set
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    test.skip();
    return;
  }
  // Set API key in extension storage, load test page, verify results
});

test("falls back to local ML when API key missing", async () => {
  // Verify extension works without API key configured
  // Images should still be classified by local ML
});

test("cloud cache prevents duplicate API calls", async () => {
  // Load same image twice, verify only one API call made
});

test("learning from Haiku results reduces future API calls", async () => {
  // Load page with faces, let Haiku classify
  // Load similar page, verify KNN matches skip API
});
```

### Expected Cost Profile

- Day 1: ~100% images go to Haiku (~$6/day for heavy browsing)
- Week 1: ~50% go to Haiku (KNN and cache handle repeat patterns)
- Month 1: ~10-20% go to Haiku (classifier handles most cases)
- Steady state: only genuinely novel images go to Haiku

## Multi-Agent Collaboration

Read and follow the instructions in CLAUDE_COLLAB.md for multi-agent coordination.
