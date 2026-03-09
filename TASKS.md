# Tasks — Shmirat Eynaim Development

## Status Legend
- [ ] Not started
- [~] In progress
- [x] Complete

## Phase 1: Foundation & Infrastructure
- [x] Set up project structure (manifest.json, directories)
- [x] Bundle face-api.js library in lib/
- [x] Download and bundle face-api.js model weights in models/
- [x] Generate extension icons (16, 32, 48, 128px)
- [x] Create content.css with hide/show/pending classes
- [~] Verify extension loads in Firefox via Playwright

## Phase 2: Core ML Pipeline
- [x] Implement background.js — model loading from bundled files
- [x] Implement background.js — image analysis (face detection + gender classification)
- [x] Implement background.js — CORS proxy fetch for cross-origin images
- [x] Implement background.js — analysis result caching
- [x] Implement background.js — state management (toggle, whitelist)
- [~] Verify models load without errors in extension context

## Phase 3: Content Script
- [x] Implement content.js — image discovery (img, video poster, background-image)
- [x] Implement content.js — skip logic (icons, SVGs, small images, favicons)
- [x] Implement content.js — MutationObserver for dynamic content
- [x] Implement content.js — analysis queue with concurrency limit
- [x] Implement content.js — hide/show logic with CSS classes
- [x] Implement content.js — "start hidden, fade in if safe" behavior
- [x] Implement content.js — stats tracking (scanned, hidden counts)
- [x] Implement content.js — messaging to/from background script

## Phase 4: Popup UI
- [x] Create popup.html — layout, toggle, whitelist, stats
- [x] Create popup.css — dark theme, clean design
- [x] Create popup.js — toggle, whitelist add/remove, stats display
- [x] Verify popup opens and displays correct state

## Phase 5: Testing & Verification
- [x] All extension loading tests pass
- [x] Icon/SVG passthrough tests pass
- [x] Safe image passthrough tests pass
- [~] Female face detection tests pass (images hidden)
- [ ] Strict mode tests pass (ambiguous images hidden)
- [ ] Toggle and whitelist tests pass
- [ ] Performance tests pass (<30 images = no noticeable delay)
- [ ] Edge case tests pass (bg images, lazy-load, data URIs)
- [ ] Visual screenshot review passes

## Phase 6: Polish & Package
- [ ] No console errors on any test page
- [ ] No image flash before hiding
- [ ] Graceful model loading failure (hide all on failure)
- [ ] Clean up code comments
- [ ] Package into shmirat-eynaim.zip
- [ ] Write final testing instructions

## EXIT CRITERIA
All Phase 1-6 tasks complete AND all Playwright tests pass.
When done, set EXIT_SIGNAL: true in your response.
