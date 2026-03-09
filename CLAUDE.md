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
