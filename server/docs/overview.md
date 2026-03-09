# Overview

## Purpose

The Shmirat Eynaim server is a shared learning backend that allows multiple browser extension instances to pool their image classification knowledge. When one user's extension classifies an image (via local ML or Claude Haiku), the result is shared with all users so the same image doesn't need to be classified again.

## How It Fits

```
Extension Instance A                 Extension Instance B
       │                                    │
       ├─ Local ML (face-api + COCO-SSD)    ├─ Local ML
       ├─ Claude Haiku (cloud API)          ├─ Claude Haiku
       ├─ Local learning (KNN + classifier) ├─ Local learning
       │                                    │
       └────────── Shared Server ───────────┘
                       │
                  ┌────┴────┐
                  │ SQLite  │
                  │ DB      │
                  └─────────┘
```

The server sits alongside — not in place of — the extension's existing classification pipeline. It adds a shared layer:

1. **Before local ML runs**: Check if the server already has a classification for this image hash. If yes, use it immediately (skip local ML and Haiku).
2. **After classification**: Push the result to the server so other users benefit.
3. **Face descriptors**: Share learned face descriptors so new users start with a pre-trained knowledge base instead of from zero.

## Design Principles

**Single binary, zero dependencies.** The server compiles to one executable with SQLite embedded. No runtime, no container, no package manager. Copy the binary to a machine and run it.

**Trust model: consensus.** No single user's classification is authoritative. The server tracks vote counts (block vs safe) per image hash. Clients should require a minimum vote threshold before trusting a shared result.

**Privacy-preserving.** The server never sees actual images. It receives only:
- Perceptual hashes of images (not URLs, not image data)
- Classification results (boolean: contains women or not)
- Face descriptor vectors (128-dimensional numerical arrays)

**Graceful degradation.** The extension works fully without the server. The server is purely additive — if it's down, unreachable, or the user has no account, everything falls back to local ML + Haiku.

**Zero configuration.** Users don't need to create accounts or enter tokens. The extension auto-registers with the server on first startup, receiving a token that is persisted locally. The server URL is hardcoded in the extension.

**Cost reduction.** The primary economic benefit is reducing Claude Haiku API calls. If 100 users browse similar sites, only the first user pays for Haiku classification of each image. The other 99 get the result from the shared cache for free.
