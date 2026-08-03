/**
 * BIL-2446 — preprocess dreieckstuch-zoo-01.jpeg into the Foto-Konfigurator assets.
 *
 * Outputs (all under public/konfigurator/dreieckstuch-foto/):
 *   base.webp      — desaturated Dreieckstuch on transparent bg
 *   mask-tuch.webp — alpha mask for the whole fabric (single zone)
 *
 * The Dreieckstuch has no lining — one recolourable zone is enough (unlike
 * turban/muetze which split body+bow/lining). Background is a cool studio
 * grey (b >= r, sat <= 16), fabric is warm pink (r > b) — same discriminator
 * shape as bil2444-build-turban-assets.mjs. Buttons + wooden logo tag sit
 * inside the garment silhouette and stay as small dark features in the base
 * (they aren't recoloured — the multiply-blend keeps them dark under any
 * tint, which reads as "detail" rather than needing a separate mask).
 *
 * Rerun whenever the source photo changes:
 *   cd apps/storefront && node scripts/bil2446-build-dreieckstuch-assets.mjs [--debug]
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const SRC = "public/products/dreieckstuch/dreieckstuch-zoo-01.jpeg";
const OUT_DIR = "public/konfigurator/dreieckstuch-foto";
const DEBUG = process.argv.includes("--debug");
await mkdir(OUT_DIR, { recursive: true });

const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const N = W * H;

const lumOf = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
const satOf = (i) => {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  return Math.max(r, g, b) - Math.min(r, g, b);
};

// -- 1. Background: flood fill from the borders -----------------------------
// Measured: bg is smooth cool grey (~137,140,145 … 148,153,158), sat <= 16,
// b - r >= +1. Pink fabric is (r > b, r-b in +15..+30), plus the print
// contains saturated aqua/coral motifs which have sat > 16 and don't match.
const bgCandidate = new Uint8Array(N);
for (let p = 0; p < N; p++) {
  const i = p * 3;
  const r = data[i], b = data[i + 2];
  const s = satOf(i);
  const l = lumOf(i);
  if (s <= 16 && b - r >= 1 && l > 95 && l < 200) bgCandidate[p] = 1;
}

const isBg = new Uint8Array(N);
const queue = new Int32Array(N);
let qh = 0, qt = 0;
const push = (p) => {
  if (bgCandidate[p] && !isBg[p]) {
    isBg[p] = 1;
    queue[qt++] = p;
  }
};
for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
while (qh < qt) {
  const p = queue[qh++];
  const x = p % W, y = (p / W) | 0;
  if (x > 0) push(p - 1);
  if (x < W - 1) push(p + 1);
  if (y > 0) push(p - W);
  if (y < H - 1) push(p + W);
}

// -- 2. Compose base + single mask ------------------------------------------
const baseRGBA = Buffer.alloc(N * 4);
const maskTuch = Buffer.alloc(N);

for (let p = 0; p < N; p++) {
  if (isBg[p]) continue;
  const i = p * 3;
  const lum = lumOf(i);
  const gray = Math.round(60 + (lum / 255) * 175);
  const o = p * 4;
  baseRGBA[o] = gray;
  baseRGBA[o + 1] = gray;
  baseRGBA[o + 2] = gray;
  baseRGBA[o + 3] = 255;
  maskTuch[p] = 255;
}

// -- 3. Crop to garment bbox + pad, encode ----------------------------------
let cropL = W, cropR = 0, cropT = H, cropB = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (!isBg[y * W + x]) {
      if (x < cropL) cropL = x;
      if (x > cropR) cropR = x;
      if (y < cropT) cropT = y;
      if (y > cropB) cropB = y;
    }
  }
}
const pad = Math.round(Math.max(cropR - cropL, cropB - cropT) * 0.02);
cropL = Math.max(0, cropL - pad);
cropR = Math.min(W - 1, cropR + pad);
cropT = Math.max(0, cropT - pad);
cropB = Math.min(H - 1, cropB + pad);
const cropW = cropR - cropL + 1;
const cropH = cropB - cropT + 1;
console.log("crop", { cropL, cropT, cropW, cropH });

const TARGET_W = 900;
const extract = { left: cropL, top: cropT, width: cropW, height: cropH };

await sharp(baseRGBA, { raw: { width: W, height: H, channels: 4 } })
  .extract(extract)
  .resize({ width: TARGET_W })
  .webp({ quality: 82, alphaQuality: 90 })
  .toFile(path.join(OUT_DIR, "base.webp"));

async function saveMask(buf, name) {
  const rgba = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) rgba[i * 4 + 3] = buf[i];
  await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .extract(extract)
    .resize({ width: TARGET_W })
    .webp({ quality: 60, alphaQuality: 100 })
    .toFile(path.join(OUT_DIR, name));
}
await saveMask(maskTuch, "mask-tuch.webp");

if (DEBUG) {
  const dbg = Buffer.alloc(N * 3);
  for (let p = 0; p < N; p++) {
    const i = p * 3;
    if (isBg[p]) {
      dbg[i] = data[i]; dbg[i + 1] = data[i + 1]; dbg[i + 2] = data[i + 2];
    } else {
      dbg[i] = 40; dbg[i + 1] = 80; dbg[i + 2] = 220;
    }
  }
  await sharp(dbg, { raw: { width: W, height: H, channels: 3 } })
    .resize({ width: 800 })
    .png()
    .toFile(path.join(OUT_DIR, "debug-zones.png"));
  console.log("debug zone map written");
}

const meta = await sharp(path.join(OUT_DIR, "base.webp")).metadata();
console.log("base.webp", meta.width, "x", meta.height);
