#!/usr/bin/env node
// BIL-2455 followup: normalize product photo backgrounds.
//
// What it does per input photo:
//  1) Detects and crops the decorative cream/beige photo-frame border
//     (rows/cols whose average colour is close to (238, 233, 217)).
//  2) Trims residual outer grey studio pixels down to just the garment
//     bounding box (loose padding).
//  3) Pads the trimmed garment onto a square canvas with a fixed
//     "studio grey" background (RGB 200/200/198 — soft, matches the
//     lightest existing photo backgrounds).
//  4) Writes a 1200x1200 JPEG (sRGB, quality 88) to --out.
//
// Usage:
//   node apps/storefront/scripts/bil2455-normalize-product-bg.mjs \
//     --in path/to/input.jpg --out path/to/output.jpg
//
// Or batch: pass --in as a directory; every *.jpg|*.jpeg inside is normalized
// into --out with the same filename.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const FRAME_TARGET = { r: 238, g: 233, b: 217 };
const FRAME_TOLERANCE = 22;
const CANVAS_BG = { r: 200, g: 200, b: 198 };
const CANVAS_SIZE = 1200;
const PAD_RATIO = 0.06;

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, a) => {
  if (cur.startsWith("--")) acc.push([cur.slice(2), a[i + 1]]);
  return acc;
}, []));
if (!args.in || !args.out) { console.error("--in and --out required"); process.exit(1); }

function nearFrame(r, g, b) {
  return Math.abs(r - FRAME_TARGET.r) <= FRAME_TOLERANCE
    && Math.abs(g - FRAME_TARGET.g) <= FRAME_TOLERANCE
    && Math.abs(b - FRAME_TARGET.b) <= FRAME_TOLERANCE;
}

async function findFrameCrop(pngBuf) {
  const { data, info } = await sharp(pngBuf).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const pixelAt = (x, y) => {
    const i = (y * w + x) * c;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
  };
  const rowAvg = (y) => {
    let R = 0, G = 0, B = 0;
    for (let x = 0; x < w; x++) { const p = pixelAt(x, y); R += p.r; G += p.g; B += p.b; }
    return { r: R / w, g: G / w, b: B / w };
  };
  const colAvg = (x) => {
    let R = 0, G = 0, B = 0;
    for (let y = 0; y < h; y++) { const p = pixelAt(x, y); R += p.r; G += p.g; B += p.b; }
    return { r: R / h, g: G / h, b: B / h };
  };
  let top = 0; while (top < h / 2 && nearFrame(rowAvg(top).r, rowAvg(top).g, rowAvg(top).b)) top++;
  let bottom = h - 1; while (bottom > h / 2 && nearFrame(rowAvg(bottom).r, rowAvg(bottom).g, rowAvg(bottom).b)) bottom--;
  let left = 0; while (left < w / 2 && nearFrame(colAvg(left).r, colAvg(left).g, colAvg(left).b)) left++;
  let right = w - 1; while (right > w / 2 && nearFrame(colAvg(right).r, colAvg(right).g, colAvg(right).b)) right--;
  return { left, top, width: right - left + 1, height: bottom - top + 1, orig: { w, h } };
}

async function normalizeOne(inFile, outFile) {
  // Bake EXIF orientation into a portable PNG buffer we can re-decode cheaply.
  const pngBuf = await sharp(inFile).rotate().png().toBuffer();
  const crop = await findFrameCrop(pngBuf);
  const framedBuf = await sharp(pngBuf).extract({
    left: crop.left, top: crop.top, width: crop.width, height: crop.height,
  }).png().toBuffer();
  // Sharp .trim() collapses outer near-uniform colour rows/cols using a threshold.
  const trimmed = await sharp(framedBuf).trim({ threshold: 18 }).png().toBuffer();
  const tmeta = await sharp(trimmed).metadata();
  const long = Math.max(tmeta.width, tmeta.height);
  const pad = Math.round(long * PAD_RATIO);
  const canvasInner = long + pad * 2;
  const scale = CANVAS_SIZE / canvasInner;
  const targetW = Math.round(tmeta.width * scale);
  const targetH = Math.round(tmeta.height * scale);
  const resized = await sharp(trimmed).resize({ width: targetW, height: targetH, fit: "inside" }).toBuffer();
  await sharp({
    create: {
      width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 3,
      background: CANVAS_BG,
    },
  }).composite([{
    input: resized,
    gravity: "center",
  }]).jpeg({ quality: 88, chromaSubsampling: "4:4:4" }).toFile(outFile);
  console.log(`normalized: ${path.basename(inFile)} -> ${path.basename(outFile)} (frame crop ${crop.width}x${crop.height} of ${crop.orig.w}x${crop.orig.h})`);
}

const inStat = fs.statSync(args.in);
if (inStat.isDirectory()) {
  fs.mkdirSync(args.out, { recursive: true });
  const files = fs.readdirSync(args.in).filter((f) => /\.jpe?g$/i.test(f));
  for (const f of files) {
    try { await normalizeOne(path.join(args.in, f), path.join(args.out, f)); }
    catch (e) { console.error(`FAIL ${f}: ${e.message}`); }
  }
} else {
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  await normalizeOne(args.in, args.out);
}
