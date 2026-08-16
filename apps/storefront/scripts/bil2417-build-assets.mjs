/**
 * Preprocess pumphose-05.jpg into the assets the Foto-Konfigurator needs.
 *
 * Outputs (all under public/konfigurator/hose-foto/):
 *   base.webp        — achromatic shading map of the pants on a transparent bg:
 *                      fold gradients, edge occlusion, seam valleys and jersey
 *                      grain, but no colour and no print.
 *   highlight.webp   — faint sheen, composited with `mix-blend-mode: screen`
 *                      so dark tints keep a lit side.
 *   mask-bund.webp   — alpha mask for the waistband zone
 *   mask-hose.webp   — alpha mask for the main body zone
 *   mask-buendchen.webp — alpha mask for the leg cuffs zone
 *
 * The masks are white (255) inside their zone, transparent elsewhere. In the
 * browser they are used as CSS `mask-image` for coloured overlays with
 * `mix-blend-mode: multiply`, so the base's shading comes through the tint.
 *
 * BIL-2461, second pass — what changed and why
 * --------------------------------------------
 * The first pass made the base "farb- und musterlos" by blurring the photo and
 * squeezing it into a 220..250 ramp. Board rejected the result: with 30 levels
 * of shading left and straight horizontal zone cuts, the preview rendered as
 * three flat colour bands. Two root causes, both fixed here:
 *
 *  1. SHADING. `blur(28)` averages the print INTO the fabric, so the only way
 *     to hide it afterwards was to crush the contrast. Instead we now estimate
 *     illumination with a MAX FILTER (see lib/konfigurator-shading.mjs): the
 *     print is dark motifs on light fabric, so the locally brightest pixel is
 *     unprinted fabric. That removes the pattern completely while KEEPING the
 *     full fold structure, which then gets a real dynamic range.
 *
 *  2. ZONE SHAPE. Waistband and cuffs were cut with two hardcoded Y constants,
 *     which is why the bands ran dead straight across the garment. The real
 *     waistband has a curved hem and the two leg cuffs sit at different heights
 *     and angles. Both are now segmented by COLOUR — the waistband is the large
 *     print-free (locally desaturated) region up top, the cuffs are the solid
 *     pink components at the bottom — then contour-smoothed, so every seam
 *     follows the actual garment.
 *
 * BIL-2470, third pass — the Bündchen edge
 * ----------------------------------------
 * Board repro against BIL-2461's own criterion #2 ("dezente Naht-/Schattenlinie
 * an der Trennstelle, damit es wie ein echtes Kleidungsstück liest"): the hem
 * still read as a drawn outline. Measured against the reference photo, four
 * things were wrong, all fixed below at their marked sections:
 *
 *  1. The seam was a SYMMETRIC valley. A real cuff hem is dark on the body side
 *     (gathered fabric tucks in behind), bright on the fold, then falls away.
 *  2. The body above the hem had NO gathers, so nothing showed that the fabric
 *     is sewn into a shorter cuff.
 *  3. A dark outline traced every cuff, because the anti-aliased silhouette rim
 *     failed the colour threshold and got measured as body fabric.
 *  4. The illumination was estimated once for the whole garment, so the 44 px
 *     max window bled body brightness into a frame around each cuff.
 *
 * Rerun this script whenever the source photo changes:
 *   cd apps/storefront && node scripts/bil2417-build-assets.mjs [--debug]
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
  distanceFrom,
  erodeMask,
  estimateIllumination,
  extendInto,
  grayToRGBA,
  maxFilter,
  normalizeShadingZoned,
  smoothBinary,
  smoothContour,
} from "./lib/konfigurator-shading.mjs";

const SRC = "public/products/pumphose/pumphose-05.jpg";
const OUT_DIR = "public/konfigurator/hose-foto";
const DEBUG = process.argv.includes("--debug");
await mkdir(OUT_DIR, { recursive: true });

const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const N = W * H;

// -- 1. Background flood-fill from the image border -------------------------
// The BIL-2455 photo rebuild set a uniform studio backdrop. Sample the actual
// border colour (rather than assume white) and flood only across pixels within
// a tight RGB delta of it. The pumphose-05 shot has TWO bg tones — a grey
// vignette (~200) at the outer border AND near-white in the concavity between
// the legs — so both must qualify, else the flood leaves interior pockets.
let brSum = 0, bgSum = 0, bbSum = 0, bnSamples = 0;
for (let x = 0; x < W; x++) {
  for (const y of [0, H - 1]) {
    const i = (y * W + x) * 3;
    brSum += data[i]; bgSum += data[i + 1]; bbSum += data[i + 2]; bnSamples++;
  }
}
const bgR = brSum / bnSamples;
const bgG = bgSum / bnSamples;
const bgB = bbSum / bnSamples;
console.log("border colour ~", bgR.toFixed(1), bgG.toFixed(1), bgB.toFixed(1));

const BG_DELTA = 18;
const bgCandidate = new Uint8Array(N);
for (let p = 0; p < N; p++) {
  const i = p * 3;
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const nearBorder =
    Math.abs(r - bgR) < BG_DELTA &&
    Math.abs(g - bgG) < BG_DELTA &&
    Math.abs(b - bgB) < BG_DELTA;
  const nearWhite = r > 240 && g > 240 && b > 240;
  if (nearBorder || nearWhite) bgCandidate[p] = 1;
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

// Keep only the largest garment component so JPEG speckle near the studio edge
// does not survive into the masks as loose fragments.
keepLargestGarmentComponent();

// BIL-2473: de-speckle the silhouette itself.
//
// The flood-fill test is per-pixel, so along an edge where the garment fades
// into the backdrop it accepts and rejects neighbouring pixels more or less at
// random. That leaves single-pixel pinholes and spurs on the contour, and after
// the 997→900 downsample they survive as a NON-MONOTONIC alpha ramp: sampled on
// the shipped base.webp down the right cuff's lower edge (x=753) the alpha ran
// 246, 4, 110, 189, 0, 7 — a fully transparent row sitting inside the garment,
// i.e. a 1 px white pinstripe cut through the hem. That, and not the tint, is
// what makes the edge read as scissor work.
//
// A radius-2 blur + 50% re-threshold is a cheap open+close: it fills the
// pinholes and shaves the spurs while leaving the real contour where it is.
{
  const garment = new Uint8Array(N);
  for (let p = 0; p < N; p++) if (!isBg[p]) garment[p] = 1;
  const cleaned = smoothBinary(garment, W, H, { radius: 2, iterations: 1 });
  let filled = 0, shaved = 0;
  for (let p = 0; p < N; p++) {
    if (cleaned[p] && isBg[p]) { isBg[p] = 0; filled++; }
    else if (!cleaned[p] && !isBg[p]) { isBg[p] = 1; shaved++; }
  }
  console.log("silhouette de-speckled — pinholes filled:", filled, "spurs shaved:", shaved);
}

// -- 2. Zone segmentation by colour -----------------------------------------
// Saturation, and its local maximum. The printed body fabric always has a
// saturated motif within ~14 px; the plain waistband never does. That is the
// discriminator, and it is far more robust than a luminance threshold because
// the print's white ground is just as bright as the waistband.
const sat = new Float32Array(N);
for (let p = 0; p < N; p++) {
  if (isBg[p]) continue;
  const i = p * 3;
  const r = data[i], g = data[i + 1], b = data[i + 2];
  sat[p] = Math.max(r, g, b) - Math.min(r, g, b);
}
// BIL-2473: radius 30 / threshold 18, was 14 / 24.
//
// This is the "schlampig ausgeschnitten" half of the board's second rejection.
// The print on pumphose-05 is sparse watercolour motifs on a white ground, so a
// 14 px window centred in one of the larger white gaps just below the waistband
// finds no saturated pixel either — those gaps passed the test, joined the
// waistband component, and the hem smoothing then dragged the zone down over
// them. Result: a waistband whose lower edge scalloped ~70 px into the body and
// stair-stepped out sideways past the real band on both hips.
//
// A window wide enough to always contain a motif fixes it at the source.
// Measured on the largest connected component, per-column lower edge (source
// px, the true hem sits at y≈247):
//
//   r=14 thr=24   p50=316  p90=346  max=358   150 columns >12 px past a robust
//                                             hem fit          ← shipped state
//   r=30 thr=18   p50=239  p90=249  max=316    38 columns      ← this
//
// The cost is that a 30 px window also sees the print from up to 30 px inside
// the real hem, so the bottom-most sliver of waistband drops out of the
// candidate. `smoothContour` puts it back: it fills each column from the zone's
// top down to the SMOOTHED hem curve, and that curve now sits on the real hem
// instead of 70 px below it.
const localSat = maxFilter(sat, W, H, isBg, 30);

// Waistband: print-free region in the upper part of the garment.
const bundCandidate = new Uint8Array(N);
for (let p = 0; p < N; p++) {
  if (isBg[p]) continue;
  const y = (p / W) | 0;
  if (y < H * 0.44 && localSat[p] < 18) bundCandidate[p] = 1;
}
const bundParts = largestComponents(bundCandidate, 1, 4000);
bundParts.forEach(holeFill);

// Leg cuffs: solid dusty-pink components low in the garment. Measured on the
// source: cuff pixels sit around (215,167,167)…(232,192,193), so r−g ≈ 40..48.
// The print's pink motifs reach r−g ≈ 25 but are small isolated blobs, hence
// the size floor and the two-component cap (one cuff per leg).
const buenCandidate = new Uint8Array(N);
for (let p = 0; p < N; p++) {
  if (isBg[p]) continue;
  const y = (p / W) | 0;
  if (y < H * 0.6) continue;
  const i = p * 3;
  const r = data[i], g = data[i + 1], b = data[i + 2];
  if (r - g > 26 && r - b > 16) buenCandidate[p] = 1;
}
const buenParts = largestComponents(buenCandidate, 2, 4000);
buenParts.forEach(holeFill);

// -- 3. Turn each ragged zone contour into a real hem ------------------------
// This is the "sauberere Stoff-Abtrennung" half of the ticket. Each cuff is
// smoothed on its own so the left and right leg keep their genuinely different
// heights and angles — the previous straight-Y cut is exactly what made the
// preview look like flat colour bands.
const isBund = union(
  bundParts.map((z) => smoothContour(z, W, H, isBg, { edge: "bottom", median: 121, mean: 81 })),
);
// Wider windows on the cuffs: the sewn-in "made with love" label sits right
// above the right cuff and is pink enough to join the component, which would
// otherwise leave a stair-step in the hem.
const isBuen = union(
  buenParts.map((z) => smoothContour(z, W, H, isBg, { edge: "top", median: 181, mean: 121 })),
);
// Resolve any overlap deterministically; cuffs win (they are the tighter fit).
for (let p = 0; p < N; p++) if (isBuen[p]) isBund[p] = 0;

// BIL-2470: give each knit zone the anti-aliased rim it loses at the silhouette.
//
// Zone segmentation keys on colour (r−g > 26 for the dusty-pink cuffs), but the
// JPEG's silhouette rim blends cuff into the grey backdrop, so the outermost
// 3-12 px of every cuff falls under that threshold and lands in the body zone.
// Leaving it there cost twice over: the rim was tinted with the HOSE colour — a
// cream halo tracing a pink cuff on any two-colour design — and its luminance
// sits ~25 levels below real body fabric, so the body's percentile stretch
// floored it to `shadow`, drawing a hard dark outline around every cuff. That
// outline is a good part of why the board reads the hem as a drawn stroke.
//
// It cannot be repaired downstream either: interpolation has nothing to pull
// from, since the rim is bounded by the backdrop on one side and the cuff on
// the other. So it is reassigned here, before anything is measured.
absorbSilhouetteRim();

// -- 4. Build the achromatic shading base -----------------------------------
// radius 44 exceeds the largest watercolour motif in this print; anything
// smaller leaves the flower centres behind as gray stains on the base.
// smooth 40 is deliberately heavy: this is a flat-lay studio shot, so the only
// honest large-scale signal is the broad drape gradient. Leaving mid-frequency
// detail in just resurrects the print as cloudy blotches that read as dirt.
// The convincing depth cues are added explicitly below instead.
//
// BIL-2470: estimated PER ZONE, not once over the whole garment. The max filter
// only ever sees pixels of its own zone, for two reasons:
//
//  * Bleed. A 44 px max window centred inside a cuff, but within 44 px of the
//    cuff's border, also sees the brighter body fabric — so it lifted a 44 px
//    frame around each cuff and left the interior darker. After the per-zone
//    percentile stretch that step became a hard-cornered rectangle inset inside
//    the cuff, reading as a second panel sewn on. Restricting the window to the
//    zone removes it at the source.
//  * Only the body is printed. The waistband and the cuffs are plain jersey and
//    rib, so a max filter there buys nothing and actively costs detail — it
//    fills the rib valleys in with the neighbouring wale crests. They get the
//    plain (lightly smoothed) luminance instead, which keeps their real
//    photographic structure.
const zoneIllum = (zone, opts) => {
  const zoneBg = new Uint8Array(N);
  for (let p = 0; p < N; p++) if (isBg[p] || !zone[p]) zoneBg[p] = 1;
  return estimateIllumination(data, W, H, zoneBg, opts);
};
const bodyMask = new Uint8Array(N);
for (let p = 0; p < N; p++) if (!isBg[p] && !isBund[p] && !isBuen[p]) bodyMask[p] = 1;

// The knit zones are smoothed hard on purpose. They carry two things worth
// keeping — the broad dome of a tube lit from the front, and the drape of the
// waistband — and one thing worth losing: the crisp inner fold edge of the
// folded-over cuff, which the per-zone percentile stretch below amplifies from
// a ~10-level difference in the photo into a ~40-level step that reads as a
// lighter panel stitched onto the cuff. Smoothing also shrinks each zone's own
// p5..p95 span below `minSpan`, so the stretch self-limits and the zones stay
// gentle without having to detune the body.
// The body estimate additionally ignores a 12 px collar around each knit zone.
// `smoothContour` turns the segmented hem into a smooth curve, which necessarily
// leaves a thin ring of genuinely cuff-coloured pixels on the body side of the
// line. Those sit at luminance ~176-184 while real body fabric is ~203-233, so
// the body's own percentile stretch floored them at `shadow` — a hard black rim
// tracing every cuff and the waistband. (It was always there; the old whole-
// garment max filter bled body brightness over it and hid it.) Estimating
// without the collar and then extending the field back out inpaints the ring
// from real body fabric instead of measuring cuff pixels as if they were body.
const knitCollar = erodeMask(union([isBund, isBuen]), W, H, 12);
const bodyCore = new Uint8Array(N);
for (let p = 0; p < N; p++) if (bodyMask[p] && !knitCollar[p]) bodyCore[p] = 1;

const bodyCoreBg = new Uint8Array(N);
for (let p = 0; p < N; p++) if (!bodyCore[p]) bodyCoreBg[p] = 1;
const bodyMaskBg = new Uint8Array(N);
for (let p = 0; p < N; p++) if (!bodyMask[p]) bodyMaskBg[p] = 1;

const illumBody = extendInto(
  zoneIllum(bodyCore, { radius: 44, smooth: 40, erode: 4 }),
  bodyCoreBg, bodyMaskBg, W, H, 20,
);
const illumBund = zoneIllum(isBund, { mode: "plain", smooth: 30, erode: 3 });
const illumBuen = zoneIllum(isBuen, { mode: "plain", smooth: 24, erode: 3 });

const illum = new Float32Array(N);
for (let p = 0; p < N; p++) {
  if (isBg[p]) continue;
  illum[p] = isBund[p] ? illumBund[p] : isBuen[p] ? illumBuen[p] : illumBody[p];
}
// Zoned, not global: the waistband is white jersey, the body is printed and
// the cuffs are dusty pink, so a single stretch would bake those three
// material lightnesses into the base and the same swatch would render as three
// different colours. lit=252 means a lit area shows the chosen swatch at ~99%
// of its own colour, which is what "die Stoffe werden nicht beeinflusst" needs;
// shadow=178 keeps the drape readable without greying a light cream out.
const { gray, unit } = normalizeShadingZoned(
  illum, W, H, isBg,
  [isBund, isBuen, invertZones(isBund, isBuen)],
  { shadow: 178, lit: 252 },
);

applyEdgeShadow(gray, W, H, isBg, { radius: 16, strength: 0.16 });

// boundaryBetween thresholds at 127, so scale the binary zones to 0/255 first.
const body255 = invertZones(isBund, isBuen);
const bund255 = scale255(isBund);
const buen255 = scale255(isBuen);
const boundBundHose = boundaryBetween(bund255, body255, W, H, isBg);
const boundBuenHose = boundaryBetween(buen255, body255, W, H, isBg);
const seamSeed = new Uint8Array(N);
for (let p = 0; p < N; p++) if (boundBundHose[p] || boundBuenHose[p]) seamSeed[p] = 1;

// -- 4b. BIL-2470: make the Bündchen edge read as a seam, not as an outline ---
// Board repro on BIL-2461's own criterion #2 ("dezente Naht-/Schattenlinie an
// der Trennstelle, damit es wie ein echtes Kleidungsstück liest"): the previous
// symmetric `applySeamShadow` valley rendered as a flat 1-2 px stroke and the
// fabric on either side of it was dead flat, so the hem looked drawn on.
// Compared against the reference photo the transition needs three things, in
// this order (each helper is documented in lib/konfigurator-shading.mjs):
const bodyZone = bodyMask;

//  (a) volume. Deliberately NOT synthesised. A cuff wraps a leg, so it is lit
//      centrally and falls off at its borders — but the source photo already
//      carries exactly that (visible on pumphose-05.jpg with the cuff greyscaled
//      and contrast-stretched), and the per-zone illumination above now keeps
//      it instead of letting the max filter flatten it. Adding a synthetic roll
//      on top double-counted the same physical effect and turned the cuff's soft
//      volume into a hard-edged rectangle inset. The photo's own shading wins.

//  (b) the surplus body width gathered into the shorter cuff. The waistband
//      takes a wider, shallower fan (it is a longer, gentler hem); the leg
//      cuffs gather hard over a short span, so tighter spacing and more depth.
applyGatherFolds(gray, W, H, isBg, bodyZone, boundBundHose, {
  reach: 110, amp: 11, period: 38, jitter: 0.5, decay: 1.5, seed: 2470,
});
applyGatherFolds(gray, W, H, isBg, bodyZone, boundBuenHose, {
  reach: 84, amp: 13, period: 27, jitter: 0.6, decay: 1.3, seed: 2471,
});

//  (c) the asymmetric hem itself: occlusion where the body tucks in behind the
//      cuff, a narrow bright ridge on the rolled fold, then a soft falloff.
//
//      BIL-2473 retune. The shipped values put the bright fold peak at distance
//      0 — directly against the dark occlusion on the other side of the same
//      pixel — and the multiply clipped it to 255, which under the browser's
//      `mix-blend-mode: multiply` is the swatch at full saturation. Sampling the
//      shipped base.webp down a column through the waistband hem (x=450) gave
//      `... 243 250 255 | 167 182 182 ...`: a blown white pixel butted against
//      an 88-level cliff. That is a drawn outline by any measure, and it is the
//      single most literal match for the board's "wie mit Photoshop".
//      The reference photo has no such ridge — across the left cuff it reads
//      body 205 → 151 → 190, i.e. dark line ON the join and the cuff simply a
//      little darker than the body. So: shadow straddles the seam (`spill`), the
//      fold highlight moves a few px into the cuff and drops to a third of its
//      strength, and nothing may reach the `lit` ceiling any more.
applySeamRelief(gray, W, H, isBg, { boundary: boundBuenHose, shadowed: bodyZone, rolled: isBuen }, {
  occlusion: { reach: 22, strength: 0.30, bias: 1.4, spill: 6 },
  ridge: { reach: 6, strength: 0.05, offset: 7 },
  falloff: { reach: 30, strength: 0.06 },
  ceiling: 246,
});
applySeamRelief(gray, W, H, isBg, { boundary: boundBundHose, shadowed: bodyZone, rolled: isBund }, {
  occlusion: { reach: 20, strength: 0.26, bias: 1.5, spill: 5 },
  ridge: { reach: 5, strength: 0.04, offset: 6 },
  falloff: { reach: 26, strength: 0.05 },
  ceiling: 246,
});

// Knit ribbing on the two elasticated zones — the strongest single cue that
// these are Bündchen and not just differently-coloured rectangles. `knit`
// shapes the wale cross-section (broad ridge, narrow deep valley); the plain
// sine it replaces survived the 1200→900 downsample as a faint corduroy hatch.
// Period stays well above the 1200→900 Nyquist limit (12 px source ≈ 9 px
// delivered) — at period 8 the wales aliased into a moiré across the cuff. The
// waistband is smooth jersey on the reference photo, not rib, so it only gets
// enough structure to separate it from the body, not a visible wale pattern.
const preKnit = Float32Array.from(gray);

applyRib(gray, W, H, isBuen, { period: 12, amp: 4.5, fade: 7, knit: 0.85, jitter: 0.12, vary: 0.3, seed: 2473 });

// BIL-2473 — the waistband. `amp: 1.8` at 900 px delivery is roughly one level
// of modulation and is not visible at all: measured on the shipped assets, mean
// |ΔL*| between pixels 3 px apart was 0.72 in the Bund against 1.58 in the
// Bündchen. With no texture left, the only structure on the zone was the broad
// screen-blended sheen, so it rendered as a lacquered surface — the board's
// "glatte, glänzende Fläche". (Note this was never colour-dependent: the same
// measurement across all 12 swatches gives σ(L*) 8.3 for Creme and 8.7 for
// Petrol. Petrol was simply the default, so it is what the board looked at.)
//
// The band really is smooth jersey, not rib, so the fix is not a wale pattern:
// it is the irregular vertical STRETCH CREASES an elasticated band puts in
// jersey. Two octaves — broad wandering creases plus a fine jersey structure —
// with jitter/vary on both so neither reads as corduroy.
applyRib(gray, W, H, isBund, { period: 52, amp: 5.0, fade: 10, knit: 0.25, jitter: 0.55, vary: 0.7, seed: 2473 });
applyRib(gray, W, H, isBund, { period: 17, amp: 1.9, fade: 10, knit: 0.4, jitter: 0.35, vary: 0.6, seed: 8419 });

// Isolated before the grain is added — the sheen compensation below wants the
// structured wale crests, not the per-pixel noise.
const knitCrest = new Float32Array(N);
for (let p = 0; p < N; p++) knitCrest[p] = Math.max(0, gray[p] - preKnit[p]);

applyGrain(gray, W, H, isBg, { amp: 3.2, cell: 2, seed: 2417 });

// BIL-2473 — damp the sheen over the knit zones. The sheen exists so dark tints
// keep a lit side (see buildHighlight), and it still does that on the body. On
// the two knit zones it was the dominant signal and read as specular gloss;
// now that they carry their own crease structure they need much less of it.
// Blurred so the sheen does not step at the zone border.
const sheenDamp = new Float32Array(N);
for (let p = 0; p < N; p++) sheenDamp[p] = isBund[p] || isBuen[p] ? 0.5 : 1;
const sheenDampSoft = boxBlurMasked(sheenDamp, W, H, isBg, 7, 2);

const baseRGBA = grayToRGBA(gray, W, H, isBg);
const highlight = buildHighlight(unit, W, H, isBg, { start: 0.72, gain: 0.3, damp: sheenDampSoft });

// BIL-2473 — carry the knit texture on the SCREEN layer as well, so it survives
// a dark tint. This is the part of the ticket's "farbabhängiger Rendering-Bug"
// that turned out to be real.
//
// The base is multiplied by the swatch, and multiply happens in gamma space, so
// a fixed modulation in the base shrinks with the swatch's own value. Measured
// as mean |ΔL*| between pixels 3 px apart inside the Bündchen: Creme 1.54,
// Petrol 1.09, Marineblau 0.60 — the rib really does lose ~60% of its bite on
// the darkest swatches. (Broad shading survives fine, σ(L*) only moves 7.3→5.7,
// which is why the ticket's "texture disappears at saturated colours" reproduced
// on fine structure but not on the drape.)
//
// Screen is the exact complement: out = 1-(1-mul)(1-h), so ∂out/∂h = 1-mul is
// LARGEST where the tint is darkest. Feeding the wale crests into the highlight
// asset therefore adds contrast in proportion to how much the multiply path
// lost. Only the positive half goes in — screen cannot darken, and the valleys
// are already carried by the base.
const KNIT_SHEEN_GAIN = 2.4;
for (let p = 0; p < N; p++) {
  if (isBg[p] || !(isBund[p] || isBuen[p])) continue;
  highlight[p] = Math.min(255, highlight[p] + knitCrest[p] * KNIT_SHEEN_GAIN);
}
const highlightRGBA = grayToRGBA(highlight, W, H, isBg);

// -- 5. Masks with a 2 px feather -------------------------------------------
const maskBund = featherMask(isBund);
const maskBuen = featherMask(isBuen);
const maskHose = Buffer.alloc(N);
for (let p = 0; p < N; p++) {
  if (isBg[p]) continue;
  maskHose[p] = Math.max(0, 255 - maskBund[p] - maskBuen[p]);
}

// -- 6. Crop to garment bbox + pad, encode ----------------------------------
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

async function saveRGBA(buf, name, quality = 86) {
  await sharp(buf, { raw: { width: W, height: H, channels: 4 } })
    .extract(extract)
    .resize({ width: TARGET_W })
    .webp({ quality, alphaQuality: 90 })
    .toFile(path.join(OUT_DIR, name));
}
async function saveMask(buf, name) {
  const rgba = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) rgba[i * 4 + 3] = buf[i];
  await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .extract(extract)
    .resize({ width: TARGET_W })
    .webp({ quality: 60, alphaQuality: 100 })
    .toFile(path.join(OUT_DIR, name));
}

await saveRGBA(baseRGBA, "base.webp");
await saveRGBA(highlightRGBA, "highlight.webp", 80);
await saveMask(maskBund, "mask-bund.webp");
await saveMask(maskHose, "mask-hose.webp");
await saveMask(maskBuen, "mask-buendchen.webp");

if (DEBUG) {
  const dbg = Buffer.alloc(N * 3);
  for (let p = 0; p < N; p++) {
    const i = p * 3;
    if (isBg[p]) { dbg[i] = 235; dbg[i + 1] = 235; dbg[i + 2] = 235; }
    else if (isBund[p]) { dbg[i] = 40; dbg[i + 1] = 140; dbg[i + 2] = 220; }
    else if (isBuen[p]) { dbg[i] = 220; dbg[i + 1] = 60; dbg[i + 2] = 60; }
    else { dbg[i] = 240; dbg[i + 1] = 190; dbg[i + 2] = 60; }
  }
  await sharp(dbg, { raw: { width: W, height: H, channels: 3 } })
    .resize({ width: 800 }).png().toFile(path.join(OUT_DIR, "debug-zones.png"));
  console.log("debug zone map written");
}

const meta = await sharp(path.join(OUT_DIR, "base.webp")).metadata();
console.log("base.webp", meta.width, "x", meta.height);
console.log("wrote", OUT_DIR, "at", TARGET_W, "px wide");

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function keepLargestGarmentComponent() {
  const label = new Int32Array(N);
  const q = new Int32Array(N);
  let next = 0, best = 0, bestSize = 0;
  for (let seed = 0; seed < N; seed++) {
    if (isBg[seed] || label[seed]) continue;
    next++;
    let size = 0, h = 0, t = 0;
    label[seed] = next;
    q[t++] = seed;
    while (h < t) {
      const p = q[h++];
      size++;
      const x = p % W, y = (p / W) | 0;
      if (x > 0 && !isBg[p - 1] && !label[p - 1]) { label[p - 1] = next; q[t++] = p - 1; }
      if (x < W - 1 && !isBg[p + 1] && !label[p + 1]) { label[p + 1] = next; q[t++] = p + 1; }
      if (y > 0 && !isBg[p - W] && !label[p - W]) { label[p - W] = next; q[t++] = p - W; }
      if (y < H - 1 && !isBg[p + W] && !label[p + W]) { label[p + W] = next; q[t++] = p + W; }
    }
    if (size > bestSize) { bestSize = size; best = next; }
  }
  let stripped = 0;
  for (let p = 0; p < N; p++) {
    if (!isBg[p] && label[p] !== best) { isBg[p] = 1; stripped++; }
  }
  console.log("garment components:", next, "largest:", bestSize, "px, speckle stripped:", stripped);
}

/**
 * Reassign the anti-aliased silhouette rim of each knit zone from body to that
 * zone. See the call site for why the rim ends up misclassified.
 *
 * A body pixel is rim if all three hold:
 *   - it is within `RIM` px of the backdrop, which confines the whole operation
 *     to the silhouette and leaves the hem itself alone;
 *   - it is nearer to a knit zone than to the body's own interior, which is
 *     what distinguishes "pink pixel the threshold missed" from "main fabric
 *     that happens to run along the silhouette";
 *   - it is body to begin with.
 * It then goes to whichever knit zone is nearer.
 */
function absorbSilhouetteRim(RIM = 14, CORE_MARGIN = 16) {
  const isBody = new Uint8Array(N);
  for (let p = 0; p < N; p++) if (!isBg[p] && !isBund[p] && !isBuen[p]) isBody[p] = 1;

  const nearKnit = erodeMask(union([isBund, isBuen]), W, H, CORE_MARGIN);
  const core = new Uint8Array(N);
  for (let p = 0; p < N; p++) if (isBody[p] && !nearKnit[p]) core[p] = 1;

  const dBg = distanceFrom(isBg, W, H, 64);
  const dCore = distanceFrom(core, W, H, 64);
  const dBund = distanceFrom(isBund, W, H, 64);
  const dBuen = distanceFrom(isBuen, W, H, 64);

  let toBund = 0, toBuen = 0;
  for (let p = 0; p < N; p++) {
    if (!isBody[p] || dBg[p] > RIM) continue;
    const dKnit = Math.min(dBund[p], dBuen[p]);
    if (dKnit >= dCore[p]) continue;
    if (dBuen[p] <= dBund[p]) { isBuen[p] = 1; toBuen++; }
    else { isBund[p] = 1; toBund++; }
  }
  console.log("silhouette rim absorbed — Bündchen:", toBuen, "px, Bund:", toBund, "px");
}

/** Keep up to `count` connected components of `candidate` that exceed `minSize`. */
function largestComponents(candidate, count, minSize) {
  const label = new Int32Array(N);
  const q = new Int32Array(N);
  const sizes = [0];
  let next = 0;
  for (let seed = 0; seed < N; seed++) {
    if (!candidate[seed] || label[seed]) continue;
    next++;
    let size = 0, h = 0, t = 0;
    label[seed] = next;
    q[t++] = seed;
    while (h < t) {
      const p = q[h++];
      size++;
      const x = p % W, y = (p / W) | 0;
      if (x > 0 && candidate[p - 1] && !label[p - 1]) { label[p - 1] = next; q[t++] = p - 1; }
      if (x < W - 1 && candidate[p + 1] && !label[p + 1]) { label[p + 1] = next; q[t++] = p + 1; }
      if (y > 0 && candidate[p - W] && !label[p - W]) { label[p - W] = next; q[t++] = p - W; }
      if (y < H - 1 && candidate[p + W] && !label[p + W]) { label[p + W] = next; q[t++] = p + W; }
    }
    sizes[next] = size;
  }
  const keep = sizes
    .map((size, id) => ({ size, id }))
    .filter((c) => c.id > 0 && c.size >= minSize)
    .sort((a, b) => b.size - a.size)
    .slice(0, count);
  console.log("components:", next, "kept:", keep.map((c) => c.size).join(", ") || "none");
  return keep.map((c) => {
    const out = new Uint8Array(N);
    for (let p = 0; p < N; p++) if (label[p] === c.id) out[p] = 1;
    return out;
  });
}

/** OR a list of binary zones into one. */
function union(zones) {
  const out = new Uint8Array(N);
  for (const z of zones) for (let p = 0; p < N; p++) if (z[p]) out[p] = 1;
  return out;
}

/** Fill enclosed holes in a binary zone (fold shadows inside a cuff, etc.). */
function holeFill(zone) {
  const outside = new Uint8Array(N);
  const q = new Int32Array(N);
  let h = 0, t = 0;
  const pushOut = (p) => { if (!zone[p] && !outside[p]) { outside[p] = 1; q[t++] = p; } };
  for (let x = 0; x < W; x++) { pushOut(x); pushOut((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { pushOut(y * W); pushOut(y * W + W - 1); }
  while (h < t) {
    const p = q[h++];
    const x = p % W, y = (p / W) | 0;
    if (x > 0) pushOut(p - 1);
    if (x < W - 1) pushOut(p + 1);
    if (y > 0) pushOut(p - W);
    if (y < H - 1) pushOut(p + W);
  }
  for (let p = 0; p < N; p++) if (!zone[p] && !outside[p] && !isBg[p]) zone[p] = 1;
}

/** Plain separable box blur (bg included — zones must smooth across the edge). */
function boxBlurBinary(src, radius, iterations) {
  let cur = Float32Array.from(src);
  const tmp = new Float32Array(N);
  for (let it = 0; it < iterations; it++) {
    for (let y = 0; y < H; y++) {
      const row = y * W;
      let sum = 0;
      for (let x = 0; x <= Math.min(radius, W - 1); x++) sum += cur[row + x];
      let count = Math.min(radius, W - 1) + 1;
      for (let x = 0; x < W; x++) {
        tmp[row + x] = sum / count;
        const drop = x - radius, add = x + radius + 1;
        if (drop >= 0) { sum -= cur[row + drop]; count--; }
        if (add < W) { sum += cur[row + add]; count++; }
      }
    }
    const next = new Float32Array(N);
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let y = 0; y <= Math.min(radius, H - 1); y++) sum += tmp[y * W + x];
      let count = Math.min(radius, H - 1) + 1;
      for (let y = 0; y < H; y++) {
        next[y * W + x] = sum / count;
        const drop = y - radius, add = y + radius + 1;
        if (drop >= 0) { sum -= tmp[drop * W + x]; count--; }
        if (add < H) { sum += tmp[add * W + x]; count++; }
      }
    }
    cur = next;
  }
  return cur;
}

/** 2 px anti-aliased alpha mask from a binary zone. */
function featherMask(zone) {
  const f = new Float32Array(N);
  for (let p = 0; p < N; p++) f[p] = zone[p] ? 255 : 0;
  // BIL-2473: masked blur, so the backdrop never pulls a zone's alpha down.
  //
  // The feather is there to soften the INTERNAL hem between two zones. Blurring
  // across the backdrop as well feathered the zones against the silhouette too,
  // and `maskHose = 255 - maskBund - maskBuen` then handed that shortfall to the
  // body: sampled on the shipped assets at the right cuff's lower silhouette
  // (x=753, y=938) the pixel was 65% Bündchen + 32% Hose while the base was
  // still 96% opaque. On any two-colour design that painted a 2-3 px cream rim
  // along the outside of every coloured cuff — a cut-out halo, and one of the
  // most literal reads of "schlampig ausgeschnitten" in the board's repro.
  // The garment's own anti-aliasing lives in the base's alpha channel; the zone
  // masks must stay fully opaque right up to it.
  const soft = boxBlurMasked(f, W, H, isBg, 2, 1);
  const out = Buffer.alloc(N);
  for (let p = 0; p < N; p++) {
    if (isBg[p]) continue;
    out[p] = Math.max(0, Math.min(255, Math.round(soft[p])));
  }
  return out;
}

/** Binary 0/1 zone → 0/255, which is what boundaryBetween thresholds on. */
function scale255(zone) {
  const out = new Uint8Array(N);
  for (let p = 0; p < N; p++) if (zone[p]) out[p] = 255;
  return out;
}

/** Body zone = garment minus the two accent zones. */
function invertZones(a, b) {
  const out = new Uint8Array(N);
  for (let p = 0; p < N; p++) if (!isBg[p] && !a[p] && !b[p]) out[p] = 255;
  return out;
}
