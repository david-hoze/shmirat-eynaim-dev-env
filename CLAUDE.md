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

## Multi-Agent Collaboration

Read and follow the instructions in CLAUDE_COLLAB.md for multi-agent coordination.
