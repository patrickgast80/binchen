/**
 * BIL-2445 — preprocess muetze-boho-mint-01.jpeg into the Foto-Konfigurator assets.
 *
 * Outputs (all under public/konfigurator/muetze-foto/):
 *   base.webp        — achromatic shading map of the Mütze on transparent bg
 *   highlight.webp   — sheen layer for `mix-blend-mode: screen`
 *   mask-muetze.webp — alpha mask for the patterned main fabric (mint boho print)
 *   mask-futter.webp — alpha mask for the solid altrosa lining (brim, at the bottom)
 *
 * BIL-2461, second pass — KNOWN LIMIT ON THIS GARMENT
 * ---------------------------------------------------
 * The Hose recovers real fold shading because its print is small dark motifs
 * on white, which a max filter can see past. The boho rainbows here are ~120 px
 * — larger than any local filter window that would still leave shading intact —
 * and they mix white stars WITH dark motifs, so neither max, min nor (verified)
 * repeated-median separates print from fold. Anything that removes the pattern
 * on this photo also removes the drape, including the gathered centre band.
 *
 * So the Mütze base is deliberately a broad dome gradient, and its depth comes
 * from the explicitly synthesised cues instead: silhouette occlusion, the brim
 * seam valley, grain and the sheen layer. Recovering true fold structure needs
 * a source photo of this hat in a PLAIN fabric — that belongs to the reshoot
 * work in BIL-2462, not here.
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

import {
  applyEdgeShadow,
  applyGrain,
  applyRadialGathers,
  applyRib,
  applySeamRelief,
  boundaryBetween,
  boxBlurMasked,
  buildHighlight,
  estimateIllumination,
  grayToRGBA,
  normalizeShadingZoned,
  smoothBinary,
} from "./lib/konfigurator-shading.mjs";
import { applyRealFolds, foldsFromPhoto } from "./lib/konfigurator-folds.mjs";

const SRC = "public/products/muetze/muetze-boho-mint-01.jpeg";
const OUT_DIR = "public/konfigurator/muetze-foto";
const DEBUG = process.argv.includes("--debug");
await mkdir(OUT_DIR, { recursive: true });

// data = unaltered raw pixels — needed for background + lining segmentation
// which reads exact colour values.
//
// deprinted = libvips median filter. Unlike the pumphose floral (dark motifs
// on white, where a max filter recovers the fabric), the boho print mixes
// WHITE stars with DARK rainbow motifs on mid-tone mint, so neither a max nor
// a min filter finds the fabric. A median does: the motifs are a minority
// inside a 25 px window, the mint is the mode. Blurring — what the first
// BIL-2461 pass did — averages the motifs IN instead, which is why the base
// then had to be crushed into a 30-level ramp to hide them, and why the
// preview ended up looking like flat vector shapes.
// BIL-2478: the studio shot has the hat lying on its side — crown pointing
// right, brim/lining edge left. Every layer is generated from this one photo,
// so the cheapest correct fix is to stand the source upright once, before any
// segmentation runs: 90° counter-clockwise puts the crown up, the knot band
// across the front and the lining brim at the bottom, matching the Turban
// preview. All filters below are isotropic (median, distance transforms,
// Gaussian smoothing), so the shading result is identical — only rotated.
const rotateUpright = (pipeline) => pipeline.rotate(-90);

const { data, info } = await rotateUpright(sharp(SRC)).raw().toBuffer({ resolveWithObject: true });
const deprinted = (
  await rotateUpright(sharp(SRC)).median(25).raw().toBuffer({ resolveWithObject: true })
).data;
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

// BIL-2461: strip garment speckle by keeping only the LARGEST connected
// component of non-bg pixels. Isolated colourful print fragments outside the
// main hat silhouette (JPEG noise near the studio edge) would otherwise show
// up as jagged fragments in the base + masks after cropping.
{
  const garmentLabel = new Int32Array(N);
  const gq = new Int32Array(N);
  let nextL = 0, bestL = 0, bestSize = 0;
  for (let seed = 0; seed < N; seed++) {
    if (isBg[seed] || garmentLabel[seed]) continue;
    nextL++;
    let size = 0;
    let gh = 0, gt = 0;
    garmentLabel[seed] = nextL;
    gq[gt++] = seed;
    while (gh < gt) {
      const p = gq[gh++];
      size++;
      const x = p % W, y = (p / W) | 0;
      if (x > 0 && !isBg[p - 1] && !garmentLabel[p - 1]) { garmentLabel[p - 1] = nextL; gq[gt++] = p - 1; }
      if (x < W - 1 && !isBg[p + 1] && !garmentLabel[p + 1]) { garmentLabel[p + 1] = nextL; gq[gt++] = p + 1; }
      if (y > 0 && !isBg[p - W] && !garmentLabel[p - W]) { garmentLabel[p - W] = nextL; gq[gt++] = p - W; }
      if (y < H - 1 && !isBg[p + W] && !garmentLabel[p + W]) { garmentLabel[p + W] = nextL; gq[gt++] = p + W; }
    }
    if (size > bestSize) { bestSize = size; bestL = nextL; }
  }
  console.log("garment components:", nextL, "largest:", bestSize, "px");
  let stripped = 0;
  for (let p = 0; p < N; p++) {
    if (!isBg[p] && garmentLabel[p] !== bestL) {
      isBg[p] = 1;
      stripped++;
    }
  }
  console.log("garment speckle stripped:", stripped, "px");
}

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

// -- 2b. Clean up both contours ---------------------------------------------
// Colour segmentation on a JPEG leaves a stair-stepped silhouette and a spur
// or two where a print motif touched the threshold. Blur-and-rethreshold both
// maps so the outline and the lining edge read as cut-and-sewn fabric.
{
  const garment = new Uint8Array(N);
  for (let p = 0; p < N; p++) if (!isBg[p]) garment[p] = 1;
  const cleaned = smoothBinary(garment, W, H, { radius: 8, iterations: 2 });
  for (let p = 0; p < N; p++) isBg[p] = cleaned[p] ? 0 : 1;
}
{
  const cleaned = smoothBinary(isFutter, W, H, { radius: 6, iterations: 2 });
  for (let p = 0; p < N; p++) isFutter[p] = cleaned[p] && !isBg[p] ? 1 : 0;
}

// -- 3. Compose raw buffers -------------------------------------------------
const maskMuetze = Buffer.alloc(N);
const maskFutter = Buffer.alloc(N);
const isShell = new Uint8Array(N);
for (let p = 0; p < N; p++) {
  if (isBg[p]) continue;
  if (isFutter[p]) maskFutter[p] = 255;
  else { maskMuetze[p] = 255; isShell[p] = 1; }
}

// Illumination from the de-printed copy: "plain" mode, because the median pass
// above has already removed the pattern, so no max filter is wanted here.
// smooth 70 is heavy on purpose: the boho rainbows are ~120 px motifs, far too
// large for the median to erase outright, so anything less leaves them as
// camouflage-like blotches. The hat is a smooth dome anyway — its honest
// signal is one broad light gradient, and the depth comes from the edge
// occlusion and brim seam below.
const illum = estimateIllumination(deprinted, W, H, isBg, {
  mode: "plain",
  smooth: 70,
  erode: 4,
});

// Zoned: the mint shell and the dusty-pink lining are different materials, so
// a global stretch would leave the lining permanently darker than the shell
// and the same chosen colour would render differently in the two zones.
// BIL-2509: shadow floor 172 -> 158 and a stronger silhouette roll-off. The
// deepest crease could only take the swatch to 67%, while the reference photo's
// knot shadow and the fold under the brim go well past that.
const SHADOW = 158;
const LIT = 252;
const ZONES = [isFutter, isShell];
const { gray, unit, stats } = normalizeShadingZoned(
  illum, W, H, isBg,
  ZONES,
  { shadow: SHADOW, lit: LIT },
);

applyEdgeShadow(gray, W, H, isBg, { radius: 22, strength: 0.22 });

// -- 3a2. REAL folds from the photo (BIL-2509) -------------------------------
// Trusted: the lining (0) only — plain dusty pink, so its real creases can be
// measured straight off the photo. NOT the shell (1): the boho rainbows are
// ~120px motifs on mint and the de-print pass already has to smooth at radius 70
// to hide them, which is exactly the regime where fold recovery returns motif
// blobs instead of folds (see konfigurator-folds.mjs header). The shell keeps
// the radial gather fan below, which is what BIL-2479 built it for.
const { detail: folds, zoneOk, printiness } = foldsFromPhoto(data, W, H, isBg, ZONES, {
  trustZones: [0], zoneNames: ["futter", "muetze"],
  fine: 5, broad: 70, maxPrint: 0.22,
});
["futter", "muetze"].forEach((name, i) => {
  console.log(
    `zone ${name.padEnd(8)} printiness ${(printiness[i] * 100).toFixed(1)}% ` +
      `-> real folds ${zoneOk[i] ? "YES" : "no (synthetic drape kept)"}`,
  );
});
const foldSheen = applyRealFolds(gray, folds, W, H, isBg, ZONES, stats, {
  shadow: SHADOW, lit: LIT, gain: 1.0, depth: 1.4, limit: 30, ceiling: 246,
});

// -- 3b. Fabric drawing — BIL-2479 -------------------------------------------
//
// Everything above this line produces ONE broad dome gradient. That was a
// deliberate call in BIL-2461 (the boho print cannot be separated from the fold
// shading on this photo, so the de-print pass has to erase both), but the board
// rejected the result for the same reason it rejected the Hose in BIL-2470 /
// BIL-2473: two smooth gradients under `multiply` do not read as cloth, they
// read as vector shapes. The Hose was fixed by putting the fabric's own drawing
// back synthetically; the same pipeline is ported here.
//
// The Mütze needs a different crease MODEL than the Hose, though. A Pumphose is
// gathered into a horizontal hem, so its creases are a 1-D fan along x
// (`applyGatherFolds`). This is a turban cap: both shell halves are cinched into
// one small knot band in the middle of the front, and on the reference photo the
// creases radiate from it in every direction, splaying as they go. Hence
// `applyRadialGathers`.
//
// Fabric layers, in order of how loud they are on the reference photo:
//   1. the radiating gather fan out of the knot                (shell)
//   2. irregular vertical stretch creases in the jersey        (shell + brim)
//   3. neutral grain                                           (everywhere)

// Knot centre. The shell's lower contour has a deep notch over the brim, and its
// apex sits directly under the knot band — that is the one landmark in this
// photo that survives every filter, so the fan is anchored to it rather than to
// a hard-coded coordinate that would break on a reshoot.
//
// The centre is pushed a little BELOW the apex on purpose. A fan converging on a
// point in the middle of open fabric renders as a starburst — tried it, and it
// reads as a lens flare, not as gathering. On the real cap the convergence is
// hidden under the knot band; placing it just outside the shell zone, behind the
// notch corner, gets the same result without having to synthesise the band: the
// shell only ever sees the fan's open end.
let gTop = H, gBottom = 0, gLeft = W, gRight = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (isBg[y * W + x]) continue;
    if (y < gTop) gTop = y;
    if (y > gBottom) gBottom = y;
    if (x < gLeft) gLeft = x;
    if (x > gRight) gRight = x;
  }
}
const garmentH = gBottom - gTop + 1;
const garmentW = gRight - gLeft + 1;

const futterTop = new Int32Array(W).fill(-1);
let apexY = H;
for (let x = 0; x < W; x++) {
  for (let y = 0; y < H; y++) {
    if (isFutter[y * W + x]) {
      futterTop[x] = y;
      if (y < apexY) apexY = y;
      break;
    }
  }
}
// Plateau, not a single pixel: the notch apex is blunt, so average every column
// that reaches within 1% of the garment height of the minimum.
const apexCols = [];
for (let x = 0; x < W; x++) {
  if (futterTop[x] >= 0 && futterTop[x] <= apexY + garmentH * 0.01) apexCols.push(x);
}
const knotX = Math.round(apexCols.reduce((a, b) => a + b, 0) / apexCols.length);
const knotY = Math.round(apexY + garmentH * 0.03);
console.log("knot centre", { knotX, knotY, apexY, apexCols: apexCols.length, garmentW, garmentH });

// Additive texture is accumulated on its own field rather than straight onto
// `gray`. Both helpers are position-only and purely additive, so the field is
// exactly the fabric drawing — which is what the screen layer below needs, and
// what makes the "texture survives a saturated swatch" claim measurable.
const texture = new Float32Array(N);

applyRadialGathers(texture, W, H, isBg, isShell, {
  cx: knotX,
  cy: knotY,
  count: 22,
  amp: 8.5,
  inner: Math.round(garmentW * 0.14),
  reach: Math.round(garmentW * 0.85),
  decay: 1.1,
  jitter: 0.5,
  vary: 0.65,
  seed: 2479,
});

// Jersey stretch creases. Two octaves on each zone, jittered — a regular stripe
// would read as corduroy, which is the failure mode BIL-2473 documented on the
// Hose waistband. The brim is a folded-over band and is stretched harder, so its
// creases are tighter and deeper than the shell's.
applyRib(texture, W, H, isShell, { period: 58, amp: 2.6, fade: 14, knit: 0.25, jitter: 0.55, vary: 0.7, seed: 2479 });
applyRib(texture, W, H, isShell, { period: 19, amp: 1.5, fade: 14, knit: 0.4, jitter: 0.35, vary: 0.6, seed: 8419 });
applyRib(texture, W, H, isFutter, { period: 34, amp: 4.4, fade: 9, knit: 0.3, jitter: 0.55, vary: 0.7, seed: 2479 });
applyRib(texture, W, H, isFutter, { period: 13, amp: 1.8, fade: 9, knit: 0.45, jitter: 0.35, vary: 0.6, seed: 8419 });

for (let p = 0; p < N; p++) if (!isBg[p]) gray[p] += texture[p];

// Directional seam relief at the brim, replacing the symmetric
// `applySeamShadow` this file used to call. BIL-2473's finding applies verbatim:
// a symmetric valley plus a bright ridge peaking ON the stitch line is a drawn
// outline, and because the ridge is multiplicative over zones already normalised
// to `lit` (252) it clipped to 255 — under `mix-blend-mode: multiply` that is
// the swatch at full saturation, i.e. a hairline of pure unshaded colour tracing
// the whole brim.
//
// The asymmetry here is the opposite way round from the Hose. The pink is the
// LINING, seen through the cap's opening, so it sits behind the shell edge and
// catches that edge's cast shadow: `shadowed: isFutter`. The shell is the rolled
// piece, so its fold highlight goes a few px up into the shell, well clear of
// the shadow, and is capped below `lit`.
const seam = boundaryBetween(maskFutter, maskMuetze, W, H, isBg);
applySeamRelief(gray, W, H, isBg, { boundary: seam, shadowed: isFutter, rolled: isShell }, {
  occlusion: { reach: 20, strength: 0.26, bias: 1.4, spill: 5 },
  ridge: { reach: 6, strength: 0.05, offset: 7 },
  falloff: { reach: 28, strength: 0.06 },
  ceiling: 246,
});

applyGrain(gray, W, H, isBg, { amp: 3.2, cell: 2, seed: 2445 });

// Sheen. With no drawing on the fabric the screen layer was the only structure
// left on the garment, so the hat rendered as a lacquered dome; now that the
// jersey carries its own creases it needs much less of it. Blurred so it does
// not step at the zone border.
const sheenDamp = new Float32Array(N);
for (let p = 0; p < N; p++) sheenDamp[p] = 0.55;
const sheenDampSoft = boxBlurMasked(sheenDamp, W, H, isBg, 7, 2);

const baseRGBA = grayToRGBA(gray, W, H, isBg);
const highlight = buildHighlight(unit, W, H, isBg, { start: 0.72, gain: 0.3, damp: sheenDampSoft });

// BIL-2509 — the fold crests the multiply base had to clip at `ceiling` go onto
// the screen layer instead, where a highlight belongs and where it survives a
// dark swatch (multiply loses fine bright structure as the swatch darkens).
const FOLD_SHEEN_GAIN = 1.6;
for (let p = 0; p < N; p++) {
  if (isBg[p] || foldSheen[p] <= 0) continue;
  highlight[p] = Math.min(255, highlight[p] + foldSheen[p] * FOLD_SHEEN_GAIN);
}

// Carry the crease crests on the SCREEN layer too, so the drawing survives a
// dark swatch. Multiply runs in gamma space, so a fixed modulation in the base
// shrinks with the swatch's own value — measured on the Hose, fine structure
// lost ~60% of its bite between Creme and Marineblau. Screen is the exact
// complement (out = 1−(1−mul)(1−h), so ∂out/∂h = 1−mul), which means feeding the
// crests into the highlight adds contrast in proportion to what multiply lost.
// Only the positive half: screen cannot darken, and the valleys are already in
// the base.
const TEXTURE_SHEEN_GAIN = 2.4;
for (let p = 0; p < N; p++) {
  if (isBg[p]) continue;
  if (texture[p] > 0) highlight[p] = Math.min(255, highlight[p] + texture[p] * TEXTURE_SHEEN_GAIN);
}
const highlightRGBA = grayToRGBA(highlight, W, H, isBg);

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
  .webp({ quality: 86, alphaQuality: 90 })
  .toFile(path.join(OUT_DIR, "base.webp"));

await sharp(highlightRGBA, { raw: { width: W, height: H, channels: 4 } })
  .extract(extract)
  .resize({ width: TARGET_W })
  .webp({ quality: 80, alphaQuality: 90 })
  .toFile(path.join(OUT_DIR, "highlight.webp"));

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
