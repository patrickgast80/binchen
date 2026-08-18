/**
 * BIL-2499 — build the konfigurator assets for the short Pumphose "Dinos".
 *
 * Board order (Patrick, 2026-08-18): a sixth konfigurator on Sabine's own
 * cutout of the turquoise dino shorts, and — the one hard requirement — the
 * "made with love" label on the orange waistband must stay visible and
 * UNCHANGED in every fabric/colour combination.
 *
 * Outputs (all under public/konfigurator/hose-kurz-foto/):
 *   base.webp           — achromatic shading map on a transparent bg
 *   highlight.webp      — screen-blend sheen so dark tints keep a lit side
 *   mask-bund.webp      — waistband zone (label punched OUT)
 *   mask-hose.webp      — printed main body
 *   mask-buendchen.webp — the two leg cuffs
 *   label.webp          — the label in its ORIGINAL colours, alpha-cut
 *
 * How the label requirement is met — two independent layers of defence:
 *   1. The label is punched out of every recolour mask with a margin, so no
 *      multiply overlay can reach it.
 *   2. `label.webp` is drawn LAST, in normal blend mode, on top of the whole
 *      multiply/screen stack. Even if a mask ever leaked, the label pixels the
 *      visitor sees are still Sabine's original photo pixels.
 * That is why "exclusion zone" and not "keep it light": a light-kept region
 * under `multiply` still takes the swatch's hue.
 *
 * Segmentation is topological, not hand-placed:
 *   - Sabine's cutout is a JPEG with the editor's transparency CHECKERBOARD
 *     baked in, so the alpha comes from bil2490-checkerboard-normalize.mjs
 *     (keeps her scissor decisions — we do NOT re-segment, see BIL-2486).
 *   - waistband + the two leg cuffs are the three large ORANGE connected
 *     components; the orange dinosaurs printed on the body are an order of
 *     magnitude smaller and fall out on area.
 *   - the label is the HOLE inside the waistband component. No coordinates,
 *     no colour threshold — it survives a reshoot as long as the tag is still
 *     sewn onto the band.
 *
 * Shading follows the neutral-base pipeline v2 (main@7632368): median de-print
 * (the dino print has BOTH white ferns and dark motifs, so a max filter would
 * latch onto the ferns), zoned normalisation, synthesised gathers/rib, screen
 * sheen. Never blur to remove the pattern — that kills the folds too.
 *
 *   cd apps/storefront
 *   NODE_PATH=../../.pc-tmp/sharp-env/node_modules \
 *     node scripts/bil2499-build-dinoshorts-assets.mjs [--debug]
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
  applyEdgeShadow,
  applyGatherFolds,
  applyGrain,
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
import { applyRealFolds, foldsFromPhoto, spread } from "./lib/konfigurator-folds.mjs";
import { checkerboardToUniformCanvas } from "./bil2490-checkerboard-normalize.mjs";

const SRC =
  process.env.BIL2499_SRC ??
  "C:/Users/Besitzer/Desktop/bilulu/bilder bearbeitet/09712b22-56db-4f11-bfcf-c7d6830dfd1b.jpeg";
const OUT_DIR = "public/konfigurator/hose-kurz-foto";
const DEBUG = process.argv.includes("--debug");
await mkdir(OUT_DIR, { recursive: true });

// -- 1. Alpha from Sabine's cutout -------------------------------------------
const cut = await checkerboardToUniformCanvas(SRC);
const W = cut.w;
const H = cut.h;
const N = W * H;
const { data } = await sharp(SRC).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });

const isBg = new Uint8Array(N);
for (let p = 0; p < N; p++) isBg[p] = cut.alpha[p] ? 0 : 1;

// De-speckle the silhouette (BIL-2473): the per-pixel classification leaves
// pinholes and spurs that survive the downsample as a 1px transparent stripe
// cut through the hem, which reads as scissor work.
{
  const garment = new Uint8Array(N);
  for (let p = 0; p < N; p++) if (!isBg[p]) garment[p] = 1;
  const cleaned = smoothBinary(garment, W, H, { radius: 2, iterations: 1 });
  let filled = 0;
  let shaved = 0;
  for (let p = 0; p < N; p++) {
    if (cleaned[p] && isBg[p]) { isBg[p] = 0; filled++; }
    else if (!cleaned[p] && !isBg[p]) { isBg[p] = 1; shaved++; }
  }
  console.log("silhouette de-speckled — filled:", filled, "shaved:", shaved);
}

let garmentPx = 0;
for (let p = 0; p < N; p++) if (!isBg[p]) garmentPx++;
console.log("source", W, "x", H, "garment px", garmentPx);

// -- 2. Zones ----------------------------------------------------------------
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

/** Measured on the source: band/cuff orange sits at hue 20-30, sat > 0.7. */
const orange = new Uint8Array(N);
for (let p = 0; p < N; p++) {
  if (isBg[p]) continue;
  const i = p * 3;
  const { h, s, v } = hsv(data[i], data[i + 1], data[i + 2]);
  if (h >= 8 && h <= 45 && s > 0.55 && v > 0.45) orange[p] = 1;
}

function components(mask) {
  const comp = new Int32Array(N).fill(-1);
  const list = [];
  const stack = new Int32Array(N);
  for (let start = 0; start < N; start++) {
    if (!mask[start] || comp[start] >= 0) continue;
    const id = list.length;
    let sp = 0;
    stack[sp++] = start;
    comp[start] = id;
    let size = 0;
    let minX = W, maxX = -1, minY = H, maxY = -1, sumY = 0;
    while (sp > 0) {
      const p = stack[--sp];
      size++;
      const x = p % W;
      const y = (p - x) / W;
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
    list.push({ id, size, minX, maxX, minY, maxY, cy: sumY / size });
  }
  list.sort((a, b) => b.size - a.size);
  return { comp, list };
}

const { comp: orangeComp, list: orangeList } = components(orange);
// 2% of the garment. Measured margin: the cuffs are 3.1% and 3.3%, the largest
// printed orange dinosaur is 1.45% — a 2x gap, so this is not a tuned constant.
const MIN_ZONE_SHARE = 0.02;
const kept = orangeList.filter((c) => c.size >= garmentPx * MIN_ZONE_SHARE);
console.log(
  "orange zones kept:",
  kept.map((c) => `${(c.size / garmentPx * 100).toFixed(2)}% @y${Math.round(c.cy)}`).join(", "),
);
if (kept.length !== 3) {
  throw new Error(
    `expected 3 large orange components (waistband + 2 cuffs), got ${kept.length}. ` +
      "The source photo changed — re-check the hue window before shipping.",
  );
}

// The waistband is the topmost of the three; the other two are the leg cuffs.
const sortedByY = [...kept].sort((a, b) => a.cy - b.cy);
const bundComp = sortedByY[0];
const cuffComps = sortedByY.slice(1);
if (bundComp.size < cuffComps[0].size * 2) {
  throw new Error("topmost orange component is not clearly the waistband — check the segmentation");
}

const isBund = new Uint8Array(N);
const isCuff = new Uint8Array(N);
for (let p = 0; p < N; p++) {
  if (orangeComp[p] === bundComp.id) isBund[p] = 1;
  else if (cuffComps.some((c) => orangeComp[p] === c.id)) isCuff[p] = 1;
}

// -- 2b. The label: the hole inside the waistband ----------------------------
// Flood the waistband's bbox from its border across every non-waistband pixel;
// whatever the flood cannot reach is enclosed BY the waistband. The label is
// the only such hole of any size.
const isLabel = (() => {
  const x0 = Math.max(0, bundComp.minX - 1);
  const x1 = Math.min(W - 1, bundComp.maxX + 1);
  const y0 = Math.max(0, bundComp.minY - 1);
  const y1 = Math.min(H - 1, bundComp.maxY + 1);
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const outside = new Uint8Array(bw * bh);
  const stack = [];
  const push = (lx, ly) => {
    if (lx < 0 || ly < 0 || lx >= bw || ly >= bh) return;
    const li = ly * bw + lx;
    if (outside[li]) return;
    if (isBund[(y0 + ly) * W + (x0 + lx)]) return; // the band itself is the wall
    outside[li] = 1;
    stack.push(li);
  };
  for (let lx = 0; lx < bw; lx++) { push(lx, 0); push(lx, bh - 1); }
  for (let ly = 0; ly < bh; ly++) { push(0, ly); push(bw - 1, ly); }
  while (stack.length) {
    const li = stack.pop();
    const lx = li % bw;
    const ly = (li - lx) / bw;
    push(lx - 1, ly); push(lx + 1, ly); push(lx, ly - 1); push(lx, ly + 1);
  }

  const holes = new Uint8Array(N);
  for (let ly = 0; ly < bh; ly++) {
    for (let lx = 0; lx < bw; lx++) {
      if (outside[ly * bw + lx]) continue;
      const p = (y0 + ly) * W + (x0 + lx);
      if (!isBund[p]) holes[p] = 1;
    }
  }
  const { comp: holeComp, list: holeList } = components(holes);
  // Ignore pinholes in the JPEG; the tag is ~3k px on this source.
  const MIN_LABEL_PX = 600;
  const candidates = holeList.filter((c) => c.size >= MIN_LABEL_PX);
  if (candidates.length !== 1) {
    throw new Error(
      `expected exactly one enclosed patch inside the waistband (the "made with love" label), ` +
        `found ${candidates.length}. Refusing to ship a konfigurator that might recolour it.`,
    );
  }
  const c = candidates[0];
  let rs = 0, gs = 0, bs = 0, n = 0;
  const out = new Uint8Array(N);
  for (let p = 0; p < N; p++) {
    if (holeComp[p] !== c.id) continue;
    out[p] = 1;
    const i = p * 3;
    rs += data[i]; gs += data[i + 1]; bs += data[i + 2]; n++;
  }
  const avg = [rs / n, gs / n, bs / n].map(Math.round);
  console.log(`label: ${c.size}px bbox=${c.minX},${c.minY} ${c.maxX - c.minX + 1}x${c.maxY - c.minY + 1} avgRGB=${avg.join(",")}`);
  // Sanity: the woven tag is warm beige. A cold patch would mean the flood
  // found a gap in the band, not the label.
  if (!(avg[0] > avg[2] + 25)) {
    throw new Error(`enclosed patch is not warm-toned (avg ${avg.join(",")}) — that is not the label`);
  }
  return out;
})();

/** Grow a binary mask by `px` (4-connected), used for the label safety margin. */
function dilateBinary(mask, px) {
  let cur = Uint8Array.from(mask);
  for (let it = 0; it < px; it++) {
    const next = Uint8Array.from(cur);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = y * W + x;
        if (cur[p]) continue;
        if (
          (x > 0 && cur[p - 1]) || (x < W - 1 && cur[p + 1]) ||
          (y > 0 && cur[p - W]) || (y < H - 1 && cur[p + W])
        ) next[p] = 1;
      }
    }
    cur = next;
  }
  return cur;
}

/** Shrink a binary mask by `px` (4-connected). */
function erodeBinary(mask, px) {
  let cur = Uint8Array.from(mask);
  for (let it = 0; it < px; it++) {
    const next = Uint8Array.from(cur);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = y * W + x;
        if (!cur[p]) continue;
        if (
          (x > 0 && !cur[p - 1]) || (x < W - 1 && !cur[p + 1]) ||
          (y > 0 && !cur[p - W]) || (y < H - 1 && !cur[p + W])
        ) next[p] = 0;
      }
    }
    cur = next;
  }
  return cur;
}

// The recolour exclusion is the tag ERODED by 1px, and the paint layer is the
// tag itself — so the exclusion is strictly INSIDE the paint.
//
// The first version had it the other way round (exclusion 3px wider than the
// paint) and the zoomed evidence showed why that is wrong: the 3px ring was
// excluded from every mask, so it kept the neutral base grey and drew a visible
// grey outline around the tag on a cream waistband. Recolouring right up to
// (and 1px under) the tag and covering that with the tag itself leaves nothing
// untinted and no halo — while the tag pixels the visitor sees are still 100%
// original.
const labelExcl = erodeBinary(isLabel, 1);
const labelPaint = isLabel;

// Everything that is neither band, cuff nor label is the printed body.
const isHose = new Uint8Array(N);
for (let p = 0; p < N; p++) {
  if (isBg[p] || isBund[p] || isCuff[p] || labelExcl[p]) continue;
  isHose[p] = 1;
}
// Colour thresholds leave ragged zone borders (shadowed orange near a seam
// reads as body, and vice versa). Smooth the two orange zones, then rebuild the
// body as the complement so the three masks stay a partition with no gaps.
const bundSmooth = smoothBinary(isBund, W, H, { radius: 3, iterations: 1 });
const cuffSmooth = smoothBinary(isCuff, W, H, { radius: 3, iterations: 1 });
for (let p = 0; p < N; p++) {
  if (isBg[p]) continue;
  isBund[p] = bundSmooth[p] && !labelExcl[p] ? 1 : 0;
  isCuff[p] = cuffSmooth[p] && !isBund[p] && !labelExcl[p] ? 1 : 0;
  isHose[p] = !isBund[p] && !isCuff[p] && !labelExcl[p] ? 1 : 0;
}

// -- 3. Shading --------------------------------------------------------------
// Median de-print: the dino print carries WHITE ferns and DARK dinosaurs on a
// mid-tone turquoise, so a max filter would latch onto the ferns and a min
// filter onto the dinos. A median has neither problem — the motifs are a
// minority inside a large enough window.
const { data: deprinted } = await sharp(SRC)
  .rotate()
  .removeAlpha()
  .median(21)
  .raw()
  .toBuffer({ resolveWithObject: true });

// smooth 46: the largest dinosaurs are ~150px, too big for median 21 to erase
// outright, so the residue has to be blurred out. The shorts' own signal is a
// broad light gradient; the cloth drawing is re-synthesised below.
const illum = estimateIllumination(deprinted, W, H, isBg, { mode: "plain", smooth: 46, erode: 4 });

// Zoned: the orange band, the orange cuffs and the turquoise print are three
// different materials. A global stretch would bake their intrinsic lightness
// into the base, so picking Creme for band and body would still render two
// different creams.
// BIL-2509: the shadow floor was 172, i.e. the deepest crease could only darken
// the chosen swatch to 67%. On Sabine's photo the fold valleys and the tuck under
// the waistband go far deeper than that, which is the second reason the preview
// reads as a flat fill. 156 widens the range without reaching the muddy end —
// verified against the darkest swatch in the palette (stoff-30, #282838) rather
// than against a cream one, since multiply hurts dark fabrics most.
const SHADOW = 156;
const LIT = 252;
const ZONES = [isBund, isHose, isCuff];
const { gray, unit, stats } = normalizeShadingZoned(
  illum, W, H, isBg,
  ZONES,
  { shadow: SHADOW, lit: LIT },
);

// Stronger silhouette roll-off, same reason: a flat-lay garment turns away from
// the camera at its edge and the old 0.16 barely showed it.
applyEdgeShadow(gray, W, H, isBg, { radius: 22, strength: 0.24 });

// The measured spans here are 6 (band), 23 (body) and 34 (cuffs), i.e. every
// zone is below `minSpan` — worth knowing before touching that default, because
// it means the broad term carries very little contrast on this photo and the
// realism has to come from the fold term below, not from a wider stretch.
console.log("zone stretch (lo/hi/span):",
  JSON.stringify(stats.map((s) => (s ? { lo: s.lo, hi: s.hi, span: s.span } : null))));


// -- 3b. REAL folds from the photo (BIL-2509) ---------------------------------
// Everything above this line only ever produced a smooth balloon: `smooth: 46`
// is wide enough to erase the drape along with the dino print. Patrick's board
// note ("so wie im Originalbild, falten Schatten") is about exactly that.
//
// The waistband and the two cuffs are PLAIN orange jersey, so their real stretch
// creases can be measured straight off the photo — and they are the largest flat
// areas in the render Patrick complained about. The printed body cannot: at ~60%
// motif coverage every separation scale returns dinosaurs instead of folds
// (measured in scripts/bil2509-band-probe.mjs), so `foldsFromPhoto` gates it out
// on its own printiness measurement and the body keeps its synthetic drape.
// Trusted: the waistband (0) and the two leg cuffs (2) — both plain orange
// jersey, verified by dumping base.webp and looking at it. NOT the body (1):
// the dino print covers ~64% of it and every separation scale returns motifs
// (scripts/bil2509-band-probe.mjs), so it keeps the synthetic drape below.
const { detail: folds, zoneOk, printiness } = foldsFromPhoto(data, W, H, isBg, ZONES, {
  trustZones: [0, 2], zoneNames: ["bund", "hose", "buendchen"],
  fine: 5, broad: 46, maxPrint: 0.22,
});
["bund", "hose", "buendchen"].forEach((name, i) => {
  console.log(
    `zone ${name.padEnd(10)} printiness ${(printiness[i] * 100).toFixed(1)}% ` +
      `-> real folds ${zoneOk[i] ? "YES" : "no (synthetic drape kept)"}`,
  );
});
console.log(
  "recovered fold sigma — bund", spread(folds, isBund, isBg, N).toFixed(2),
  "hose", spread(folds, isHose, isBg, N).toFixed(2),
  "cuff", spread(folds, isCuff, isBg, N).toFixed(2),
);
if (!zoneOk[0]) {
  throw new Error(
    "the waistband measured as printed — it is plain orange jersey on this source, " +
      "so the zone segmentation or the source photo changed. Refusing to ship a flat band.",
  );
}
// `ceiling: 246` matches the seam-relief cap below, so a fold crest can never
// reach the value that renders as pure swatch colour under multiply.
const foldSheen = applyRealFolds(gray, folds, W, H, isBg, ZONES, stats, {
  shadow: SHADOW, lit: LIT, gain: 1.0, depth: 1.4, limit: 30, ceiling: 246,
});

// Cloth drawing, accumulated separately so it can also feed the screen layer.
//
// BIL-2509 splits this by zone, following the gate above. The BODY keeps its
// synthetic gathers at full strength (its real folds are unrecoverable under the
// dense print) and in fact gets a longer reach, because the photo shows the
// gather fan running much further down from the waistband than the old 74px.
// The BAND and CUFFS now carry their measured creases, so their synthetic rib is
// cut right back — stacking a periodic wale on top of real creases is what makes
// a waistband read as corduroy printed on latex (the BIL-2473 complaint).
const texture = new Float32Array(N);

const bundSeam = boundaryBetween(isBund, isHose, W, H, isBg);
const cuffSeam = boundaryBetween(isCuff, isHose, W, H, isBg);

// The body is gathered into BOTH the waistband above and the cuffs below, so it
// gets a crease fan from each seam.
applyGatherFolds(texture, W, H, isBg, isHose, bundSeam, {
  reach: 130, amp: 9.0, period: 34, jitter: 0.55, decay: 1.15, seed: 2499,
});
applyGatherFolds(texture, W, H, isBg, isHose, cuffSeam, {
  reach: 78, amp: 7.4, period: 28, jitter: 0.55, decay: 1.25, seed: 4991,
});

// Jersey rib. The waistband is a wide folded-over band stretched hard, so its
// creases are tighter than the body's; two octaves each, jittered — an even
// stripe reads as corduroy (BIL-2473).
applyRib(texture, W, H, isBund, { period: 40, amp: 1.5, fade: 12, knit: 0.3, jitter: 0.55, vary: 0.7, seed: 2499 });
applyRib(texture, W, H, isBund, { period: 15, amp: 0.8, fade: 12, knit: 0.45, jitter: 0.35, vary: 0.6, seed: 9942 });
applyRib(texture, W, H, isCuff, { period: 26, amp: 1.4, fade: 8, knit: 0.3, jitter: 0.55, vary: 0.7, seed: 2499 });
applyRib(texture, W, H, isHose, { period: 62, amp: 0.9, fade: 14, knit: 0.25, jitter: 0.6, vary: 0.7, seed: 1249 });

for (let p = 0; p < N; p++) if (!isBg[p]) gray[p] += texture[p];

// Seam relief. Both seams have the same geometry as the long Pumphose: the body
// ducks BEHIND the rolled band/cuff, so the occlusion sits on the body side and
// the fold highlight a few px inside the band. Capped below `lit` — a ridge that
// clips to 255 renders as a hairline of pure unshaded swatch under multiply.
for (const { seam, rolled } of [
  { seam: bundSeam, rolled: isBund },
  { seam: cuffSeam, rolled: isCuff },
]) {
  applySeamRelief(gray, W, H, isBg, { boundary: seam, shadowed: isHose, rolled }, {
    occlusion: { reach: 18, strength: 0.24, bias: 1.5, spill: 5 },
    ridge: { reach: 6, strength: 0.05, offset: 6 },
    falloff: { reach: 26, strength: 0.06 },
    ceiling: 246,
  });
}

applyGrain(gray, W, H, isBg, { amp: 3.0, cell: 2, seed: 2499 });

const sheenDamp = new Float32Array(N);
for (let p = 0; p < N; p++) sheenDamp[p] = 0.55;
const sheenDampSoft = boxBlurMasked(sheenDamp, W, H, isBg, 7, 2);

const baseRGBA = grayToRGBA(gray, W, H, isBg);
const highlight = buildHighlight(unit, W, H, isBg, { start: 0.72, gain: 0.3, damp: sheenDampSoft });
// Feed the crease crests into the screen layer as well, so the drawing survives
// a dark swatch (multiply loses fine structure as the swatch darkens).
const TEXTURE_SHEEN_GAIN = 2.4;
for (let p = 0; p < N; p++) {
  if (isBg[p]) continue;
  if (texture[p] > 0) highlight[p] = Math.min(255, highlight[p] + texture[p] * TEXTURE_SHEEN_GAIN);
}
// BIL-2509: the crests the multiply base had to clip (see applyRealFolds) are
// added here instead. This is where a fold highlight belongs anyway, and it is
// the only place it survives a dark swatch — under multiply a navy print eats
// fine bright structure, under screen it does not.
const FOLD_SHEEN_GAIN = 1.6;
for (let p = 0; p < N; p++) {
  if (isBg[p] || foldSheen[p] <= 0) continue;
  highlight[p] = Math.min(255, highlight[p] + foldSheen[p] * FOLD_SHEEN_GAIN);
}
const highlightRGBA = grayToRGBA(highlight, W, H, isBg);

// The label sits on top of everything, so neither the shading nor the sheen may
// touch it — otherwise the tag darkens/brightens with the rest of the band and
// "unchanged" stops being true.
for (let p = 0; p < N; p++) {
  if (!labelPaint[p]) continue;
  const o = p * 4;
  highlightRGBA[o] = 0; highlightRGBA[o + 1] = 0; highlightRGBA[o + 2] = 0;
}

// -- 4. Feather the zone borders --------------------------------------------
const maskBund = Buffer.alloc(N);
const maskHose = Buffer.alloc(N);
const maskCuff = Buffer.alloc(N);
for (let p = 0; p < N; p++) {
  if (isBg[p]) continue;
  if (isBund[p]) maskBund[p] = 255;
  else if (isCuff[p]) maskCuff[p] = 255;
  else if (isHose[p]) maskHose[p] = 255;
}

// 2px linear feather so the recolour seam does not ring. Never feather against
// the silhouette — that produces a translucent rim (BIL-2466). The label rim is
// held at 0 in every mask, so the feather cannot creep back over the tag.
for (let iter = 0; iter < 2; iter++) {
  const sB = Buffer.from(maskBund);
  const sH = Buffer.from(maskHose);
  const sC = Buffer.from(maskCuff);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      if (isBg[p] || labelExcl[p]) continue;
      const avg = (s) => (s[p] * 2 + s[p - 1] + s[p + 1] + s[p - W] + s[p + W]) / 6;
      const b = avg(sB);
      const c = avg(sC);
      const h = avg(sH);
      const sum = b + c + h;
      if (sum <= 0) continue;
      maskBund[p] = Math.round((b / sum) * 255);
      maskCuff[p] = Math.round((c / sum) * 255);
      maskHose[p] = 255 - maskBund[p] - maskCuff[p];
    }
  }
}
for (let p = 0; p < N; p++) {
  if (!labelExcl[p]) continue;
  maskBund[p] = 0;
  maskCuff[p] = 0;
  maskHose[p] = 0;
}

// -- 5. Label layer, alpha built separately -----------------------------------
// The colours are simply the source photo's — cropping happens through the
// alpha, so the tag keeps the exact pixels Sabine shot, including the way its
// edge blends into the band.
//
// The alpha is a hard binary mask that is resized and re-thresholded in its own
// pipeline, NOT feathered here. First attempt fed a pre-feathered RGBA through
// one resize+sharpen and the label came out with 164 fully transparent pixels
// in its INTERIOR — the resampler ringing on an alpha edge. Each of those is a
// pinhole the recolour shines through, which is exactly the failure the board
// asked to rule out (caught by scripts/bil2499-label-proof.mjs, not by looking
// at the picture: at 1:1 the pinholes are invisible).
const labelAlphaSrc = Buffer.alloc(N);
for (let p = 0; p < N; p++) labelAlphaSrc[p] = labelPaint[p] ? 255 : 0;

// -- 6. Crop to garment bbox + pad, encode -----------------------------------
let cropL = W, cropR = 0, cropT = H, cropB = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (isBg[y * W + x]) continue;
    if (x < cropL) cropL = x;
    if (x > cropR) cropR = x;
    if (y < cropT) cropT = y;
    if (y > cropB) cropB = y;
  }
}
const pad = Math.round(Math.max(cropR - cropL, cropB - cropT) * 0.02);
cropL = Math.max(0, cropL - pad);
cropR = Math.min(W - 1, cropR + pad);
cropT = Math.max(0, cropT - pad);
cropB = Math.min(H - 1, cropB + pad);
const extract = { left: cropL, top: cropT, width: cropR - cropL + 1, height: cropB - cropT + 1 };
console.log("crop", extract);

const TARGET_W = 900;

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

// The label is real photographic detail, unlike every other asset here (which
// are smooth fields), so it gets a mild sharpen to survive the 1.28x upscale
// and lossless webp so the stitched lettering stays readable.
{
  const { data: labelRGB, info } = await sharp(data, { raw: { width: W, height: H, channels: 3 } })
    .extract(extract)
    .resize({ width: TARGET_W, kernel: "lanczos3" })
    .sharpen({ sigma: 0.7 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // `toColourspace("b-w")` is load-bearing: without it sharp promotes a
  // 1-channel raw input to 3-channel sRGB on output, the buffer comes back 3x
  // too long, and reading it as 1 channel puts the tag at a third of its true
  // scale in the wrong corner.
  const { data: alphaResized, info: alphaInfo } = await sharp(labelAlphaSrc, {
    raw: { width: W, height: H, channels: 1 },
  })
    .extract(extract)
    .resize({ width: TARGET_W, height: info.height })
    .toColourspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (alphaInfo.channels !== 1 || alphaResized.length !== info.width * info.height) {
    throw new Error(`label alpha came back as ${alphaInfo.channels}ch / ${alphaResized.length}b`);
  }

  // Re-threshold with a narrow ramp: everything the resampler left above 176 is
  // solidly inside the tag and becomes fully opaque, everything below 80 is
  // outside. The ~1px ramp between is what keeps the tag from sitting on the
  // band with a stair-stepped edge.
  const alpha = Buffer.alloc(alphaResized.length);
  for (let i = 0; i < alphaResized.length; i++) {
    const v = alphaResized[i];
    alpha[i] = v >= 176 ? 255 : v <= 80 ? 0 : Math.round(((v - 80) / 96) * 255);
  }

  await sharp(labelRGB, { raw: { width: info.width, height: info.height, channels: 3 } })
    .joinChannel(alpha, { raw: { width: info.width, height: info.height, channels: 1 } })
    .webp({ lossless: true })
    .toFile(path.join(OUT_DIR, "label.webp"));

  let opaque = 0;
  for (let i = 0; i < alpha.length; i++) if (alpha[i] === 255) opaque++;
  console.log("label layer:", info.width, "x", info.height, "opaque px", opaque);
}

// Masks are resized together and then re-normalised so that their union is a
// HARD silhouette while the base keeps its soft one.
//
// Why: this source is 732px wide and the assets are 900, so every mask edge is
// UPSCALED and its alpha ramp is over a pixel wide. Resized independently, the
// three masks sum to well under 255 along the garment contour — those pixels
// keep the neutral base grey and, on a light swatch, trace the whole garment
// with a grey outline (visible in the all-cream evidence render). Forcing the
// union to 255 wherever the garment is present means the contour is tinted
// like everything else; the cut is kept at 40/255 rather than 1 so the mask
// never reaches past the base's own alpha and paints colour into the backdrop
// (the failure mode behind "never feather a mask against the silhouette").
const UNION_CUT = 40;
async function resizeMask(buf) {
  const rgba = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) rgba[i * 4 + 3] = buf[i];
  const { data: out, info } = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .extract(extract)
    .resize({ width: TARGET_W })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { out, info };
}

{
  const [b, h, c] = await Promise.all([resizeMask(maskBund), resizeMask(maskHose), resizeMask(maskCuff)]);
  const { width: mw, height: mh } = b.info;
  const px = mw * mh;
  const names = ["mask-bund.webp", "mask-hose.webp", "mask-buendchen.webp"];
  const chans = [b.out, h.out, c.out];
  const outs = chans.map(() => Buffer.alloc(px * 4));
  let hardened = 0;
  for (let i = 0; i < px; i++) {
    const a = [chans[0][i * 4 + 3], chans[1][i * 4 + 3], chans[2][i * 4 + 3]];
    const sum = a[0] + a[1] + a[2];
    if (sum < UNION_CUT) continue; // outside the garment — stays fully transparent
    if (sum < 255) hardened++;
    for (let k = 0; k < 3; k++) outs[k][i * 4 + 3] = Math.round((a[k] / sum) * 255);
  }
  console.log("mask union hardened on", hardened, "contour px");
  await Promise.all(
    outs.map((rgba, k) =>
      sharp(rgba, { raw: { width: mw, height: mh, channels: 4 } })
        .webp({ quality: 60, alphaQuality: 100 })
        .toFile(path.join(OUT_DIR, names[k])),
    ),
  );
}

const meta = await sharp(path.join(OUT_DIR, "base.webp")).metadata();
console.log("base.webp", meta.width, "x", meta.height, "— put these in _shared/registry.ts");

if (DEBUG) {
  const dbg = Buffer.alloc(N * 3);
  for (let p = 0; p < N; p++) {
    const i = p * 3;
    if (isBg[p]) { dbg[i] = data[i]; dbg[i + 1] = data[i + 1]; dbg[i + 2] = data[i + 2]; }
    else if (labelExcl[p]) { dbg[i] = 255; dbg[i + 1] = 255; dbg[i + 2] = 0; }
    else if (isBund[p]) { dbg[i] = 220; dbg[i + 1] = 40; dbg[i + 2] = 40; }
    else if (isCuff[p]) { dbg[i] = 40; dbg[i + 1] = 200; dbg[i + 2] = 60; }
    else { dbg[i] = 40; dbg[i + 1] = 80; dbg[i + 2] = 220; }
  }
  await sharp(dbg, { raw: { width: W, height: H, channels: 3 } })
    .extract(extract)
    .png()
    .toFile(path.join(OUT_DIR, "debug-zones.png"));
  console.log("debug-zones.png written");
}
