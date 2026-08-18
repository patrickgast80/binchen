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

import { deprintByChroma } from "./lib/konfigurator-folds.mjs";

// Pinned copy, NOT public/products/ — the catalog photo was re-matted onto a
// uniform canvas after this konfigurator shipped and the background rule below
// no longer matches it. See scripts/sources/README.md.
const SRC = "scripts/sources/dreieckstuch-zoo-01.jpeg";
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

// -- 1b. De-print the base (BIL-2512) ---------------------------------------
// Like the turban and unlike hose/muetze, this base is the raw photo luminance:
// the drape is real, but so is the zoo print, and it was multiplying under every
// fabric the customer picked. `deprintByChroma` treats the motifs as missing
// data and refills them from the surrounding pink — fold luminance is untouched,
// which a blur could never promise (see lib/konfigurator-folds.mjs).
//
// One zone, and it is on the trust list: the motifs are aqua/coral/charcoal on
// a plain pink ground, i.e. far apart in chromaticity. Verified by dumping
// base.webp as a PNG and looking at it, per the BIL-2509 rule.
const zoneTuch = new Uint8Array(N);
for (let p = 0; p < N; p++) if (!isBg[p]) zoneTuch[p] = 1;
const deprint = deprintByChroma(data, W, H, isBg, [zoneTuch], {
  trustZones: [0],
  zoneNames: ["tuch"],
  // The default 0.05 is tuned for a saturated ground. This one is PALE pink, so
  // it sits close to neutral in chromaticity and the charcoal line art — the
  // leaf sprigs, stripes and dots — lands just inside 0.05 and survives the
  // de-print. Measured distribution over the garment: the ground is under 0.02,
  // motifs start around 0.037, so 0.03 is inside the gap between them.
  absFloor: 0.03,
  // Coverage is high — this is a busy print — but the ground is plainly visible
  // between the motifs, so there is real fabric to inpaint from. Set just above
  // the measured value so a denser reshoot fails the build instead of shipping
  // ghosts.
  maxPrint: 0.55,
  close: 4,
  dilate: 3,
  iterations: 420,
});
console.log("printiness — tuch:", (deprint.printiness[0] * 100).toFixed(1) + "%");

// -- 2. Compose base + single mask ------------------------------------------
const baseRGBA = Buffer.alloc(N * 4);
const maskTuch = Buffer.alloc(N);

for (let p = 0; p < N; p++) {
  if (isBg[p]) continue;
  const lum = deprint.usable[p] ? deprint.filled[p] : lumOf(p * 3);
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
