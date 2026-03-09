// generate-icons.js — Creates PNG icons for the extension
// Uses raw PNG encoding (no dependencies needed)

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function createPNG(size) {
  // Create an RGBA image buffer
  const pixels = Buffer.alloc(size * size * 4, 0);

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.4;
  const border = Math.max(1, size * 0.08);
  const lineW = Math.max(1, size * 0.07);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Mountain/image icon in center
      const iconR = r * 0.55;
      const iconLeft = cx - iconR;
      const iconRight = cx + iconR;
      const iconTop = cy - iconR * 0.7;
      const iconBot = cy + iconR * 0.7;
      const inIcon =
        x >= iconLeft && x <= iconRight && y >= iconTop && y <= iconBot;

      // Small "mountain" triangle inside the icon area
      const triBaseY = iconBot - 2;
      const triTopY = iconTop + iconR * 0.4;
      const triCx = cx;
      const triHalf = iconR * 0.6;
      const triProgress = (y - triTopY) / (triBaseY - triTopY);
      const inTriangle =
        y >= triTopY &&
        y <= triBaseY &&
        x >= triCx - triHalf * triProgress &&
        x <= triCx + triHalf * triProgress;

      // Small "sun" circle
      const sunCx = cx + iconR * 0.35;
      const sunCy = cy - iconR * 0.3;
      const sunR = iconR * 0.18;
      const sunDist = Math.sqrt((x - sunCx) ** 2 + (y - sunCy) ** 2);
      const inSun = sunDist <= sunR;

      // Diagonal red strike-through line
      const lineDistFromDiag =
        Math.abs(dx + dy) / Math.sqrt(2);
      const onLine = lineDistFromDiag <= lineW && dist <= r + border / 2;

      // Red circle border
      const onCircle =
        dist >= r - border / 2 && dist <= r + border / 2;

      if (onLine || onCircle) {
        // Red
        pixels[idx] = 220;
        pixels[idx + 1] = 50;
        pixels[idx + 2] = 50;
        pixels[idx + 3] = 255;
      } else if (dist <= r - border / 2) {
        if (inSun) {
          // Yellow sun
          pixels[idx] = 255;
          pixels[idx + 1] = 200;
          pixels[idx + 2] = 50;
          pixels[idx + 3] = 255;
        } else if (inTriangle) {
          // Dark green mountain
          pixels[idx] = 60;
          pixels[idx + 1] = 140;
          pixels[idx + 2] = 80;
          pixels[idx + 3] = 255;
        } else if (inIcon) {
          // Light gray icon background
          pixels[idx] = 200;
          pixels[idx + 1] = 200;
          pixels[idx + 2] = 210;
          pixels[idx + 3] = 255;
        } else {
          // Transparent inside circle
          pixels[idx + 3] = 0;
        }
      }
      // else: transparent (outside circle)
    }
  }

  return encodePNG(size, size, pixels);
}

function encodePNG(width, height, rgbaBuffer) {
  // Build raw image data with filter byte (0 = None) per row
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    rawData[rowOffset] = 0; // filter: None
    rgbaBuffer.copy(
      rawData,
      rowOffset + 1,
      y * width * 4,
      (y + 1) * width * 4
    );
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = makeChunk("IHDR", ihdr);

  // IDAT chunk
  const idatChunk = makeChunk("IDAT", compressed);

  // IEND chunk
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC32 for PNG
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Generate icons
const iconsDir = path.join(__dirname, "icons");
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir);
}

for (const size of [16, 32, 48, 128]) {
  const png = createPNG(size);
  fs.writeFileSync(path.join(iconsDir, `icon-${size}.png`), png);
  console.log(`Created icon-${size}.png (${png.length} bytes)`);
}

console.log("Done!");
