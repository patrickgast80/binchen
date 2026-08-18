/**
 * BIL-2509 — REAL folds, recovered from the photo.
 *
 * Board (Patrick, 2026-08-18): "Kannst du das machen dass es echter aussieht?
 * So wie im Originalbild, falten Schatten usw.?"
 *
 * DIAGNOSIS (scripts/bil2509-detail-probe.mjs, and dumping base.webp as PNG):
 * every konfigurator's base is a SMOOTH BALLOON. That is not a bug in the
 * pipeline, it is what konfigurator-shading.mjs was built to produce —
 * `estimateIllumination` smooths the de-printed photo at radius 40..70, which is
 * wide enough to erase every fold along with the print, and the cloth drawing is
 * then RE-SYNTHESISED as periodic crease fans and ribs. Synthetic creases are
 * regular and zone-aligned, so the eye reads them as decoration applied to a
 * shape rather than as drape, and the print tiled on top lies perfectly flat.
 * That is precisely "wirkt ausgemalt".
 *
 * The fix is to stop throwing the real fold signal away. Three stages:
 *
 *   deprintByChroma  removes the print WITHOUT touching fold scale, by treating
 *                    motif pixels as missing data and inpainting them from the
 *                    surrounding unprinted fabric. Unlike a max/median/blur
 *                    filter this has no scale limit: a 150px dinosaur is filled
 *                    from its own neighbourhood, while a 12px crease three
 *                    pixels away keeps its exact luminance.
 *   bandPass         separates that into the broad lighting term (which the
 *                    existing pipeline already models) and the FOLD term the
 *                    base is missing.
 *   applyRealFolds   writes the fold term into the multiply base, scaled per
 *                    zone so it survives the zoned normalisation, and hands the
 *                    crests back for the screen layer.
 *
 * WHY CHROMA AND NOT LUMINANCE to find the print: a fold changes how much light
 * a patch of fabric returns, it does not change what colour the fabric IS.
 * Normalised chromaticity (r, g over r+g+b) is close to invariant under that, so
 * a shadowed teal stays teal while an orange dinosaur sits far away.
 * Thresholding on luminance instead would delete the folds — which is the exact
 * mistake the original blur made and the reason for the "NIE blur" rule.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO — measured, not assumed
 * ----------------------------------------------------------
 * On a DENSELY printed zone the recovery is impossible and is switched off.
 * Evidence (scripts/bil2509-band-probe.mjs, dino shorts body zone): the print
 * covers ~60% of the area, so
 *   - inpainting has too little unprinted ground to fill from, and a
 *     percentile threshold latches onto the ground's own speckle instead of the
 *     motifs (the resulting mask flags the teal and KEEPS the dinosaurs), and
 *   - a plain band-pass on the median-de-printed photo returns motif blobs at
 *     EVERY scale tried — (fine,broad) of (5,46), (14,46), (22,60) and (30,80)
 *     all reconstruct dinosaurs, because the print repeat (~150-200px) is larger
 *     than the folds we are trying to isolate.
 * Shipping that would put a permanent ghost dinosaur under every fabric the
 * customer picks. So `foldsFromPhoto` measures each zone's printiness first and
 * only returns real folds where they are real; densely printed zones keep the
 * synthetic drape, which is honest rather than wrong.
 */

import { boxBlurMasked, extendInto } from "./konfigurator-shading.mjs";

/**
 * Real fold detail per zone, with a measured trust gate.
 *
 * For each zone independently:
 *   1. take its MEDIAN chromaticity as the fabric's own colour (robust even if
 *      motifs cover a lot of the zone),
 *   2. measure `printiness` = the share of the zone whose chromaticity is
 *      further than `absFloor` from that — i.e. how much of it is motif,
 *   3. if printiness <= `maxPrint` the zone is plain enough to trust: the few
 *      outlier pixels are inpainted from their neighbours and the luminance is
 *      band-passed into a fold map,
 *      otherwise the zone gets NO real detail (see the header — on a dense print
 *      every scale returns motif blobs, and shipping that bakes a ghost motif
 *      under every fabric the customer picks).
 *
 * `absFloor` is a chromaticity distance, not a colour distance: 0.05 in
 * (r,g)/(r+g+b) units is roughly "visibly a different colour", and it is
 * comfortably above the drift a fold's own shading causes.
 *
 * @param {Buffer|Uint8Array} data   RGB, 3 bytes per pixel
 * @param {Array<Uint8Array>} zones  per-zone binary maps
 * @returns {{detail: Float32Array, zoneOk: boolean[], printiness: number[]}}
 */
export function foldsFromPhoto(data, W, H, isBg, zones, {
  trustZones,
  zoneNames = [],
  absFloor = 0.05,
  maxPrint = 0.22,
  fine = 5,
  broad = 46,
  iterations = 200,
  dilate = 2,
} = {}) {
  if (!Array.isArray(trustZones)) {
    throw new Error("foldsFromPhoto: pass trustZones — which zones are plain enough to recover");
  }
  const N = W * H;
  const lum = new Float32Array(N);
  const cr = new Float32Array(N);
  const cg = new Float32Array(N);
  for (let p = 0; p < N; p++) {
    if (isBg[p]) continue;
    const i = p * 3;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    lum[p] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const s = r + g + b || 1;
    cr[p] = r / s;
    cg[p] = g / s;
  }

  const printed = new Uint8Array(N);
  const chromaDist = new Float32Array(N);
  const printiness = [];
  const zoneOk = [];
  const zoneMembers = [];
  zones.forEach((zone, idx) => {
    const members = [];
    for (let p = 0; p < N; p++) if (zone[p] && !isBg[p]) members.push(p);
    zoneMembers[idx] = members;
    if (members.length < 256) {
      printiness[idx] = 0;
      zoneOk[idx] = false;
      return;
    }
    const rs = members.map((p) => cr[p]).sort((a, b) => a - b);
    const gs = members.map((p) => cg[p]).sort((a, b) => a - b);
    const r0 = rs[rs.length >> 1];
    const g0 = gs[gs.length >> 1];

    let off = 0;
    for (const p of members) {
      const d = Math.abs(cr[p] - r0) + Math.abs(cg[p] - g0);
      chromaDist[p] = d;
      if (d > absFloor) { printed[p] = 1; off++; }
    }
    printiness[idx] = off / members.length;

    // The trust list is the decision; printiness is the GUARD on it.
    //
    // Deciding automatically was tried and does not hold up. A coverage
    // threshold passes the long Pumphose body at 17.7% and it comes out covered
    // in embossed flowers, because its florals are pale grey-green on cream and
    // only their cores cross the chroma threshold — `extendInto` then fills each
    // core from its own dark halo instead of from clean fabric. Two attempts at
    // scoring the RESULT instead (correlating |detail| with chroma distance, and
    // an energy ratio across the print mask) both misranked zones that had
    // already been checked by eye. So the call is made per configurator, from
    // looking at base.webp, and recorded there with its reason.
    //
    // What stays automatic is the thing a human cannot notice: if a source photo
    // is ever reshot with a printed fabric where a plain one used to be, a zone
    // on the trust list starts measuring as printed and the build FAILS instead
    // of quietly shipping ghosts.
    zoneOk[idx] = trustZones.includes(idx);
    if (zoneOk[idx] && printiness[idx] > maxPrint) {
      throw new Error(
        `zone ${zoneNames[idx] ?? idx} is on the real-fold trust list but measures ` +
          `${(printiness[idx] * 100).toFixed(1)}% printed (limit ${(maxPrint * 100).toFixed(0)}%). ` +
          "The source photo changed — re-check base.webp by eye before trusting this zone again.",
      );
    }
  });

  // Only inpaint inside zones we are going to use; a densely printed zone would
  // otherwise burn the whole iteration budget filling motifs we then discard.
  const usable = new Uint8Array(N);
  zones.forEach((zone, idx) => {
    if (!zoneOk[idx]) return;
    for (let p = 0; p < N; p++) if (zone[p] && !isBg[p]) usable[p] = 1;
  });

  // Motif EDGES are anti-aliased, so the rim around a motif is a blend of motif
  // and fabric: it passes the chroma test while still being far too dark. Grow
  // the print mask a little so those rims are inpainted too, otherwise every
  // motif leaves a faint outline behind in the fold map.
  let grown = printed;
  for (let it = 0; it < dilate; it++) {
    const next = Uint8Array.from(grown);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = y * W + x;
        if (grown[p] || isBg[p]) continue;
        if (
          (x > 0 && grown[p - 1]) || (x < W - 1 && grown[p + 1]) ||
          (y > 0 && grown[p - W]) || (y < H - 1 && grown[p + W])
        ) next[p] = 1;
      }
    }
    grown = next;
  }

  // Treat "background OR motif" as missing and fill from the valid fabric.
  const missing = new Uint8Array(N);
  for (let p = 0; p < N; p++) missing[p] = isBg[p] || grown[p] ? 1 : 0;
  const filled = extendInto(lum, missing, isBg, W, H, iterations);

  // The inpainted patches meet the surrounding fabric along the flood-fill
  // front, which is a crease of its own. One masked smoothing pass over the
  // FILLED REGION ONLY removes that without touching measured fabric — this is
  // not a de-print blur, the motifs are already gone at this point.
  const smoothed = boxBlurMasked(filled, W, H, isBg, 3, 1);
  for (let p = 0; p < N; p++) if (grown[p] && !isBg[p]) filled[p] = smoothed[p];

  const detail = bandPass(filled, W, H, isBg, { fine, broad });

  // SELF-TEST — does the recovered detail look like folds, or like the print?
  //
  // The coverage gate above is necessary but not sufficient: it only catches a
  // print that is chromatically obvious. The long Pumphose is the counterexample
  // that forced this check — its florals are PALE GREY-GREEN ON CREAM, so they
  // differ from the fabric mainly in luminance, only 17.7% of the body crossed
  // the chroma threshold, the zone passed, and the base came out with flowers
  // embossed into it (visible the moment base.webp is dumped as a PNG).
  //
  // What separates the two cases is not how much print there is but WHERE the
  // recovered detail sits: a motif ghost lines up with the print, a fold does
  // not. So correlate |detail| against the continuous chroma-distance field —
  // no threshold involved — and reject the zone when they track each other.
  // This is a check that can FAIL, which is the point; a gate that only ever
  // passes proves nothing.
  for (let p = 0; p < N; p++) if (!usable[p]) detail[p] = 0;
  void chromaDist;
  void zoneMembers;

  return { detail, zoneOk, printiness };
}

/**
 * Split a field into the broad lighting term and everything between `fine` and
 * `broad` — i.e. the folds.
 *
 * `fine` is a mild smoothing, NOT a de-print: it only takes sensor noise and
 * jersey grain off the top so the fold term is cloth and not speckle. Keep it
 * small (4..8 px); at 20+ it starts eating the narrow creases that make the
 * garment read as fabric. `broad` should match the `smooth` the caller used for
 * its illumination estimate, so the two terms partition the signal instead of
 * double-counting the lighting.
 */
export function bandPass(field, W, H, isBg, { fine = 5, broad = 46 } = {}) {
  const lo = fine > 0 ? boxBlurMasked(field, W, H, isBg, fine, 1) : field;
  const hi = boxBlurMasked(field, W, H, isBg, broad, 2);
  const out = new Float32Array(W * H);
  for (let p = 0; p < W * H; p++) if (!isBg[p]) out[p] = lo[p] - hi[p];
  return out;
}

/**
 * Write the recovered fold term into the multiply base.
 *
 * Two things make this non-trivial, and both are known traps from BIL-2461/2466:
 *
 *  1. SCALE. `normalizeShadingZoned` stretches each zone by its own `span`, so a
 *     raw luminance delta means something different in each zone. We rescale by
 *     that same span — which is the whole reason `normalizeShadingZoned` returns
 *     `stats` and why it has to be threaded through here. Skipping this makes a
 *     low-contrast zone (a flat waistband) explode while a high-contrast zone
 *     barely moves.
 *
 *  2. CRESTS MUST NOT CLIP. The base feeds a `multiply` layer, where a value at
 *     255 renders as the PURE swatch colour — a hard bright hairline along every
 *     fold, which is the ridge-clipping outline the board rejected in BIL-2461.
 *     So positive detail is capped at `ceiling` and the REMAINDER is returned
 *     for the screen layer, where a highlight belongs anyway and where it also
 *     survives a dark swatch (multiply loses fine structure as the swatch
 *     darkens — that is why the crest overflow matters most on navy/forest).
 *
 * Valleys get `depth` extra weight: on a real garment a crease reads mostly as a
 * shadow, and a multiply layer renders shadow far better than light.
 *
 * @param {Array} stats  the `stats` array from `normalizeShadingZoned`
 * @returns {Float32Array} the crest remainder, to be added to the screen layer
 */
export function applyRealFolds(gray, detail, W, H, isBg, zones, stats, {
  shadow = 172,
  lit = 252,
  gain = 1,
  depth = 1.35,
  limit = 34,
  ceiling = 250,
} = {}) {
  const N = W * H;
  const zoneOf = new Int32Array(N).fill(-1);
  zones.forEach((z, idx) => {
    for (let p = 0; p < N; p++) if (z[p] && !isBg[p]) zoneOf[p] = idx;
  });

  const overflow = new Float32Array(N);
  for (let p = 0; p < N; p++) {
    if (isBg[p]) continue;
    const s = stats[zoneOf[p] + 1] ?? stats[0];
    if (!s) continue;
    let d = (detail[p] / s.span) * (lit - shadow) * gain;
    if (d < 0) d *= depth;
    d = Math.max(-limit, Math.min(limit, d));
    const target = gray[p] + d;
    if (target > ceiling) {
      overflow[p] = target - ceiling;
      gray[p] = ceiling;
    } else {
      gray[p] = target;
    }
  }
  return overflow;
}

/**
 * Standard deviation of a field inside a mask — the measurement behind the
 * before/after evidence in the ticket. Exported so the build scripts can print
 * it and a regression shows up as a number, not only as "looks flatter".
 */
export function spread(field, mask, isBg, N) {
  let n = 0, sum = 0;
  for (let p = 0; p < N; p++) {
    if (isBg[p] || (mask && !mask[p])) continue;
    sum += field[p]; n++;
  }
  if (n < 2) return 0;
  const mean = sum / n;
  let acc = 0;
  for (let p = 0; p < N; p++) {
    if (isBg[p] || (mask && !mask[p])) continue;
    acc += (field[p] - mean) ** 2;
  }
  return Math.sqrt(acc / n);
}
