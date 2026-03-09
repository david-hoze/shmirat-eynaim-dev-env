# Prompt: Add Learning Mode to "shmirat-eynaim" Firefox Extension

The `shmirat-eynaim` Firefox extension is already built and working. It uses face-api.js (Tiny Face Detector + Gender Recognition) to detect and hide images containing women. The current implementation relies solely on the pre-trained gender model, which misses some faces.

**Your task**: Add a learning system so the user can flag missed images, and the extension gets smarter over time. Do NOT rewrite the extension from scratch — modify the existing codebase.

## Overview of the Learning System

Three layers of detection, checked in order:

1. **Built-in gender model** (already exists) — the baseline
2. **Face embedding KNN** (new) — compares new faces against user-flagged faces by similarity
3. **Custom binary classifier** (new) — a tiny trainable layer that learns from accumulated user feedback

If ANY layer says "block," the image is hidden.

## Feature 1: Right-Click Context Menu

### "Block This Image"
- Add a context menu item via `browser.contextMenus.create()` that appears on right-click over images
- Label: "��� Block — contains women"
- When clicked:
  1. Get the image URL from `info.srcUrl`
  2. Add the URL to a **manual blocklist** in `browser.storage.local` (instant block for this exact URL forever)
  3. Send the image to the background script for face extraction
  4. Extract face descriptor(s) using `faceapi.detectAllFaces(...).withFaceLandmarks().withFaceDescriptors().withAgeAndGender()`
  5. Store each face descriptor (Float32Array of 128 values) in `browser.storage.local` under a `knownFaces` array
  6. Show a badge notification on the toolbar icon: "✓ Learned" (briefly, for 2 seconds)
  7. Immediately re-scan and hide the image on the current page

### "This Image Is Safe"
- Second context menu item: "✅ Safe — no women here"
- When clicked:
  1. Add the URL to a **safe list** in `browser.storage.local`
  2. Extract face descriptors and store them in a `knownSafeFaces` array
  3. Mark the image as safe (unhide if hidden)
  4. This provides negative examples for the custom classifier

### Permissions
- Add `"contextMenus"` to the manifest permissions
- The context menu should only appear on images (`contexts: ["image"]`)

## Feature 2: Face Embedding KNN (Similarity Matching)

### How It Works
- face-api.js can compute a 128-dimensional face descriptor via `.withFaceLandmarks().withFaceDescriptors()`
- These descriptors encode facial structure — similar-looking faces have similar descriptors
- Use **Euclidean distance** to compare: if a new face's descriptor is within a threshold of any stored descriptor → block

### Integration Into the Analysis Pipeline
Modify `analyzeImageData()` in `background.js`:

```
After face detection + gender classification:
  1. (Existing) Check built-in gender model → if female, block
  2. (New) For each detected face, compute its descriptor
  3. Compare descriptor against all stored `knownFaces` descriptors
  4. If Euclidean distance < 0.5 to ANY known face → block
  5. Also compare against `knownSafeFaces` — if distance < 0.4 to a safe face → do NOT block (safe takes priority at very close matches, i.e. it's clearly the same person the user marked safe)
```

### Euclidean Distance Calculation
```javascript
function euclideanDistance(desc1, desc2) {
  let sum = 0;
  for (let i = 0; i < desc1.length; i++) {
    const diff = desc1[i] - desc2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}
```

### Storage Format
```javascript
// In browser.storage.local:
{
  knownFaces: [
    { descriptor: [0.12, -0.34, ...128 values], url: "original-image-url", timestamp: 1234567890 },
    ...
  ],
  knownSafeFaces: [
    { descriptor: [0.05, 0.22, ...128 values], url: "original-image-url", timestamp: 1234567890 },
    ...
  ],
  manualBlocklist: ["https://example.com/photo1.jpg", ...],
  manualSafelist: ["https://example.com/icon.jpg", ...]
}
```

### Performance
- Loading all stored descriptors into memory on extension startup (cache in a JS array, don't hit storage for every comparison)
- KNN comparison is fast — comparing a 128-dim vector against 1000 stored vectors takes < 1ms
- Reload the in-memory cache whenever new faces are added

### Model Loading Update
The existing model loading in `loadModels()` needs to also load the face landmark and descriptor models:
```javascript
await faceapi.nets.tinyFaceDetector.loadFromUri(modelPath);
await faceapi.nets.ageGenderNet.loadFromUri(modelPath);
// ADD THESE:
await faceapi.nets.faceLandmark68TinyNet.loadFromUri(modelPath);
await faceapi.nets.faceRecognitionNet.loadFromUri(modelPath);
```

Download and bundle the additional model weight files from face-api.js:
- `face_landmark_68_tiny_model-weights_manifest.json` + shard files
- `face_recognition_model-weights_manifest.json` + shard files

## Feature 3: Custom Binary Classifier (Trainable Layer)

### Architecture
A tiny neural network that sits on top of the 128-dim face descriptors:
- Input: 128-dimensional face descriptor
- Hidden layer: 32 neurons, ReLU activation
- Output: 1 neuron, sigmoid activation (0 = safe, 1 = block)

### Implementation Using TensorFlow.js
```javascript
// Build the model
const classifier = tf.sequential();
classifier.add(tf.layers.dense({ inputShape: [128], units: 32, activation: 'relu' }));
classifier.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
classifier.compile({ optimizer: tf.train.adam(0.001), loss: 'binaryCrossentropy', metrics: ['accuracy'] });
```

### Training Flow
- Every time the user flags an image (block or safe), the face descriptor + label is added to a training buffer
- When the buffer reaches **10+ examples** (mix of block and safe), auto-retrain:
  ```
  const xs = tf.tensor2d(descriptors);  // shape: [N, 128]
  const ys = tf.tensor2d(labels);       // shape: [N, 1], values 0 or 1
  await classifier.fit(xs, ys, { epochs: 20, batchSize: 4 });
  ```
- Training takes milliseconds (tiny model + small dataset)
- After training, save the model weights to `browser.storage.local` using `classifier.save('localstorage://shmirat-eynaim-classifier')` — or better, serialize weights to JSON and store via `browser.storage.local`
- On extension startup, check if saved weights exist and load them

### Integration Into the Analysis Pipeline
Add as a third check after KNN:

```
After face detection:
  1. Check built-in gender model
  2. Check KNN similarity
  3. (New) If custom classifier has been trained (10+ examples):
     - Run the face descriptor through the classifier
     - If output > 0.5 → block
  4. If ANY of the three says block → hide the image
```

### Retraining Trigger
- Retrain whenever a new example is added (if total examples >= 10)
- Cap training data at 500 most recent examples (FIFO) to keep storage manageable
- Show training status in the popup: "Model trained on X examples"

## Feature 4: Popup UI Updates

Modify the existing popup to add a "Learning" section:

### New UI Elements
- **Stats section** (update existing):
  - "X images scanned, Y hidden on this page"
  - "Z faces learned (A blocked, B safe)"
  - "Custom model: trained / not enough data (need X more examples)"

- **"Reset Learning" button**:
  - Clears `knownFaces`, `knownSafeFaces`, manual lists, and the custom classifier
  - Asks for confirmation first
  - Resets back to baseline gender model only

- **"Export / Import" buttons** (stretch goal):
  - Export learned faces as a JSON file (so users can share their trained data)
  - Import a JSON file to bootstrap learning from someone else's data

### Updated Layout
```
┌──────────────────────────────┐
│  Shmirat Eynaim        [ON] │
│──────────────────────────────│
│  Site: example.com           │
│  [Trust This Site]           │
│──────────────────────────────│
│  ��� This page:               │
│  Scanned: 24 | Hidden: 3    │
│──────────────────────────────│
│  ��� Learning:                │
│  Faces learned: 47 (32↓ 15↑)│
│  Custom model: Trained ✓     │
│  [Reset Learning]            │
│──────────────────────────────│
│  Trusted sites:              │
│  • mysite.com         [×]   │
│  • example.org        [×]   │
└──────────────────────────────┘
```

(↓ = blocked faces, ↑ = safe faces)

## Feature 5: Visual Feedback on Flagged Images

When the user right-clicks and flags an image:
- **If blocked**: briefly show a red border + fade out animation before hiding
- **If marked safe**: briefly show a green border + fade in

This gives satisfying visual confirmation that the action worked.

## Updated Analysis Pipeline (Complete)

```
analyzeImage(imageElement):
  1. Get image source URL
  2. Check manual blocklist → if matched, HIDE (skip everything)
  3. Check manual safelist → if matched, SHOW (skip everything)
  4. Skip if < 40x40px or SVG → SHOW
  5. Fetch image data (handle CORS via background proxy)
  6. Run face detection (Tiny Face Detector, scoreThreshold: 0.4)
  7. If no faces detected → SHOW
  8. For each face detected:
     a. Run gender classification
        - If female with genderProbability > 0.6 → flag as BLOCK
     b. Extract face descriptor (128-dim)
     c. Run KNN against knownFaces
        - If distance < 0.5 to any known blocked face → flag as BLOCK
        - BUT if distance < 0.4 to any known safe face → flag as SAFE (override)
     d. Run custom classifier (if trained)
        - If output > 0.5 → flag as BLOCK
  9. If ANY face is flagged BLOCK (and not overridden by SAFE) → HIDE image
  10. Otherwise → SHOW image
  11. Cache the result by URL
```

## Storage Considerations

- Face descriptors are 128 floats × 4 bytes = 512 bytes each. 1000 faces ≈ 500KB — well within `browser.storage.local` limits.
- The custom classifier weights are tiny (128×32 + 32 + 32×1 + 1 = 4,129 parameters ≈ 16KB)
- Training data (descriptors + labels): 500 examples × 516 bytes ≈ 250KB
- Total storage for learning: ~1MB max. No issues.

## Additional Model Files Needed

Download from face-api.js GitHub (`/weights/` directory) and add to the `models/` folder:
- `face_landmark_68_tiny_model-weights_manifest.json` + `face_landmark_68_tiny_model-shard1`
- `face_recognition_model-weights_manifest.json` + `face_recognition_model-shard1` + `face_recognition_model-shard2`

These are needed for the `.withFaceLandmarks()` and `.withFaceDescriptors()` calls.

## Manifest Changes

Add to permissions:
```json
"contextMenus"
```

Add to `web_accessible_resources` (if not already): all new model files.

## Quality Requirements

- Context menu should appear instantly on right-click
- Flagging an image should feel instant (hide/show immediately, learn in background)
- KNN matching should not slow down page analysis (< 1ms for 1000 comparisons)
- Custom classifier inference should be < 5ms per face
- Training should happen in background, not block the UI
- All learned data must persist across browser restarts
- Extension should work fine with 0 learned examples (falls back to gender model only)
- Export/import of learned data should produce a clean JSON file

Do not break any existing functionality. The toggle, whitelist, and baseline gender detection must continue working exactly as they do now.
