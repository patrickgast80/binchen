/**
 * BIL-2522 — before/after evidence for the relief alpha fix.
 *
 * Renders the fabric layer over the base photo twice — once through the relief
 * map as it was before the fix (handed in as a directory of files, normally
 * extracted with `git show`), once through the current one — and writes a sheet
 * per Konfigurator:
 *
 *   [ before | after | difference, amplified x12 ]
 *
 * The crop is CHOSEN BY THE DIFFERENCE, not by eye: the window with the densest
 * concentration of changed pixels. Picking the crop by hand is how a diff sheet
 * ends up proving the one spot that happened to look good.
 *
 * The relief map is fed in as a buffer and the shipped `paintReliefZone` does
 * the rest, so nothing under public/ is touched. An earlier version swapped the
 * file in place to reuse the asset loader and hit EPERM against the next-server
 * another agent had running off the same checkout — with the swapped-in file
 * left behind. Evidence must never be able to damage what it measures.
 *
 *   node scripts/bil2522-relief-alpha-evidence.mjs --before .tmp/bil2522/before
 */
import sharp from "sharp";
import path from "node:path";
import { mkdir } from "node:fs/promises";

import { KONFIGS } from "./bil2509-composite.mjs";
import { loadTile } from "./bil2522-render.mjs";
import {
  grainFor,
  paintReliefZone,
  tilePx,
} from "../src/app/konfigurator/_shared/relief-math.mjs";

/** Dense print — the hardest case for a warped resample, so the honest one. */
const FABRIC = "stoff-15";
const CROP = 260;
const AMP = 12;

const loadRGBA = async (f) => {
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height };
};

/** Paint every fabric-capable zone, then composite over the flattened photo. */
function composite(base, layer, W, H) {
  const out = Buffer.alloc(W * H * 3, 255);
  for (let p = 0; p < W * H; p++) {
    const ba = base[p * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) out[p * 3 + c] = Math.round(255 * (1 - ba) + base[p * 4 + c] * ba);
    const a = layer[p * 4 + 3] / 255;
    if (a <= 0) continue;
    for (let c = 0; c < 3; c++) {
      out[p * 3 + c] = Math.round(out[p * 3 + c] * (1 - a) + layer[p * 4 + c] * a);
    }
  }
  return out;
}

/** Window with the most changed pixels — the diff picks the crop, not taste. */
function hottestWindow(a, b, W, H, size) {
  const cell = 20;
  const cw = Math.ceil(W / cell), ch = Math.ceil(H / cell);
  const grid = new Float64Array(cw * ch);
  for (let p = 0; p < W * H; p++) {
    let e = 0;
    for (let c = 0; c < 3; c++) e = Math.max(e, Math.abs(a[p * 3 + c] - b[p * 3 + c]));
    if (e < 2) continue;
    grid[((((p / W) | 0) / cell) | 0) * cw + (((p % W) / cell) | 0)] += e;
  }
  const span = Math.max(1, Math.round(size / cell));
  let best = -1, bx = 0, by = 0;
  for (let gy = 0; gy + span <= ch; gy++) {
    for (let gx = 0; gx + span <= cw; gx++) {
      let s = 0;
      for (let y = gy; y < gy + span; y++) for (let x = gx; x < gx + span; x++) s += grid[y * cw + x];
      if (s > best) { best = s; bx = gx * cell; by = gy * cell; }
    }
  }
  return { left: Math.min(Math.max(0, bx), Math.max(0, W - size)), top: Math.min(Math.max(0, by), Math.max(0, H - size)) };
}

const argv = process.argv.slice(2);
const beforeDir = argv[argv.indexOf("--before") + 1];
const outDir = ".tmp/bil2522/alpha-evidence";
await mkdir(outDir, { recursive: true });

for (const konfigId of ["hose", "hose-kurz", "muetze", "turban", "dreieckstuch"]) {
  const k = KONFIGS[konfigId];
  const dir = path.join("public/konfigurator", k.dir);
  const base = await loadRGBA(path.join(dir, "base.webp"));
  const { W, H } = base;

  const zones = [];
  for (const zone of k.zones) {
    let m;
    try {
      m = await loadRGBA(path.join(dir, `mask-${zone}.webp`));
    } catch {
      continue;
    }
    const alpha = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p++) alpha[p] = m.data[p * 4 + 3];
    const grain = grainFor(zone);
    zones.push({ alpha, grain, tile: await loadTile(FABRIC, 0, tilePx(W, grain)) });
  }

  const paint = async (reliefFile) => {
    const relief = await loadRGBA(reliefFile);
    const layer = new Uint8ClampedArray(W * H * 4);
    for (const z of zones) paintReliefZone(layer, relief.data, z.alpha, z.tile, W, H, z.grain);
    return composite(base.data, layer, W, H);
  };

  const before = await paint(path.join(beforeDir, `${konfigId}-relief.webp`));
  const after = await paint(path.join(dir, "relief.webp"));

  const diff = Buffer.alloc(W * H * 3);
  let changed = 0, worst = 0;
  for (let p = 0; p < W * H; p++) {
    let e = 0;
    for (let c = 0; c < 3; c++) e = Math.max(e, Math.abs(before[p * 3 + c] - after[p * 3 + c]));
    if (e >= 2) changed++;
    if (e > worst) worst = e;
    const v = Math.min(255, e * AMP);
    diff[p * 3] = Math.min(255, 40 + v);
    diff[p * 3 + 1] = 40 + Math.round(v * 0.15);
    diff[p * 3 + 2] = 40 + Math.round(v * 0.15);
  }

  const win = hottestWindow(before, after, W, H, CROP);
  const region = { left: win.left, top: win.top, width: Math.min(CROP, W), height: Math.min(CROP, H) };
  const pw = 460, gap = 12;
  const panels = [];
  for (const buf of [before, after, diff]) {
    panels.push(
      await sharp(buf, { raw: { width: W, height: H, channels: 3 } })
        .extract(region)
        .resize({ width: pw, kernel: "nearest" })
        .png()
        .toBuffer(),
    );
  }
  await sharp({ create: { width: pw * 3 + gap * 2, height: pw, channels: 3, background: "#FAF7F2" } })
    .composite(panels.map((b, i) => ({ input: b, left: i * (pw + gap), top: 0 })))
    .png()
    .toFile(path.join(outDir, `${konfigId}-alpha-fix.png`));

  console.log(
    `${konfigId.padEnd(13)} crop @ ${win.left},${win.top} ${CROP}px — ${changed} px changed by >=2/255 ` +
    `(${((100 * changed) / (W * H)).toFixed(2)}% of canvas), worst ${worst}/255`,
  );
}
console.log(`\nsheets in ${outDir}`);
