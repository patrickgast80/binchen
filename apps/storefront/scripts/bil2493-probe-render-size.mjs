#!/usr/bin/env node
// BIL-2493 — the fair version of the probe: compare candidates at the size the
// browser actually paints the tile, not at master resolution.
//
// Downscaling to 512 and back to 1024 obviously loses detail — but the browser
// never paints 1024. The tile lands at ~260 CSS px (1440px desktop) or ~150
// CSS px (390px mobile); the device-pixel worst case is 260 * 2 = 520. So both
// master and candidate get resampled to the paint size and compared there.

import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";

const SRC = resolve("C:/Users/Besitzer/Desktop/bilulu/stoffe");
const files = (await readdir(SRC)).filter((f) => /\.jpe?g$/i.test(f)).sort();
const probes = [14, 20, 30].map((i) => ({ i, file: files[i - 1] }));

// device px the tile occupies: desktop 1440 @DPR2, desktop 1440 @DPR1, mobile 390 @DPR3
const PAINT_SIZES = [520, 260, 450];
const candidates = [
  { size: 640, q: 80 },
  { size: 512, q: 80 },
  { size: 512, q: 72 },
  { size: 384, q: 80 },
];

function psnr(a, b) {
  let se = 0;
  for (let p = 0; p < a.length; p++) {
    const d = a[p] - b[p];
    se += d * d;
  }
  const mse = se / a.length;
  return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
}

for (const { i, file } of probes) {
  const img = sharp(join(SRC, file), { failOn: "none" }).rotate();
  const meta = await img.metadata();
  const side = Math.min(meta.width, meta.height);
  const square = img.extract({
    left: Math.floor((meta.width - side) / 2),
    top: Math.floor((meta.height - side) / 2),
    width: side,
    height: side,
  });

  const masterBuf = await square.clone().resize(1024, 1024, { fit: "cover" }).webp({ quality: 80 }).toBuffer();
  console.log(`\nstoff-${String(i).padStart(2, "0")}`);
  for (const c of candidates) {
    const buf = await square
      .clone()
      .resize(c.size, c.size, { fit: "cover" })
      .webp({ quality: c.q, effort: 6 })
      .toBuffer();
    const parts = [];
    for (const paint of PAINT_SIZES) {
      const m = await sharp(masterBuf).resize(paint, paint, { fit: "fill" }).raw().toBuffer();
      const c2 = await sharp(buf).resize(paint, paint, { fit: "fill" }).raw().toBuffer();
      parts.push(`@${paint}px ${psnr(m, c2).toFixed(1)} dB`);
    }
    console.log(
      `  ${String(c.size).padStart(4)}px q${c.q}  ${String(Math.round(buf.length / 1024)).padStart(4)} kB   ${parts.join("   ")}`,
    );
  }
}
