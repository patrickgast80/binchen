/**
 * BIL-2444 — preprocess turban-rosen-01.jpeg into the Foto-Konfigurator assets.
 *
 * Outputs (all under public/konfigurator/turban-foto/):
 *   base.webp          — desaturated turban on transparent bg
 *   mask-turban.webp   — alpha mask for the patterned main fabric
 *   mask-schleife.webp — alpha mask for the solid bow
 *
 * Unlike the hose (Y-slab zones), the bow is segmented by COLOUR: it is the
 * only large solid dark-purple region, while the body is a light floral print.
 * Small dark rose centres share the bow's colour, so after the colour rule we
 * keep only the largest connected component and hole-fill it.
 *
 * Background is the studio grey — removed via border flood-fill through
 * low-saturation grey pixels, which also hole-fills the garment for free.
 *
 * Rerun whenever the source photo changes:
 *   cd apps/storefront && node scripts/bil2444-build-turban-assets.mjs
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const SRC = "public/products/turban/turban-rosen-01.jpeg";
const OUT_DIR = "public/konfigurator/turban-foto";
const DEBUG = process.argv.includes("--debug");
await mkdir(OUT_DIR, { recursive: true });

const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const N = W * H;
const idx = (x, y) => (y * W + x) * 3;

const lumOf = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
const satOf = (i) => {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  return Math.max(r, g, b) - Math.min(r, g, b);
};

// -- 1. Background: flood fill from the borders -----------------------------
// Measured on the source: bg is a smooth COOL grey (145,150,154 — b ≥ r),
// watermark slightly lighter, shadows darker. The garment fabric is warm
// (cream/gold floral, r > b), so requiring b ≥ r keeps shaded white fabric
// out of the fill even where its luminance overlaps the bg range.
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
// Everything not reachable from the border is garment — enclosed grey pixels
// (seam shadows, overlock thread) stay garment automatically.

// -- 2. Bow: colour rule + largest connected component ----------------------
// Bow samples: (85,37,85), (64,18,64) — r ≈ b, g much lower, lum < 60.
// Lavender roses share the hue but sit at lum ≈ 90+; dark rose centres pass
// the rule but are tiny blobs, killed by the largest-component step.
const bowCandidate = new Uint8Array(N);
for (let p = 0; p < N; p++) {
  if (isBg[p]) continue;
  const i = p * 3;
  const r = data[i], g = data[i + 1], b = data[i + 2];
  if (r - g > 22 && b - g > 18 && lumOf(i) < 78) bowCandidate[p] = 1;
}

// Connected components over bowCandidate. The knot wrap splits the bow into
// left loop / right loop / tails, so keep EVERY component above a size floor
// — rose centres are a few hundred px, real bow parts are tens of thousands.
const MIN_BOW_COMPONENT = 3000;
const label = new Int32Array(N); // 0 = unlabelled
const componentSize = [0]; // index by label
let nextLabel = 0;
for (let seed = 0; seed < N; seed++) {
  if (!bowCandidate[seed] || label[seed]) continue;
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
      if (bowCandidate[q] && !label[q]) {
        label[q] = nextLabel;
        queue[qt++] = q;
      }
    }
  }
  componentSize[nextLabel] = size;
}
const kept = componentSize
  .map((size, l) => ({ l, size }))
  .filter(({ l, size }) => l > 0 && size >= MIN_BOW_COMPONENT);
console.log(
  "bow components:", nextLabel,
  "kept:", kept.map(({ size }) => size).sort((a, b) => b - a).join(", "),
);
const keptSet = new Set(kept.map(({ l }) => l));

const isBow = new Uint8Array(N);
for (let p = 0; p < N; p++) if (keptSet.has(label[p])) isBow[p] = 1;

// Hole-fill: non-bow garment pixels not connected to the "outside garment"
// region become bow (specular highlights inside the loops). The knot wrap is
// floral fabric connected to the body above/below the bow, so it survives.
const outside = new Uint8Array(N); // garment-or-bg reachable without crossing bow
qh = qt = 0;
const pushOut = (p) => {
  if (!isBow[p] && !outside[p]) { outside[p] = 1; queue[qt++] = p; }
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
  if (!isBow[p] && !outside[p]) { isBow[p] = 1; filled++; }
}
console.log("bow hole-fill:", filled, "px");

// -- 3. Compose raw buffers -------------------------------------------------
const baseRGBA = Buffer.alloc(N * 4);
const maskTurban = Buffer.alloc(N);
const maskSchleife = Buffer.alloc(N);

for (let p = 0; p < N; p++) {
  if (isBg[p]) continue; // transparent
  const i = p * 3;
  const lum = lumOf(i);
  // Same range compression as the hose base: keeps shadow detail for the
  // multiply blend without crushing to black or washing to white.
  const gray = Math.round(60 + (lum / 255) * 175);
  const o = p * 4;
  baseRGBA[o] = gray;
  baseRGBA[o + 1] = gray;
  baseRGBA[o + 2] = gray;
  baseRGBA[o + 3] = 255;
  if (isBow[p]) maskSchleife[p] = 255;
  else maskTurban[p] = 255;
}

// The solid bow is much darker than the printed body, so identical grayscale
// mapping would leave the bow near-black under any tint. Lift the bow zone to
// the body's tonal range while preserving its own shading.
// Measure both zones' mean luminance first.
let bowSum = 0, bowN = 0, bodySum = 0, bodyN = 0;
for (let p = 0; p < N; p++) {
  if (isBg[p]) continue;
  const l = lumOf(p * 3);
  if (isBow[p]) { bowSum += l; bowN++; } else { bodySum += l; bodyN++; }
}
const bowMean = bowSum / Math.max(1, bowN);
const bodyMean = bodySum / Math.max(1, bodyN);
console.log("mean lum — bow:", bowMean.toFixed(1), "body:", bodyMean.toFixed(1));
// Gain that maps the bow's mean onto the body's mean, clamped so highlights
// don't blow out. Applied only inside the bow zone.
const gain = Math.min(3.2, bodyMean / Math.max(20, bowMean));
for (let p = 0; p < N; p++) {
  if (!isBow[p] || isBg[p]) continue;
  const o = p * 4;
  const lifted = Math.min(235, Math.round(60 + ((lumOf(p * 3) * gain) / 255) * 175));
  baseRGBA[o] = lifted;
  baseRGBA[o + 1] = lifted;
  baseRGBA[o + 2] = lifted;
}

// -- 4. Feather the bow/body boundary ---------------------------------------
// 2px linear feather: pixels adjacent to the other zone get blended alpha so
// the recolour seam doesn't ring. Cheap box pass, two iterations.
feather(maskSchleife, maskTurban);
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
await saveMask(maskTurban, "mask-turban.webp");
await saveMask(maskSchleife, "mask-schleife.webp");

if (DEBUG) {
  // Zone visual: bow red, body blue, bg original — for eyeballing only.
  const dbg = Buffer.alloc(N * 3);
  for (let p = 0; p < N; p++) {
    const i = p * 3;
    if (isBg[p]) {
      dbg[i] = data[i]; dbg[i + 1] = data[i + 1]; dbg[i + 2] = data[i + 2];
    } else if (maskSchleife[p] > 127) {
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
