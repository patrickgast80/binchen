#!/usr/bin/env node
// BIL-2490: recover real alpha from Sabine's hand-made cutouts.
//
// Sabine cut the products out herself (board decision 2026-08-17, replaces the
// AI-cutout tickets BIL-2486/BIL-2489) and delivered them in "bilder
// bearbeitet". The cutouts are clean — but they were exported as JPEG, so the
// editor's transparency CHECKERBOARD got flattened into real pixels. Every file
// reports hasAlpha=false and carries a grey/white 2-tone grid where the
// background should be.
//
// That is deterministic and therefore better than re-running ML segmentation:
// the checkerboard is a synthetic pattern, not a photo backdrop, so we can
// classify it exactly and keep Sabine's own edge decisions instead of letting a
// model re-guess them (and re-introduce the knitwear-edge problems that got
// BIL-2486 stopped).
//
// The two grid tones are NOT hardcoded: Sabine's files come from two different
// editors, a light one (grey 205 / white 255) and a dark one (near-black 2..16 /
// mid-grey 122..150). The tones are therefore measured per image from the border
// band, which is guaranteed to be background.
//
// Classification (all three must hold, then flood-fill from the border):
//   1. neutral       — max(R,G,B) - min(R,G,B) <= NEUTRAL_TOL   (grid is pure grey)
//   2. on-tone       — luma is within tolerance of the measured lo or hi tone
//   3. two-toned     — the local window contains BOTH measured tones. This is
//                      what separates the grid from a smooth grey styrofoam
//                      mannequin head, from flat white fabric and from a solid
//                      black garment area, all of which are single-toned.
//   4. border-reachable — flood fill, so white highlights INSIDE a garment are
//                      never eaten. Gaps between two pieces of a set are reached
//                      through the outside and become transparent correctly.
// The mask is then dilated by HALO_PX to drop the JPEG anti-alias fringe where
// garment and checkerboard blended, otherwise every silhouette keeps a grey rim.
//
// Output geometry/colour is unchanged from the BIL-2486 pipeline (1200x1200,
// #F0EBE1, 4% pad, optical centre 48%) — see docs/design/STUDIO-LOOK.md.
//
// sharp is not a storefront dependency here; run with NODE_PATH pointing at any
// node_modules that has it, e.g.
//   NODE_PATH=../../../.pc-tmp/sharp-env/node_modules node bil2490-checkerboard-normalize.mjs --in dir --out dir
//
// Usage:
//   node bil2490-checkerboard-normalize.mjs --in file.jpg --out file.jpg
//   node bil2490-checkerboard-normalize.mjs --in dir/ --out dir/     (batch)
//   ... --debug-mask maskdir/                (also write the alpha mask as PNG)
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export const CANVAS_BG = { r: 240, g: 235, b: 225 }; // #F0EBE1, = binchen.cream-dark
export const CANVAS_SIZE = 1200;
export const PAD_RATIO = 0.04;

const NEUTRAL_TOL = 12; // grid is R=G=B; warm cream fabric is not
const MIN_TONE_GAP = 30; // the two grid tones are always far apart (seen: 36..146)
const BORDER_BAND = 12; // px sampled on each edge to measure the grid tones
const HALO_PX = 2; // dilate the background mask into the garment by this much

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, a) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), a[i + 1]]);
    return acc;
  }, []),
);

/**
 * Measure the two checkerboard tones from the border band, which is background
 * in every delivered file. Returns null when the band is not a 2-tone neutral
 * grid (i.e. the file was not exported over a transparency checkerboard).
 */
function detectTones(luma, neutral, w, h) {
  const hist = new Float64Array(256);
  const add = (x, y) => {
    const p = y * w + x;
    if (neutral[p]) hist[luma[p]]++;
  };
  const band = Math.min(BORDER_BAND, Math.floor(Math.min(w, h) / 4));
  for (let y = 0; y < band; y++) for (let x = 0; x < w; x++) { add(x, y); add(x, h - 1 - y); }
  for (let x = 0; x < band; x++) for (let y = 0; y < h; y++) { add(x, y); add(w - 1 - x, y); }

  // Smooth so JPEG jitter around a tone lands in one peak.
  const sm = new Float64Array(256);
  for (let v = 0; v < 256; v++) {
    for (let d = -3; d <= 3; d++) if (v + d >= 0 && v + d < 256) sm[v] += hist[v + d];
  }
  let a = 0;
  for (let v = 1; v < 256; v++) if (sm[v] > sm[a]) a = v;
  let b = -1;
  for (let v = 0; v < 256; v++) {
    if (Math.abs(v - a) < MIN_TONE_GAP) continue;
    if (b < 0 || sm[v] > sm[b]) b = v;
  }
  if (b < 0 || sm[b] === 0) return null;
  const lo = Math.min(a, b), hi = Math.max(a, b);
  // Both tones must actually dominate the band, else this is a photo backdrop.
  // Measured on the RAW histogram — sm bins each sum 7 neighbours, so they are
  // not comparable to a pixel count.
  const tol = Math.max(14, Math.round((hi - lo) * 0.2));
  let onTone = 0, neutralPx = 0;
  for (let v = 0; v < 256; v++) {
    neutralPx += hist[v];
    if (Math.abs(v - lo) <= tol || Math.abs(v - hi) <= tol) onTone += hist[v];
  }
  if (!neutralPx || onTone / neutralPx < 0.6) return null;
  return { lo, hi };
}

/**
 * Tile size of the transparency grid, as the MEDIAN distance between tone flips
 * along lines that are pure background.
 *
 * Median, not span/count: the delivered files are not a mathematically perfect
 * checkerboard. Measured on 09712b22, column 0 flips every 16px but slips a
 * whole tile three times over the height (gaps of 32). A global period+phase
 * model therefore desynchronises and classifies the interior of the image as
 * garment, which is exactly what the first attempt did. The tile size itself is
 * stable, so it is all we take from the geometry — the classification below is
 * local and survives the slips.
 */
function detectTile(luma, w, h, tones) {
  const { lo, hi } = tones;
  const mid = (lo + hi) / 2;
  const tol = Math.max(14, Math.round((hi - lo) * 0.25));
  const onTone = (v) => Math.abs(v - lo) <= tol || Math.abs(v - hi) <= tol;
  const gaps = [];
  const scan = (get, n) => {
    let ok = 0;
    for (let i = 0; i < n; i += 4) if (onTone(get(i))) ok++;
    // 0.85, not 0.95: on a fine 10px grid every tile edge contributes a couple
    // of blended pixels that are legitimately off-tone, so a pure background
    // line still only scores ~0.85.
    if (ok / Math.ceil(n / 4) < 0.85) return; // line crosses the garment
    let last = -1, cur = get(0) > mid;
    for (let i = 1; i < n; i++) {
      const t = get(i) > mid;
      if (t === cur) continue;
      cur = t;
      if (last >= 0) gaps.push(i - last);
      last = i;
    }
  };
  for (const y of [0, 1, 2, 3, h - 4, h - 3, h - 2, h - 1]) scan((x) => luma[y * w + x], w);
  for (const x of [0, 1, 2, 3, w - 4, w - 3, w - 2, w - 1]) scan((y) => luma[y * w + x], h);
  if (gaps.length < 8) return null;
  gaps.sort((a, b) => a - b);
  const tile = gaps[Math.floor(gaps.length / 2)];
  return tile >= 4 && tile <= 48 ? tile : null;
}

/** Sliding-window min and max over a radius-r square, separably in O(w*h). */
function localMinMax(luma, w, h, r) {
  const run = (src, n, stride, count, dst, cmp) => {
    // Monotonic deque per line: O(n) regardless of window size.
    const idx = new Int32Array(n);
    for (let l = 0; l < count; l++) {
      const base = l * (stride === 1 ? n : 1);
      const at = (i) => src[stride === 1 ? base + i : i * w + l];
      let head = 0, tail = 0;
      let next = 0;
      for (let i = 0; i < n; i++) {
        const hiEnd = Math.min(n - 1, i + r);
        while (next <= hiEnd) {
          while (tail > head && cmp(at(next), at(idx[tail - 1]))) tail--;
          idx[tail++] = next++;
        }
        while (idx[head] < i - r) head++;
        const v = at(idx[head]);
        if (stride === 1) dst[base + i] = v; else dst[i * w + l] = v;
      }
    }
  };
  const less = (a, b) => a < b;
  const more = (a, b) => a > b;
  const tmpMin = new Uint8Array(w * h), tmpMax = new Uint8Array(w * h);
  run(luma, w, 1, h, tmpMin, less);
  run(luma, w, 1, h, tmpMax, more);
  const outMin = new Uint8Array(w * h), outMax = new Uint8Array(w * h);
  run(tmpMin, h, w, w, outMin, less);
  run(tmpMax, h, w, w, outMax, more);
  return { min: outMin, max: outMax };
}

/**
 * Per-pixel checkerboard candidacy, before connectivity: neutral, on one of the
 * two grid tones, and with BOTH tones present within one tile. The last test is
 * what a smooth grey mannequin head, flat white fabric and a solid black area
 * all fail — they are single-toned at that scale.
 */
function candidateMask(luma, neutral, w, h, tones, tile) {
  const { lo, hi } = tones;
  const tol = Math.max(14, Math.round((hi - lo) * 0.25));
  const { min, max } = localMinMax(luma, w, h, Math.max(4, Math.round(tile * 1.3)));
  const cand = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (!neutral[p]) continue;
    const v = luma[p];
    if (Math.abs(v - lo) > tol && Math.abs(v - hi) > tol) continue;
    if (min[p] <= lo + tol && max[p] >= hi - tol) cand[p] = 1;
  }
  return cand;
}
/**
 * Absorb checkerboard that the border flood fill cannot reach: the gap inside a
 * knotted turban, the hollow of a bonnet, the space between the two pieces of a
 * set when the garment closes around it. Only components of at least one tile
 * are absorbed, so a genuine white highlight inside the fabric stays opaque.
 */
function absorbEnclosedGrid(cand, bg, w, h, minArea) {
  const seen = new Uint8Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (!cand[start] || bg[start] || seen[start]) continue;
    const comp = [start];
    seen[start] = 1;
    for (let k = 0; k < comp.length; k++) {
      const p = comp[k];
      const x = p % w, y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (!cand[q] || bg[q] || seen[q]) continue;
          seen[q] = 1;
          comp.push(q);
        }
      }
    }
    if (comp.length >= minArea) for (const p of comp) bg[p] = 1;
  }
  return bg;
}

/**
 * Clear thin opaque slivers that hug an image edge. The outermost tiles are
 * often clipped to a few pixels of an off-tone colour, which survives the tone
 * test and then stretches the alpha bounding box to the full frame. A garment
 * that genuinely reaches the edge has a long run there and is kept.
 */
function stripEdgeSlivers(bg, w, h, maxRun = 16) {
  const clear = (get, set, n) => {
    let run = 0;
    while (run < n && !get(run)) run++;
    if (run > 0 && run <= maxRun) for (let i = 0; i < run; i++) set(i);
  };
  for (let y = 0; y < h; y++) {
    clear((x) => bg[y * w + x], (x) => { bg[y * w + x] = 1; }, w);
    clear((x) => bg[y * w + (w - 1 - x)], (x) => { bg[y * w + (w - 1 - x)] = 1; }, w);
  }
  for (let x = 0; x < w; x++) {
    clear((y) => bg[y * w + x], (y) => { bg[y * w + x] = 1; }, h);
    clear((y) => bg[(h - 1 - y) * w + x], (y) => { bg[(h - 1 - y) * w + x] = 1; }, h);
  }
  return bg;
}

/**
 * Drop opaque islands far smaller than the biggest one: editor chrome bars, the
 * mouse cursor, single tiles the grid fit missed. A set photographed as two
 * pieces keeps both — the threshold is relative to the largest component.
 */
function pruneSpecks(bg, w, h, minRatio = 0.05) {
  const comp = new Int32Array(w * h).fill(-1);
  const sizes = [];
  for (let start = 0; start < w * h; start++) {
    if (bg[start] || comp[start] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [start];
    comp[start] = id;
    while (stack.length) {
      const p = stack.pop();
      size++;
      const x = p % w, y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (bg[q] || comp[q] >= 0) continue;
          comp[q] = id;
          stack.push(q);
        }
      }
    }
    sizes.push(size);
  }
  if (!sizes.length) return { bg, kept: 0, dropped: 0 };
  const max = Math.max(...sizes);
  let kept = 0, dropped = 0;
  for (let p = 0; p < w * h; p++) {
    if (bg[p]) continue;
    if (sizes[comp[p]] < max * minRatio) { bg[p] = 1; dropped++; } else kept++;
  }
  return { bg, kept, dropped: sizes.filter((s) => s < max * minRatio).length };
}

/** 8-connected flood fill of candidate pixels starting from the image border. */
function floodFromBorder(cand, w, h) {
  const bg = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    const p = y * w + x;
    if (cand[p] && !bg[p]) { bg[p] = 1; stack.push(p); }
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w, y = (p - x) / w;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= w) continue;
        push(xx, yy);
      }
    }
  }
  return bg;
}

/** Grow the background mask by r px (chebyshev) to swallow the blend fringe. */
function dilate(mask, w, h, r) {
  if (r <= 0) return mask;
  // Two 1-D passes: cheaper than a square window and identical for chebyshev.
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let d = -r; d <= r && !v; d++) {
        const xx = x + d;
        if (xx >= 0 && xx < w && mask[y * w + xx]) v = 1;
      }
      tmp[y * w + x] = v;
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = 0;
      for (let d = -r; d <= r && !v; d++) {
        const yy = y + d;
        if (yy >= 0 && yy < h && tmp[yy * w + x]) v = 1;
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

export async function checkerboardToUniformCanvas(inputPath) {
  const oriented = sharp(inputPath).rotate();
  const { data, info } = await oriented.raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;

  const luma = new Uint8Array(w * h);
  const neutral = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const i = p * channels;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    luma[p] = (r * 299 + g * 587 + b * 114) / 1000;
    neutral[p] = Math.max(r, g, b) - Math.min(r, g, b) <= NEUTRAL_TOL ? 1 : 0;
  }

  const tones = detectTones(luma, neutral, w, h);
  if (!tones) throw new Error(`${path.basename(inputPath)}: no transparency checkerboard detected in the border band — is this really an exported cutout?`);
  const tile = detectTile(luma, w, h, tones);
  if (!tile) throw new Error(`${path.basename(inputPath)}: border band is neutral 2-tone but shows no tile grid — not a transparency checkerboard`);
  const cand = candidateMask(luma, neutral, w, h, tones, tile);
  const reached = absorbEnclosedGrid(cand, floodFromBorder(cand, w, h), w, h, tile * tile);
  const filled = stripEdgeSlivers(dilate(reached, w, h, HALO_PX), w, h);
  const { bg, dropped } = pruneSpecks(filled, w, h);

  let bgCount = 0;
  const alpha = Buffer.alloc(w * h);
  for (let p = 0; p < w * h; p++) {
    if (bg[p]) bgCount++;
    else alpha[p] = 255;
  }
  const bgRatio = bgCount / (w * h);
  if (bgRatio < 0.05) throw new Error(`${path.basename(inputPath)}: only ${(bgRatio * 100).toFixed(1)}% classified as background — refusing to ship an un-cut image`);

  // Alpha bounding box, computed here rather than via sharp's trim(): trim keys
  // off the top-left pixel COLOUR, and the transparent region still carries the
  // grid's two RGB tones, so trim finds nothing to remove.
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!alpha[y * w + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const bboxW = maxX - minX + 1;
  const bboxH = maxY - minY + 1;

  const rgb = Buffer.alloc(w * h * 3);
  for (let p = 0; p < w * h; p++) {
    const i = p * channels;
    rgb[p * 3] = data[i];
    rgb[p * 3 + 1] = data[i + 1];
    rgb[p * 3 + 2] = data[i + 2];
  }
  // Two separate pipelines on purpose: sharp orders extract before joinChannel
  // inside one pipeline, so the full-frame alpha would be joined onto the
  // already-cropped RGB and land shifted — which paints dark tiles over the
  // garment instead of cutting the background away.
  const cutout = await sharp(rgb, { raw: { width: w, height: h, channels: 3 } })
    .joinChannel(alpha, { raw: { width: w, height: h, channels: 1 } })
    .png()
    .toBuffer();
  const trimmed = await sharp(cutout)
    .extract({ left: minX, top: minY, width: bboxW, height: bboxH })
    .png()
    .toBuffer();

  const innerMax = Math.round(CANVAS_SIZE * (1 - PAD_RATIO * 2));
  const scale = Math.min(innerMax / bboxW, innerMax / bboxH);
  const targetW = Math.round(bboxW * scale);
  const targetH = Math.round(bboxH * scale);
  const resized = await sharp(trimmed).resize(targetW, targetH, { fit: "inside" }).toBuffer();

  const left = Math.round((CANVAS_SIZE - targetW) / 2);
  const top = Math.round(CANVAS_SIZE * 0.48 - targetH / 2);

  const jpeg = await sharp({
    create: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 3, background: CANVAS_BG },
  })
    .composite([{ input: resized, left, top: Math.max(0, Math.min(top, CANVAS_SIZE - targetH)) }])
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4" })
    .toBuffer();

  return { jpeg, bgRatio, tones, tile, dropped, srcW: w, srcH: h, bboxW, bboxH, alpha, w, h };
}

async function processOne(inFile, outFile, maskDir) {
  const r = await checkerboardToUniformCanvas(inFile);
  const tmp = outFile + ".tmp.jpg";
  fs.writeFileSync(tmp, r.jpeg);
  fs.renameSync(tmp, outFile);
  if (maskDir) {
    fs.mkdirSync(maskDir, { recursive: true });
    await sharp(r.alpha, { raw: { width: r.w, height: r.h, channels: 1 } })
      .png()
      .toFile(path.join(maskDir, path.basename(outFile).replace(/\.jpe?g$/i, ".mask.png")));
  }
  console.log(
    `OK ${path.basename(inFile)} -> ${path.basename(outFile)} ` +
      `tones=${r.tones.lo}/${r.tones.hi} tile=${r.tile} specks=${r.dropped} bg=${(r.bgRatio * 100).toFixed(1)}% ` +
      `src=${r.srcW}x${r.srcH} bbox=${r.bboxW}x${r.bboxH}`,
  );
  return r;
}

async function main() {
  if (!args.in || !args.out) {
    console.error("--in and --out required");
    process.exit(1);
  }
  if (fs.statSync(args.in).isDirectory()) {
    fs.mkdirSync(args.out, { recursive: true });
    const files = fs.readdirSync(args.in).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
    // Keep going on a bad file and report at the end: a single screenshot with
    // editor chrome instead of a clean export must not block the whole batch.
    const failed = [];
    for (const f of files) {
      try {
        await processOne(
          path.join(args.in, f),
          path.join(args.out, f.replace(/\.(jpe?g|png)$/i, ".jpg")),
          args["debug-mask"],
        );
      } catch (err) {
        failed.push(`${f}: ${err.message.replace(/^[^:]+: /, "")}`);
        console.error(`SKIP ${f}`);
      }
    }
    console.log(`\n${files.length - failed.length}/${files.length} normalised`);
    if (failed.length) {
      console.log("needs manual attention:");
      for (const f of failed) console.log(`  - ${f}`);
    }
  } else {
    await processOne(args.in, args.out, args["debug-mask"]);
  }
}

if (args.in || args.out) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
