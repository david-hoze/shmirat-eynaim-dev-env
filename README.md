# Shmirat Eynaim — Autonomous Development Environment

This is a fully autonomous development environment for the **Shmirat Eynaim** Firefox extension. It's designed so that **Claude Code** (or another AI agent) can write code, install, test, and iterate in a loop — without your intervention.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Claude Code (Agent)                 │
│  Reads CLAUDE.md → writes code → runs tests → loops │
└──────────────┬──────────────────────┬───────────────┘
               │                      │
     ┌─────────▼──────────┐  ┌───────▼────────────┐
     │  Extension Code     │  │  Playwright + FF    │
     │  shmirat-eynaim/    │  │  Headless Firefox   │
     │  ├─ background.js   │  │  with extension     │
     │  ├─ content.js      │  │  loaded via profile  │
     │  ├─ face-api.js     │  │                     │
     │  └─ models/         │  │  Screenshots ───────│──→ test-results/
     └────────────────────┘  └─────────────────────┘
```

## Prerequisites

- **Node.js** 18+ and npm
- **Claude Code** CLI (`npm install -g @anthropic-ai/claude-code`)
- An **Anthropic API key** (set as `ANTHROPIC_API_KEY` env var)

## Quick Start

### 1. Setup (one time)

```bash
cd shmirat-eynaim-dev-env
chmod +x scripts/setup.sh
bash scripts/setup.sh
```

This installs Playwright + Firefox, web-ext, face-api.js, and model weights.

### 2. Start Autonomous Development

#### Option A: Claude Code Interactive (recommended to start)
```bash
cd shmirat-eynaim-dev-env
claude
```
Claude Code will automatically read `CLAUDE.md` and start working. You can watch and occasionally steer.

#### Option B: Claude Code Fully Autonomous (headless)
```bash
cd shmirat-eynaim-dev-env
claude --dangerously-skip-permissions \
  -p "Read CLAUDE.md and TASKS.md. Work through all tasks autonomously.
      After each code change, run 'npm test' to verify.
      Update TASKS.md as you complete each task.
      Continue until all acceptance criteria pass.
      When completely done, output EXIT_SIGNAL: true."
```

#### Option C: Ralph Autonomous Loop (longest-running)
If you install [Ralph](https://github.com/frankbria/ralph-claude-code):
```bash
ralph-setup .
ralph --monitor
```
Ralph wraps Claude Code in a persistent loop with rate limiting, exit detection, and monitoring.

#### Option D: Claude Code `/loop` (built-in, up to 3 days)
```bash
claude
# Then inside Claude Code:
> /loop "Work through TASKS.md. Run npm test after each change. Stop when all tests pass."
```

## How the Testing Works

### Playwright + Firefox
The tests use Playwright's Firefox support to:
1. Launch Firefox with a custom profile containing the extension
2. Navigate to local test HTML pages (served on port 3999)
3. Wait for the ML models to process images
4. Check which images are hidden vs visible
5. Take screenshots for visual verification

### Test Commands
```bash
npm test              # Run all tests headless
npm run test:headed   # Run with visible browser
npm run test:visual   # Run visual screenshot tests
npm run test:debug    # Run with Playwright inspector
```

### Test Fixture Pages
Located in `tests/fixtures/`:
| Page | Content | Expected Behavior |
|------|---------|-------------------|
| `test-icons.html` | Icons, SVGs, tiny images | All visible |
| `test-safe-images.html` | Landscapes, objects, male portraits | All visible |
| `test-female-faces.html` | Female portrait photos | All hidden |
| `test-mixed.html` | Mix + edge cases (bg images, lazy-load) | Correct per type |

## File Structure
```
shmirat-eynaim-dev-env/
├── CLAUDE.md                  # Instructions for Claude Code agent
├── TASKS.md                   # Prioritized task list (agent updates this)
├── README.md                  # This file
├── package.json               # Dependencies
├── playwright.config.js       # Test configuration
├── shmirat-eynaim/            # ← THE EXTENSION (agent builds this)
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── content.css
│   ├── popup/
│   ├── models/
│   ├── lib/
│   └── icons/
├── tests/
│   ├── basic-loading.spec.js  # Playwright test suites
│   ├── helpers/
│   │   └── firefox-extension.js
│   └── fixtures/
│       ├── server.js          # Local test page server
│       ├── test-icons.html
│       ├── test-safe-images.html
│       ├── test-female-faces.html
│       └── test-mixed.html
├── scripts/
│   ├── setup.sh               # One-time setup
│   └── download-models.js     # Downloads face-api.js + models
└── test-results/
    ├── screenshots/           # Visual test output
    ├── html-report/           # Playwright HTML report
    └── artifacts/             # Failure traces & videos
```

## How Claude Code's Loop Works

1. **Reads** `CLAUDE.md` for project context and coding standards
2. **Reads** `TASKS.md` for the current task list
3. **Implements** the next incomplete task
4. **Runs** `npm test` to check if it works
5. **Analyzes** test output — if tests fail, reads errors and fixes
6. **Takes screenshots** periodically for visual verification
7. **Commits** after each successful test cycle
8. **Updates** `TASKS.md` to mark completed tasks
9. **Repeats** until all tasks are done

## Cost Estimate

Running Claude Code with Sonnet autonomously costs roughly **$10-15/hour**. A full build of this extension might take 2-6 hours depending on complexity, so budget **$20-90** for the complete autonomous development.

## Alternative: Computer Use (Visual Verification)

If you want Claude to also *visually inspect* the results (see what a human would see), you can combine this with **Claude Computer Use**:

```bash
# Run the Computer Use reference implementation
docker run -p 8080:8080 ghcr.io/anthropics/anthropic-quickstarts/computer-use-demo:latest

# Then have it open Firefox, load the extension, and browse test pages
```

This is more expensive and slower but gives the highest confidence in visual correctness.

## Troubleshooting

**Tests fail with "browser not found"**
→ Run `npx playwright install firefox`

**Models fail to download**
→ Check your network connection, or manually download from the face-api.js GitHub repo

**Extension doesn't load in test browser**
→ Check that `manifest.json` has valid `browser_specific_settings.gecko.id`
→ Ensure `xpinstall.signatures.required` is set to `false` in the Firefox profile

**Tests are flaky / timing-dependent**
→ Increase timeouts in `playwright.config.js` and test files
→ The ML models need time to load (~3-5s) and process images (~1-2s each)
