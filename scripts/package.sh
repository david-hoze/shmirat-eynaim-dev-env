#!/bin/bash
# Package the extension into a .zip file for distribution
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
EXT_DIR="$PROJECT_DIR/shmirat-eynaim"
OUTPUT="$PROJECT_DIR/shmirat-eynaim.zip"

# Remove old package if it exists
rm -f "$OUTPUT"

cd "$EXT_DIR"
zip -r "$OUTPUT" \
  manifest.json \
  background.html \
  background.js \
  content.js \
  content.css \
  popup/ \
  icons/ \
  models/ \
  lib/ \
  -x "*.DS_Store" -x "__MACOSX/*"

echo "Packaged extension: $OUTPUT"
echo "Size: $(du -h "$OUTPUT" | cut -f1)"
