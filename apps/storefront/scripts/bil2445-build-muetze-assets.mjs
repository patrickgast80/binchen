/**
 * BIL-2445 — preprocess muetze-boho-mint-01.jpeg into the Foto-Konfigurator assets.
 *
 * Outputs (all under public/konfigurator/muetze-foto/):
 *   base.webp        — desaturated Mütze on transparent bg
 *   mask-muetze.webp — alpha mask for the patterned main fabric (mint boho print)
 *   mask-futter.webp — alpha mask for the solid altrosa lining (folded out on the left)
 *
 * Like the turban bow, the lining is segmented by COLOUR: it is the only large
 * solid dusty-pink region (r ≫ g). The boho print contains pink rainbow motifs
 * that pass the same colour rule, but they are small isolated blobs — so here
 * we keep only the LARGEST connected component (the lining is one contiguous
 * crescent), then hole-fill it.
 *
 * Background is the studio grey — removed via border flood-fill through
 * low-saturation neutral pixels. The mint fabric always has g > r (measured
 * g−r ≥ 9 even in shadow), the bg is neutral (g−r ≤ 6), which is the
 * discriminator that keeps shaded fabric out of the fill.
 *
 * Rerun whenever the source photo changes:
 *   cd apps/storefront && node scripts/bil2445-build-muetze-assets.mjs [--debug]
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const SRC = "public/products/muetze/muetze-boho-mint-01.jpeg";
const OUT_DIR = "public/konfigurator/muetze-foto";
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
// Measured: bg is smooth neutral grey (165,167,166)…(168,174,174), sat ≤ 8,
// lum 150–185 with vignette. Mint fabric is greenish (g − r ≥ 9) or clearly
// saturated; lining is pink (r ≫ g) — both fail the neutral rule.
const bgCandidate = new Uint8Array(N);
for (let p = 0; p < N; p++) {
  const i = p * 3;
  const r = data[i], g = data[i + 1];
  const s = satOf(i);
  const l = lumOf(i);
  if (s <= 8 && g - r >= -3 && g - r <= 6 && l > 125 && l < 215) bgCandidate[p] = 1;
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
// Everything not reachable from the border is garment — enclosed neutral
// pixels (white stars in the print, seam shadows) stay garment automatically.

// -- 2. Lining: colour rule + largest connected component -------------------
// Lining samples: (199,134,138), (170,104,108) — r−g ≈ 65, r−b ≈ 60.
// Pink rainbow motifs in the print reach r−g ≈ 52 but are isolated blobs;
// the lining is one big crescent, so keep ONLY the largest component.
const futterCandidate = new Uint8Array(N);
for (let p = 0; p < N; p++) {
  if (isBg[p]) continue;
  const i = p * 3;
  const r = data[i], g = data[i + 1], b = data[i + 2];
  if (r - g > 30 && r - b > 20) futterCandidate[p] = 1;
}

const label = new Int32Array(N); // 0 = unlabelled
let nextLabel = 0;
let bestLabel = 0, bestSize = 0;
for (let seed = 0; seed < N; seed++) {
  if (!futterCandidate[seed] || label[seed]) continue;
  nextLabel++;
  let size = 0;
  qh = qt = 0;
  label[seed] = nextLabel;
  queue[qt++] = seed;
  while (qh < qt) {
    const p = queue[qh++];
    size++;
    const x = p % W, y = (p / W) | 0;
    const nb = [];
    if (x > 0) nb.push(p - 1);
    if (x < W - 1) nb.push(p + 1);
    if (y > 0) nb.push(p - W);
    if (y < H - 1) nb.push(p + W);
    for (const q of nb) {
      if (futterCandidate[q] && !label[q]) {
        label[q] = nextLabel;
        queue[qt++] = q;
      }
    }
  }
  if (size > bestSize) { bestSize = size; bestLabel = nextLabel; }
}
console.log("futter components:", nextLabel, "largest:", bestSize, "px");

const isFutter = new Uint8Array(N);
for (let p = 0; p < N; p++) if (label[p] === bestLabel) isFutter[p] = 1;

// Hole-fill: non-lining garment pixels not connected to the "outside garment"
// region become lining (fold shadows / highlights enclosed in the crescent).
const outside = new Uint8Array(N); // garment-or-bg reachable without crossing lining
qh = qt = 0;
const pushOut = (p) => {
  if (!isFutter[p] && !outside[p]) { outside[p] = 1; queue[qt++] = p; }
};
for (let x = 0; x < W; x++) { pushOut(x); pushOut((H - 1) * W + x); }
for (let y = 0; y < H; y++) { pushOut(y * W); pushOut(y * W + W - 1); }
while (qh < qt) {
  const p = queue[qh++];
  const x = p % W, y = (p / W) | 0;
  if (x > 0) pushOut(p - 1);
  if (x < W - 1) pushOut(p + 1);
  if (y > 0) pushOut(p - W);
  if (y < H - 1) pushOut(p + W);
}
let filled = 0;
for (let p = 0; p < N; p++) {
  if (!isFutter[p] && !outside[p]) { isFutter[p] = 1; filled++; }
}
console.log("futter hole-fill:", filled, "px");

// -- 3. Compose raw buffers -------------------------------------------------
const baseRGBA = Buffer.alloc(N * 4);
const maskMuetze = Buffer.alloc(N);
const maskFutter = Buffer.alloc(N);

for (let p = 0; p < N; p++) {
  if (isBg[p]) continue; // transparent
  const i = p * 3;
  const lum = lumOf(i);
  // Same range compression as hose/turban: keeps shadow detail for the
  // multiply blend without crushing to black or washing to white.
  const gray = Math.round(60 + (lum / 255) * 175);
  const o = p * 4;
  baseRGBA[o] = gray;
  baseRGBA[o + 1] = gray;
  baseRGBA[o + 2] = gray;
  baseRGBA[o + 3] = 255;
  if (isFutter[p]) maskFutter[p] = 255;
  else maskMuetze[p] = 255;
}

// Equalise the two zones' tonal range so the same tint reads equally bright
// on both (the lining midtone is darker than the print). Same clamped-gain
// approach as the turban bow, applied to the lining zone.
let futterSum = 0, futterN = 0, bodySum = 0, bodyN = 0;
for (let p = 0; p < N; p++) {
  if (isBg[p]) continue;
  const l = lumOf(p * 3);
  if (isFutter[p]) { futterSum += l; futterN++; } else { bodySum += l; bodyN++; }
}
const futterMean = futterSum / Math.max(1, futterN);
const bodyMean = bodySum / Math.max(1, bodyN);
console.log("mean lum — futter:", futterMean.toFixed(1), "body:", bodyMean.toFixed(1));
const gain = Math.min(3.2, bodyMean / Math.max(20, futterMean));
for (let p = 0; p < N; p++) {
  if (!isFutter[p] || isBg[p]) continue;
  const o = p * 4;
  const lifted = Math.min(235, Math.round(60 + ((lumOf(p * 3) * gain) / 255) * 175));
  baseRGBA[o] = lifted;
  baseRGBA[o + 1] = lifted;
  baseRGBA[o + 2] = lifted;
}

// -- 4. Feather the futter/body boundary ------------------------------------
// 2px linear feather so the recolour seam doesn't ring.
feather(maskFutter, maskMuetze);
function feather(a, b) {
  for (let iter = 0; iter < 2; iter++) {
    const src = Buffer.from(a);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        if (isBg[p]) continue;
        const avg =
          (src[p] * 2 + src[p - 1] + src[p + 1] + src[p - W] + src[p + W]) / 6;
        a[p] = Math.round(avg);
        b[p] = 255 - a[p];
      }
    }
  }
}

// -- 5. Crop to garment bbox + pad, encode ----------------------------------
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
await saveMask(maskMuetze, "mask-muetze.webp");
await saveMask(maskFutter, "mask-futter.webp");

if (DEBUG) {
  // Zone visual: lining red, body blue, bg original — for eyeballing only.
  const dbg = Buffer.alloc(N * 3);
  for (let p = 0; p < N; p++) {
    const i = p * 3;
    if (isBg[p]) {
      dbg[i] = data[i]; dbg[i + 1] = data[i + 1]; dbg[i + 2] = data[i + 2];
    } else if (maskFutter[p] > 127) {
      dbg[i] = 220; dbg[i + 1] = 40; dbg[i + 2] = 40;
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

// Print output size for the component's aspect-ratio lock.
const meta = await sharp(path.join(OUT_DIR, "base.webp")).metadata();
console.log("base.webp", meta.width, "x", meta.height);
