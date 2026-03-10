# Building Shmirat Eynaim (Idris 2)

## Prerequisites

1. **Idris 2** (v0.8.0+) with the JavaScript code generator
2. **Chez Scheme** (required by Idris 2)

### Install on Windows (MSYS2)

```bash
# Install MSYS2 from https://www.msys2.org
# Then in MSYS2 terminal:
pacman -Syu
pacman -S make mingw-w64-x86_64-gcc

# Install Chez Scheme
# Download from https://github.com/cisco/ChezScheme/releases
# Add to PATH (avoid paths with spaces)

# Install Idris 2 via pack (recommended)
bash -c "$(curl -fsSL https://raw.githubusercontent.com/stefan-hoeck/idris2-pack/main/install.bash)"
pack switch latest
```

### Install on Linux/macOS

```bash
# Install Chez Scheme
# Ubuntu: sudo apt install chezscheme
# macOS:  brew install chezscheme

# Install Idris 2 via pack
bash -c "$(curl -fsSL https://raw.githubusercontent.com/stefan-hoeck/idris2-pack/main/install.bash)"
pack switch latest
```

## Building

Each extension context is compiled separately:

```bash
# Background script
idris2 --cg javascript --directive pretty -o background-idris.js src/Extension/Background.idr

# Content script
idris2 --cg javascript --directive pretty -o content-idris.js src/Extension/Content.idr

# Popup script
idris2 --cg javascript --directive pretty -o popup-idris.js src/Extension/Popup.idr
```

## Integration with Extension

The compiled JS files replace their handwritten counterparts:

1. Copy `background-idris.js` to `shmirat-eynaim/background-idris.js`
2. Copy `content-idris.js` to `shmirat-eynaim/content-idris.js`
3. Copy `popup-idris.js` to `shmirat-eynaim/popup/popup-idris.js`

Update `background.html` to load the Idris-compiled background:
```html
<script src="lib/rxjs.umd.min.js"></script>
<script src="lib/face-api.min.js"></script>
<script src="lib/tf-global-shim.js"></script>
<script src="lib/coco-ssd.min.js"></script>
<script src="background-idris.js"></script>
```

Update `manifest.json` content scripts:
```json
"js": ["content-idris.js"]
```

Update `popup/popup.html`:
```html
<script src="popup-idris.js"></script>
```

## Architecture

```
src/
├── FFI/                    # JavaScript FFI bindings
│   ├── Core.idr            # Base types (Promise, JsArray, Float32Array, etc.)
│   ├── Browser/            # WebExtension API bindings
│   │   ├── Runtime.idr     # browser.runtime.*
│   │   ├── Storage.idr     # browser.storage.*
│   │   ├── Tabs.idr        # browser.tabs.*
│   │   ├── Menus.idr       # browser.menus.*
│   │   └── Action.idr      # browser.browserAction.*
│   ├── DOM/                # DOM API bindings
│   │   ├── Element.idr     # ★ Phantom-typed elements (Discovered/Pending/Safe/Blocked)
│   │   ├── Document.idr    # document.* queries
│   │   ├── Canvas.idr      # OffscreenCanvas, ImageData
│   │   ├── Observer.idr    # MutationObserver
│   │   └── Style.idr       # CSS class/style manipulation
│   ├── RxJS/               # RxJS Observable bindings
│   │   ├── Observable.idr  # Core Observable type, creation, subscribe
│   │   ├── Subject.idr     # Subject, ReplaySubject
│   │   └── Operators.idr   # map, filter, mergeMap, bufferTime, etc.
│   ├── ML/                 # Machine learning library bindings
│   │   ├── FaceApi.idr     # @vladmandic/face-api
│   │   └── CocoSsd.idr     # COCO-SSD person detector
│   └── Network.idr         # fetch(), Anthropic API
├── Extension/              # Extension-specific logic
│   ├── Types.idr           # ★ Domain types (ClassificationResult, Priority, ImageRef)
│   ├── Properties.idr      # ★ Type-safe CSS-JS contracts (the bug prevention)
│   ├── Background.idr      # Background entry point
│   ├── Content.idr         # Content script entry point
│   └── Popup.idr           # Popup entry point
├── ML/                     # ML algorithms (pure Idris, no FFI)
│   ├── Detection.idr       # ML inference orchestration
│   └── Learning.idr        # ★ KNN, logistic regression (pure functions)
├── Pipeline/               # Classification pipeline
│   ├── Classification.idr  # ★ RxJS multi-source pipeline
│   └── Priority.idr        # ★ Strict mode resolution (pure, testable)
└── UI/
    └── Popup.idr           # Popup re-export

★ = Key modules that demonstrate type-safe advantages
```

## Key Type Safety Features

### 1. Phantom-typed Element Lifecycle

Elements carry a type tag (`Discovered`, `Pending`, `Safe`, `Blocked`)
that tracks their state through the analysis pipeline:

```idris
-- getImageSrc ONLY accepts Discovered elements
getImageSrc : Element Discovered -> IO ImageUrl

-- markPending CONSUMES Discovered, returns Pending
markPending : Element Discovered -> IO (Element Pending)

-- This won't compile:
-- broken el = do
--   pending <- markPending el
--   getImageSrc pending  -- TYPE ERROR: Pending ≠ Discovered
```

### 2. ImageRef captures URLs at discovery time

The `discoverImage` function extracts the URL BEFORE marking pending,
and stores it in an `ImageRef` record. After that, the URL is an Idris
String — CSS cannot touch it.

### 3. Pure priority resolution

The `resolveConflict` function is pure Idris — no IO, no FFI.
It can be unit tested without a browser.

### 4. Pure ML algorithms

KNN matching, euclidean distance, logistic regression training,
and gender threshold logic are all pure functions in `ML.Learning`
and `Pipeline.Priority`.

## Testing

The pure modules can be tested without a browser:

```idris
-- Test priority resolution
test1 : resolveConflict
  (MkPResult (Safe NoFaceNoPerson) PML 0 0)
  (MkPResult (Block CloudBlock) PHaiku 0 0)
  == MkPResult (Block CloudBlock) PHaiku 0 0  -- Block wins

-- Test gender threshold
test2 : analyzeFaces [("male", 0.60)] == Block FaceDetected  -- Below threshold

-- Test euclidean distance
test3 : euclideanDistance [1.0, 0.0] [0.0, 1.0] == sqrt 2.0
```
