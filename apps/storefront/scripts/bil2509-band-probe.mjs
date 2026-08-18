/**
 * BIL-2509 — can ANY band-pass separate drape from this print?
 *
 * The chroma-inpaint route failed on the dino shorts: at ~60% motif coverage
 * there is not enough unprinted ground left to fill from, and the percentile
 * threshold latches onto the ground's own speckle instead of the motifs. Before
 * settling for synthetic drape on the printed zone, check the cheaper question
 * directly — is there a scale band where the signal is folds and not motifs?
 *
 * Dumps the band-passed field for a sweep of (fine, broad) pairs so it can be
 * judged by eye, plus the sigma of each, on BOTH a printed zone and a plain one.
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

import { bandPass, spread } from "./lib/konfigurator-folds.mjs";
import { smoothBinary } from "./lib/konfigurator-shading.mjs";
import { checkerboardToUniformCanvas } from "./bil2490-checkerboard-normalize.mjs";

const SRC = "C:/Users/Besitzer/Desktop/bilulu/bilder bearbeitet/09712b22-56db-4f11-bfcf-c7d6830dfd1b.jpeg";
await mkdir(".tmp/bil2509", { recursive: true });

const cut = await checkerboardToUniformCanvas(SRC);
const W = cut.w, H = cut.h, N = W * H;
const isBg = new Uint8Array(N);
for (let p = 0; p < N; p++) isBg[p] = cut.alpha[p] ? 0 : 1;
{
  const g = new Uint8Array(N);
  for (let p = 0; p < N; p++) if (!isBg[p]) g[p] = 1;
  const c = smoothBinary(g, W, H, { radius: 2, iterations: 1 });
  for (let p = 0; p < N; p++) isBg[p] = c[p] ? 0 : 1;
}

// The de-printed source the existing pipeline already builds (median 21).
const { data: dp } = await sharp(SRC).rotate().removeAlpha().median(21).raw().toBuffer({ resolveWithObject: true });
const lum = new Float32Array(N);
for (let p = 0; p < N; p++) {
  if (isBg[p]) continue;
  const i = p * 3;
  lum[p] = 0.2126 * dp[i] + 0.7152 * dp[i + 1] + 0.0722 * dp[i + 2];
}

const all = new Uint8Array(N);
for (let p = 0; p < N; p++) all[p] = isBg[p] ? 0 : 1;

for (const [fine, broad] of [[5, 46], [14, 46], [22, 60], [30, 80]]) {
  const f = bandPass(lum, W, H, isBg, { fine, broad });
  const buf = Buffer.alloc(N * 3, 255);
  for (let p = 0; p < N; p++) {
    if (isBg[p]) continue;
    const v = Math.max(0, Math.min(255, Math.round(128 + f[p] * 6)));
    buf[p * 3] = v; buf[p * 3 + 1] = v; buf[p * 3 + 2] = v;
  }
  await sharp(buf, { raw: { width: W, height: H, channels: 3 } })
    .resize({ width: 620 }).png().toFile(`.tmp/bil2509/band-${fine}-${broad}.png`);
  console.log(`fine=${String(fine).padStart(2)} broad=${broad}  sigma=${spread(f, all, isBg, N).toFixed(2)}`);
}
