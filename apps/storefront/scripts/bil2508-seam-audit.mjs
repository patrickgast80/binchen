#!/usr/bin/env node
// BIL-2508 — audit every shipped Konfigurator fabric tile for a visible repeat.
//
// BIL-2497 already made all 35 tiles wrap, and the board's next photo
// (stoff-09, Pumphose, ?rot=180) still shows "Kacheln". So the seam-energy
// number alone clearly does not describe what the customer sees. This script
// measures two *different* things, because they fail independently:
//
//   1. SEAM ENERGY (BIL-2497's metric): how much louder the wrap-around edge is
//      than a normal interior edge. Catches a hard cut. Blind to a tile that
//      wraps perfectly but whose *content* repeats visibly.
//
//   2. REPEAT SALIENCE (new here): how strongly the tile auto-correlates with
//      itself at the tile period. A large-motif print (stoff-09 = rows of
//      girls' faces) tiled at 42 % of the photo width puts the *same face* on a
//      grid 2.4x across the garment. That reads as "Kacheln" even with a
//      mathematically invisible seam — which is exactly the complaint.
//
// Both are reported per fabric so the fix can be targeted instead of guessed.
//
// Usage:
//   node apps/storefront/scripts/bil2508-seam-audit.mjs [--dir public/stoffe] [--json out.json]

import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { decodeRaw, seamEnergy } from "./bil2497-seamless-lib.mjs";

const args = process.argv.slice(2);
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const DIR = resolve(arg("dir", join(ROOT, "public", "stoffe")));
const JSON_OUT = arg("json", null);

const CH = 3;

/**
 * How self-similar the tile is to a shifted copy of itself, relative to how
 * self-similar it is at a *typical* shift.
 *
 * A tile whose motif repeat happens to equal the tile size scores near 0 at
 * shift 0 mod size — trivially, since the tile wraps. What we actually want to
 * know is whether the eye can lock onto the grid, so we compare the tile to
 * itself at the half-tile diagonal (the shift that a viewer's eye uses to tell
 * "same block again" from "new fabric"): a print with rich, non-repeating
 * content differs a lot there; a print where one big motif dominates the whole
 * tile differs little, because every tile shows that same motif in the same
 * place.
 *
 * Returned as a 0..1 "salience": 1 = the tile is a single dominant motif that
 * will visibly grid, 0 = content varies as much within a tile as between them.
 */
function repeatSalience(img) {
  const { data, width, height } = img;
  const lum = new Float32Array(width * height);
  for (let i = 0; i < lum.length; i += 1) {
    const o = i * CH;
    lum[i] = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
  }
  // Global contrast of the print — the denominator, so a flat pastel and a
  // high-contrast print are comparable.
  let mean = 0;
  for (let i = 0; i < lum.length; i += 1) mean += lum[i];
  mean /= lum.length;
  let variance = 0;
  for (let i = 0; i < lum.length; i += 1) {
    const d = lum[i] - mean;
    variance += d * d;
  }
  variance /= lum.length;
  if (variance < 1e-6) return 0;

  // Mean squared difference against the half-tile-shifted copy (wrap-around).
  const dx = width >> 1;
  const dy = height >> 1;
  let diff = 0;
  for (let y = 0; y < height; y += 1) {
    const sy = (y + dy) % height;
    for (let x = 0; x < width; x += 1) {
      const sx = (x + dx) % width;
      const d = lum[y * width + x] - lum[sy * width + sx];
      diff += d * d;
    }
  }
  diff /= width * height;

  // For uncorrelated content diff -> 2*variance. Anything below that means the
  // shifted copy still looks like the original, i.e. the motif dominates.
  const norm = diff / (2 * variance);
  return Math.max(0, Math.min(1, 1 - norm));
}

/**
 * Motif scale: the dominant feature size in the print, as a share of the tile.
 *
 * Estimated from how fast the luma autocorrelation decays: we find the smallest
 * shift at which the tile stops looking like itself. A large number means one
 * motif spans most of the tile, so tiling it at 42 % of the photo width shows
 * the same object over and over.
 */
function motifScale(img) {
  const { data, width, height } = img;
  const n = Math.min(width, height);
  const lum = new Float32Array(width * height);
  for (let i = 0; i < lum.length; i += 1) {
    const o = i * CH;
    lum[i] = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
  }
  let mean = 0;
  for (let i = 0; i < lum.length; i += 1) mean += lum[i];
  mean /= lum.length;
  let variance = 0;
  for (let i = 0; i < lum.length; i += 1) {
    const d = lum[i] - mean;
    variance += d * d;
  }
  variance /= lum.length;
  if (variance < 1e-6) return 0;

  // Half-decay shift of the wrap-around autocorrelation along x.
  for (let s = 1; s < n / 2; s += 1) {
    let acc = 0;
    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 1) {
        acc += (lum[y * width + x] - mean) * (lum[y * width + ((x + s) % width)] - mean);
      }
    }
    acc /= (Math.ceil(height / 4) * width) * variance;
    if (acc < 0.5) return s / n;
  }
  return 0.5;
}

async function main() {
  const files = (await readdir(DIR))
    .filter((f) => /^stoff-\d+\.webp$/.test(f))
    .sort();

  const rows = [];
  for (const f of files) {
    const path = join(DIR, f);
    const raw = await decodeRaw(path);
    const energy = seamEnergy(raw);
    const salience = repeatSalience(raw);
    const scale = motifScale(raw);
    const bytes = (await readFile(path)).length;
    rows.push({
      id: f.replace(/\.webp$/, ""),
      seamX: Number(energy.x.toFixed(2)),
      seamY: Number(energy.y.toFixed(2)),
      seamAbsX: Number(energy.seamX.toFixed(2)),
      seamAbsY: Number(energy.seamY.toFixed(2)),
      salience: Number(salience.toFixed(3)),
      motifScale: Number(scale.toFixed(3)),
      width: raw.width,
      bytes,
    });
  }

  rows.sort((a, b) => b.salience - a.salience);
  console.log("id         seamX seamY  salience motif  px");
  for (const r of rows) {
    console.log(
      `${r.id.padEnd(10)} ${String(r.seamX).padStart(5)} ${String(r.seamY).padStart(5)}  ` +
        `${String(r.salience).padStart(6)} ${String(r.motifScale).padStart(5)}  ${r.width}`,
    );
  }

  if (JSON_OUT) {
    await writeFile(resolve(JSON_OUT), JSON.stringify({ dir: DIR, rows }, null, 2));
    console.log(`\n-> ${JSON_OUT}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
