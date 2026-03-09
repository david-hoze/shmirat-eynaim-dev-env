#!/bin/bash
# scripts/setup.sh — One-time setup for the development environment
set -euo pipefail

echo "========================================="
echo " Shmirat Eynaim Dev Environment Setup"
echo "========================================="

# 1. Install Node.js dependencies
echo ""
echo "[1/5] Installing Node.js dependencies..."
npm install

# 2. Install Playwright browsers (Firefox only)
echo ""
echo "[2/5] Installing Playwright Firefox browser..."
npx playwright install firefox
npx playwright install-deps firefox 2>/dev/null || echo "  (system deps may need manual install)"

# 3. Install web-ext (Mozilla's extension development tool)
echo ""
echo "[3/5] Installing web-ext CLI..."
npm install -g web-ext 2>/dev/null || npm install web-ext --save-dev

# 4. Create the extension directory structure if it doesn't exist
echo ""
echo "[4/5] Creating extension directory structure..."
mkdir -p shmirat-eynaim/{models,lib,popup,icons}

if [ ! -f shmirat-eynaim/manifest.json ]; then
  echo "  Creating starter manifest.json..."
  cat > shmirat-eynaim/manifest.json << 'MANIFEST'
{
  "manifest_version": 2,
  "name": "Shmirat Eynaim",
  "version": "0.1.0",
  "description": "Modesty filter: detects and hides images containing women using ML.",
  "permissions": ["<all_urls>", "storage", "tabs", "activeTab"],
  "browser_specific_settings": {
    "gecko": {
      "id": "shmirat-eynaim@example.com",
      "strict_min_version": "91.0"
    }
  },
  "background": {
    "scripts": ["lib/face-api.min.js", "background.js"]
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "css": ["content.css"],
      "run_at": "document_end",
      "all_frames": true
    }
  ],
  "browser_action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "web_accessible_resources": ["models/*", "lib/*"]
}
MANIFEST
fi

# Create stub files if they don't exist (Claude Code will fill these in)
for file in background.js content.js content.css; do
  if [ ! -f "shmirat-eynaim/$file" ]; then
    echo "  Creating stub: $file"
    echo "// TODO: Implement" > "shmirat-eynaim/$file"
  fi
done

for file in popup/popup.html popup/popup.js popup/popup.css; do
  if [ ! -f "shmirat-eynaim/$file" ]; then
    echo "  Creating stub: $file"
    echo "<!-- TODO: Implement -->" > "shmirat-eynaim/$file"
  fi
done

# 5. Download face-api.js and model weights
echo ""
echo "[5/5] Downloading face-api.js and model weights..."
node scripts/download-models.js || echo "  ⚠ Model download failed — Claude Code will handle this"

echo ""
echo "========================================="
echo " Setup complete!"
echo ""
echo " Next steps:"
echo "   1. Run 'claude' to start Claude Code"
echo "   2. It will read CLAUDE.md and TASKS.md"
echo "   3. Let it develop autonomously"
echo ""
echo " Or run autonomous loop:"
echo "   claude --dangerously-skip-permissions \\"
echo "     -p 'Read CLAUDE.md and TASKS.md, then work through all tasks autonomously. Run npm test after each change.'"
echo "========================================="
