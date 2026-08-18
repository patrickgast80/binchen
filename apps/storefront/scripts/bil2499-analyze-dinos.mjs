/**
 * BIL-2499 — segmentation reconnaissance for the Dinos-shorts konfigurator.
 *
 * Prints the numbers the real build script needs (orange component sizes and
 * bboxes, the label patch, the print's luminance span) instead of guessing
 * them. Throwaway diagnostics; the shipped pipeline is
 * bil2499-build-dinoshorts-assets.mjs.
 *
 *   NODE_PATH=../../.pc-tmp/sharp-env/node_modules \
 *   node scripts/bil2499-analyze-dinos.mjs
 */
import sharp from "sharp";
import path from "node:path";
import { mkdir } from "node:fs/promises";

import { checkerboardToUniformCanvas } from "./bil2490-checkerboard-normalize.mjs";

const SRC =
  "C:/Users/Besitzer/Desktop/bilulu/bilder bearbeitet/09712b22-56db-4f11-bfcf-c7d6830dfd1b.jpeg";
const OUT = ".pc-tmp/bil2499";
await mkdir(OUT, { recursive: true });

const cut = await checkerboardToUniformCanvas(SRC);
const W = cut.w;
const H = cut.h;
const N = W * H;
console.log("source", W, "x", H, "bbox", cut.bboxW, "x", cut.bboxH, "bg", (cut.bgRatio * 100).toFixed(1) + "%");

const { data } = await sharp(SRC).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });

const isBg = new Uint8Array(N);
for (let p = 0; p < N; p++) isBg[p] = cut.alpha[p] ? 0 : 1;

// --- colour stats over the garment ----------------------------------------
function hsv(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: mx === 0 ? 0 : d / mx, v: mx / 255 };
}

const hueHist = new Float64Array(36);
let garment = 0;
for (let p = 0; p < N; p++) {
  if (isBg[p]) continue;
  garment++;
  const i = p * 3;
  const { h, s } = hsv(data[i], data[i + 1], data[i + 2]);
  if (s > 0.25) hueHist[Math.floor(h / 10) % 36]++;
}
console.log("garment px", garment);
console.log("hue histogram (10deg buckets, sat>0.25):");
for (let b = 0; b < 36; b++) {
  if (hueHist[b] > garment * 0.005) {
    console.log(`  ${String(b * 10).padStart(3)}-${b * 10 + 9}: ${(hueHist[b] / garment * 100).toFixed(1)}%`);
  }
}

// --- orange candidate + connected components -------------------------------
function isOrange(r, g, b) {
  const { h, s, v } = hsv(r, g, b);
  return h >= 8 && h <= 45 && s > 0.55 && v > 0.45;
}

const orange = new Uint8Array(N);
for (let p = 0; p < N; p++) {
  if (isBg[p]) continue;
  const i = p * 3;
  if (isOrange(data[i], data[i + 1], data[i + 2])) orange[p] = 1;
}

function components(mask) {
  const comp = new Int32Array(N).fill(-1);
  const out = [];
  const stack = new Int32Array(N);
  for (let start = 0; start < N; start++) {
    if (!mask[start] || comp[start] >= 0) continue;
    const id = out.length;
    let sp = 0;
    stack[sp++] = start;
    comp[start] = id;
    let size = 0, minX = W, maxX = -1, minY = H, maxY = -1, sumY = 0;
    while (sp > 0) {
      const p = stack[--sp];
      size++;
      const x = p % W, y = (p - x) / W;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      sumY += y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const q = yy * W + xx;
          if (!mask[q] || comp[q] >= 0) continue;
          comp[q] = id;
          stack[sp++] = q;
        }
      }
    }
    out.push({ id, size, minX, maxX, minY, maxY, cy: sumY / size });
  }
  return { comp, list: out.sort((a, b) => b.size - a.size) };
}

const { list } = components(orange);
console.log("\norange components (top 8):");
for (const c of list.slice(0, 8)) {
  console.log(
    `  size=${String(c.size).padStart(7)} (${(c.size / garment * 100).toFixed(2)}%) ` +
      `bbox=${c.minX},${c.minY} ${c.maxX - c.minX + 1}x${c.maxY - c.minY + 1} cy=${c.cy.toFixed(0)}`,
  );
}

// --- label candidate: inside the topmost orange component's bbox ------------
const bund = list[0];
console.log("\nbund bbox", bund.minX, bund.minY, bund.maxX, bund.maxY);
const inBund = new Uint8Array(N);
for (let y = bund.minY; y <= bund.maxY; y++) {
  for (let x = bund.minX; x <= bund.maxX; x++) {
    const p = y * W + x;
    if (isBg[p] || orange[p]) continue;
    inBund[p] = 1;
  }
}
const lab = components(inBund);
console.log("non-orange components inside the bund bbox (top 6):");
for (const c of lab.list.slice(0, 6)) {
  const px = [];
  for (let y = c.minY; y <= c.maxY; y += 3) {
    for (let x = c.minX; x <= c.maxX; x += 3) {
      const p = y * W + x;
      if (!inBund[p]) continue;
      const i = p * 3;
      px.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  const avg = px.length
    ? px.reduce((a, c2) => [a[0] + c2[0], a[1] + c2[1], a[2] + c2[2]], [0, 0, 0]).map((v) => Math.round(v / px.length))
    : [0, 0, 0];
  console.log(
    `  size=${String(c.size).padStart(6)} bbox=${c.minX},${c.minY} ${c.maxX - c.minX + 1}x${c.maxY - c.minY + 1} avgRGB=${avg.join(",")}`,
  );
}

// --- debug PNGs -------------------------------------------------------------
async function dump(mask, name) {
  const rgba = Buffer.alloc(N * 4);
  for (let p = 0; p < N; p++) {
    const o = p * 4;
    const v = mask[p] ? 255 : 0;
    rgba[o] = v;
    rgba[o + 1] = v;
    rgba[o + 2] = v;
    rgba[o + 3] = 255;
  }
  await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toFile(path.join(OUT, name));
}
await dump(orange, "orange.png");
await dump(inBund, "bund-nonorange.png");
const cutout = await sharp(data, { raw: { width: W, height: H, channels: 3 } })
  .joinChannel(cut.alpha, { raw: { width: W, height: H, channels: 1 } })
  .png()
  .toBuffer();
await sharp(cutout).toFile(path.join(OUT, "cutout.png"));
console.log("\ndebug written to", OUT);
