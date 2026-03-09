#!/usr/bin/env node
// scripts/download-models.js
// Downloads face-api.js library and required model weights from GitHub

const https = require("https");
const fs = require("fs");
const path = require("path");

const EXT_DIR = path.resolve(__dirname, "../shmirat-eynaim");
const LIB_DIR = path.join(EXT_DIR, "lib");
const MODELS_DIR = path.join(EXT_DIR, "models");

// face-api.js CDN URL
const FACE_API_URL =
  "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js";

// Model weight files from face-api.js GitHub repo
const MODEL_BASE =
  "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights";

const MODEL_FILES = [
  // Tiny Face Detector
  "tiny_face_detector_model-weights_manifest.json",
  "tiny_face_detector_model-shard1",
  // Gender Recognition
  "gender_recognition_model-weights_manifest.json",
  "gender_recognition_model-shard1",
  // Age + Gender (combined model, sometimes needed)
  "age_gender_model-weights_manifest.json",
  "age_gender_model-shard1",
];

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const request = (url) => {
      https
        .get(url, (response) => {
          // Follow redirects
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            request(response.headers.location);
            return;
          }
          if (response.statusCode !== 200) {
            reject(new Error(`HTTP ${response.statusCode} for ${url}`));
            return;
          }
          response.pipe(file);
          file.on("finish", () => {
            file.close();
            resolve();
          });
        })
        .on("error", (err) => {
          fs.unlinkSync(destPath);
          reject(err);
        });
    };
    request(url);
  });
}

async function main() {
  // Create directories
  fs.mkdirSync(LIB_DIR, { recursive: true });
  fs.mkdirSync(MODELS_DIR, { recursive: true });

  // Download face-api.js
  const faceApiDest = path.join(LIB_DIR, "face-api.min.js");
  if (!fs.existsSync(faceApiDest)) {
    console.log("  Downloading face-api.min.js...");
    try {
      await download(FACE_API_URL, faceApiDest);
      console.log("  ✓ face-api.min.js downloaded");
    } catch (err) {
      console.error("  ✗ Failed to download face-api.js:", err.message);
      console.log("  → You may need to download it manually from npm/CDN");
    }
  } else {
    console.log("  ✓ face-api.min.js already exists");
  }

  // Download model weights
  for (const file of MODEL_FILES) {
    const dest = path.join(MODELS_DIR, file);
    if (!fs.existsSync(dest)) {
      const url = `${MODEL_BASE}/${file}`;
      process.stdout.write(`  Downloading ${file}...`);
      try {
        await download(url, dest);
        console.log(" ✓");
      } catch (err) {
        console.log(` ✗ (${err.message})`);
      }
    } else {
      console.log(`  ✓ ${file} already exists`);
    }
  }

  console.log("\nModel download complete.");
  console.log(`  Library: ${LIB_DIR}`);
  console.log(`  Models:  ${MODELS_DIR}`);
}

main().catch(console.error);
