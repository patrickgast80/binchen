/**
 * BIL-2522 — relief maps for the Konfigurator fabric layer.
 *
 * The problem this solves: until now the chosen fabric was a flat CSS tile
 * multiplied over the garment base. Multiply modulates the fabric's
 * *brightness*, so the print darkened in shadow — but its *geometry* never
 * moved. A print that runs perfectly straight across a fold is the single
 * loudest "this is a composite" tell, and no amount of shading fixes it.
 *
 * A relief map is one lossless RGBA image per Konfigurator that carries
 * everything the renderer needs to lay a fabric onto the garment:
 *
 *   R = dx   texture-space displacement, (R-128)/127 * WARP_RANGE px
 *   G = dy   same for the vertical axis
 *   B = shade   final brightness multiplier * 255 (255 = fully lit reference)
 *   A = coverage   255 inside the garment, 0 outside (also keeps webp honest)
 *
 * Two effects feed the displacement:
 *
 *   folds     — gradient of the mid-frequency band of the base photo. Fabric
 *               sitting in a crease is seen at a glancing angle, so the print
 *               bunches up there; sampling the tile "uphill" reproduces that.
 *   limb roll — each leg is a tube. Treating the distance-to-silhouette as a
 *               cylinder radius gives the exact texture compression a real
 *               print shows as it wraps out of view (asin(s) - s, outward).
 *
 * MUST be written as LOSSLESS webp: dx/dy are coordinates, and lossy chroma
 * subsampling turns a smooth warp field into visible blocky tearing.
 */
import {
  boxBlurMasked,
  distanceFrom,
} from "./konfigurator-shading.mjs";

// Displacement scale is defined by the renderer, not by the builder: encode
// and decode must agree or every warp is silently wrong by a constant factor.
export { WARP_RANGE } from "../../src/app/konfigurator/_shared/relief-math.mjs";
import { WARP_RANGE } from "../../src/app/konfigurator/_shared/relief-math.mjs";

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (t) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};

/** Deterministic 2D value noise in [-1, 1]. Seeded so builds are reproducible. */
function hash2(ix, iy, seed) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function valueNoise(x, y, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smoothstep(x - ix);
  const fy = smoothstep(y - iy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  const top = a + (b - a) * fx;
  const bot = c + (d - c) * fx;
  return (top + (bot - top) * fy) * 2 - 1;
}

/**
 * BIL-2533 — connected components of a zone mask, with each one's long axis.
 *
 * A cut piece's rib runs ACROSS the band: a waistband lies horizontally and its
 * ribs stand vertically, a leg cuff curves and its ribs fan out with it. So the
 * rib direction has to come from the piece's own geometry, and it has to come
 * per PIECE — the two leg cuffs share one mask file, and a single principal
 * axis over both of them would average two opposite curves into a diagonal that
 * matches neither.
 *
 * Returns, per component, the centroid and the unit long axis from the pixel
 * covariance. The rib phase is then the projection onto that axis, which makes
 * the rib lines perpendicular to it — straight, evenly spaced, and stable
 * (unlike integrating a rotating local tangent, which drifts and tears).
 */
function maskComponents(inZone, W, H, minPx = 400) {
  const seen = new Uint8Array(W * H);
  const comps = [];
  const stack = new Int32Array(W * H);
  for (let start = 0; start < W * H; start++) {
    if (seen[start] || !inZone[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    const px = [];
    while (top > 0) {
      const p = stack[--top];
      px.push(p);
      const x = p % W;
      const y = (p / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (seen[q] || !inZone[q]) continue;
        seen[q] = 1;
        stack[top++] = q;
      }
    }
    if (px.length < minPx) continue;
    let cx = 0;
    let cy = 0;
    for (const p of px) {
      cx += p % W;
      cy += (p / W) | 0;
    }
    cx /= px.length;
    cy /= px.length;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    for (const p of px) {
      const dx = (p % W) - cx;
      const dy = ((p / W) | 0) - cy;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    }
    // Larger eigenvector of the 2x2 covariance — the piece's long axis.
    const tr = (sxx + syy) / px.length;
    const det = (sxx * syy - sxy * sxy) / (px.length * px.length);
    const lam = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
    let ux = sxy / px.length;
    let uy = lam - sxx / px.length;
    if (Math.hypot(ux, uy) < 1e-6) {
      ux = 1;
      uy = 0;
    }
    const len = Math.hypot(ux, uy);
    comps.push({ pixels: px, cx, cy, ux: ux / len, uy: uy / len, n: px.length });
  }
  return comps;
}

/**
 * @param {Uint8Array|Buffer} rgba  base.webp as raw RGBA
 * @param {number} W
 * @param {number} H
 * @param {object} opts
 * @returns {{relief: Buffer, stats: object}}
 */
export function buildRelief(rgba, W, H, opts = {}) {
  const {
    // ---- shading -------------------------------------------------------
    /** Base luminance that counts as "fully lit" (normalizeShading's `lit`). */
    litRef = 252,
    /** Contrast gain on the photo's own shading before anything is added. */
    foldGain = 1.95,
    /** Mean brightness the finished map is re-centred on (the shipped base
     *  averaged 0.86, and the board must not read the realism pass as "darker"). */
    shadeMeanTarget = 0.858,
    /** Contact-shadow rim so the silhouette stops looking die-cut. */
    rimRadius = 11,
    rimStrength = 0.2,
    /**
     * Drape creases. BIL-2509 could not recover folds from the hose body: the
     * source print is dense enough that every band-pass scale returned motifs
     * instead of creases, so the shipped base is an almost featureless shape
     * there. A real jersey never is. These are synthesised from the garment's
     * own geometry — soft, low-frequency, stretched along the limb — and they
     * live in the relief map ONLY, so uni zones keep the shipped look exactly.
     * Set drapeAmp: 0 for a piece whose base already carries real folds.
     */
    drapeAmp = 0.055,
    /** Crease pitch across / along the limb, in px. Pants drape vertically. */
    drapeScaleX = 46,
    drapeScaleY = 210,
    drapeSeed = 2522,
    /**
     * Whether the synthesised drape yields where the photo's own `detail` is
     * large. That is right whenever `detail` really is gathers (hose waistband,
     * cuff rib) and WRONG where it is de-print residue: the Dreieckstuch base
     * still carries faint "Kleiner Zoo" ghosts, and yielding to those would
     * punch a crease-shaped hole around every little motif — the print driving
     * the drape, which is the exact BIL-2509 trap one level further down.
     */
    drapeYieldToPhoto = true,
    /** Radius of the local mean the fold band is measured against. */
    foldRadius = 26,
    /** Limb radius in px — how far in from the silhouette counts as "round". */
    limbRadius = 108,
    /** Strength of the synthesised limb (cylinder) shading. */
    limbStrength = 0.3,
    /** Light direction, screen space. -x = left, -y = top, +z = towards camera. */
    light = [-0.42, -0.52, 0.74],
    /** Brightness never falls below this multiplier — fabric keeps its colour. */
    shadeFloor = 0.3,
    /** Brightest allowed multiplier (1 = untouched fabric). */
    shadeCeil = 1.0,
    // ---- displacement --------------------------------------------------
    /** px of texture shift per unit of fold slope. */
    warpFold = 19,
    /**
     * BIL-2533 — the same, but for the SYNTHESISED drape only.
     *
     * The two crease sources need different gains and pretending otherwise is
     * what kept hose-kurz flat. The photo's own `detail` on that base is the
     * waistband gathers and the cuff rib — a fine vertical comb — and turning
     * `warpFold` up far enough to bend a stripe turns that comb into corduroy
     * across the whole garment (the BIL-2522 trap, one gain further). The
     * invented drape has no such passenger: it is smooth, low-frequency and
     * lives only in the relief map, so it can be pushed until a stripe visibly
     * follows a fold while the photo's contribution stays where it was tuned.
     *
     * Defaults to `warpFold`, so every Konfigurator that does not set it keeps
     * its approved map byte-for-byte.
     */
    warpDrape = warpFold,
    /**
     * How much of the PHOTO's fold band drives the displacement, relative to
     * the synthesised drape. 1 wherever `detail` is genuine cloth structure.
     * Turned down for a base whose remaining fine structure is de-print
     * residue rather than creases — warping a fabric along ghost motifs is
     * worse than not warping it at all.
     */
    foldPhotoWeight = 1,
    /** Fraction of the geometric limb roll that is actually applied. */
    warpLimb = 0.55,
    /**
     * asin' blows up at s = 1, so the last pixels of the silhouette would each
     * fetch texture from far outside and the print aliases into streaks. The
     * cap bounds the derivative; it costs the outermost sliver of roll and buys
     * a clean edge.
     */
    rollCap = 0.9,
    /** Blur applied to the finished warp field — kills single-pixel jitter. */
    warpSmooth = 3,
    // ---- BIL-2533: cut-piece structure ----------------------------------
    /**
     * Zone masks, so the map can carry what belongs to the CUT rather than to
     * the garment as a whole: `[{ name, alpha: Uint8Array|Buffer(W*H*4), rib }]`.
     *
     * Omit it and every line below is skipped, so the four Konfigurators that
     * do not opt in keep their approved maps byte-for-byte.
     */
    zones = null,
    /** Rib pitch in px, measured on the reference photo's waistband. */
    ribPitch = 9,
    /** How much darker a rib VALLEY is than the ridge beside it. */
    ribAmp = 0.2,
    /** px the print slides across a rib. Small: a rib is shallow, not a fold. */
    ribWarp = 1.1,
    /**
     * Seam depth at a zone boundary that is NOT the silhouette.
     *
     * The board's third point: "die Übergänge sehen wie harte Ebenen-Kanten
     * aus". They are exactly that — two masks meeting with nothing in between.
     * A real seam has the two panels pulled together, so the cloth dips into a
     * groove and the seam allowance underneath lifts the fabric just beside it.
     */
    seamDepth = 0.16,
    /** Half-width of the groove in px. */
    seamWidth = 3.2,
    /** How much the allowance lifts the fabric next to the groove. */
    seamLift = 0.05,
    /** Where that lift peaks, as a multiple of seamWidth. */
    seamLiftAt = 2.4,
  } = opts;

  const N = W * H;
  const isBg = new Uint8Array(N);
  const gray = new Float32Array(N);
  for (let p = 0; p < N; p++) {
    isBg[p] = rgba[p * 4 + 3] < 8 ? 1 : 0;
    gray[p] =
      0.2126 * rgba[p * 4] + 0.7152 * rgba[p * 4 + 1] + 0.0722 * rgba[p * 4 + 2];
  }

  // --- 1. fold band ------------------------------------------------------
  // The photo's own shading, split into a local mean and the crease detail
  // riding on it. Only the detail gets amplified; lifting the mean as well
  // would just wash the whole garment out.
  const mean = boxBlurMasked(gray, W, H, isBg, foldRadius, 2);
  const detail = new Float32Array(N);
  for (let p = 0; p < N; p++) detail[p] = isBg[p] ? 0 : gray[p] - mean[p];

  // --- 2. limb geometry from the silhouette ------------------------------
  // `dist` is how deep inside the garment a pixel sits. Read as a cylinder,
  // s = 1 at the silhouette (surface edge-on) and 0 along the limb's spine.
  const dist = distanceFrom(isBg, W, H, limbRadius + 4);
  const s = new Float32Array(N);
  for (let p = 0; p < N; p++) {
    s[p] = isBg[p] ? 1 : 1 - clamp(dist[p] / limbRadius, 0, 1);
  }
  const sSmooth = boxBlurMasked(s, W, H, isBg, 9, 2);

  // Outward direction = down the distance gradient. Used both as the axis the
  // texture rolls along and to tilt the surface normal for the limb shading.
  const outX = new Float32Array(N);
  const outY = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (isBg[p]) continue;
      const xm = x > 0 ? p - 1 : p;
      const xp = x < W - 1 ? p + 1 : p;
      const ym = y > 0 ? p - W : p;
      const yp = y < H - 1 ? p + W : p;
      // -grad(dist) points from the spine towards the silhouette.
      let gx = -(dist[xp] - dist[xm]) * 0.5;
      let gy = -(dist[yp] - dist[ym]) * 0.5;
      const len = Math.hypot(gx, gy);
      if (len > 1e-3) {
        gx /= len;
        gy /= len;
      } else {
        gx = 0;
        gy = 0;
      }
      outX[p] = gx;
      outY[p] = gy;
    }
  }

  // --- 2b. drape creases -------------------------------------------------
  // Two octaves of value noise, sampled on an anisotropic grid so the creases
  // run along the limb rather than ringing it. Amplitude fades out towards the
  // silhouette (where the limb term already does the work) and towards the
  // waistband/cuffs (where the photo's own gathers are real and must win).
  const drape = new Float32Array(N);
  if (drapeAmp > 0) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = y * W + x;
        if (isBg[p]) continue;
        const n1 = valueNoise(x / drapeScaleX, y / drapeScaleY, drapeSeed);
        const n2 = valueNoise(x / (drapeScaleX * 0.42), y / (drapeScaleY * 0.5), drapeSeed + 17);
        drape[p] = n1 * 0.68 + n2 * 0.32;
      }
    }
  }

  // --- 3. shade ----------------------------------------------------------
  const lightLen = Math.hypot(light[0], light[1], light[2]);
  const L = light.map((c) => c / lightLen);
  const shade = new Float32Array(N);
  const drapeFade = new Float32Array(N);
  let sum = 0;
  let count = 0;
  for (let p = 0; p < N; p++) {
    if (isBg[p]) continue;
    // The photo's real shading, creases stretched by `foldGain`.
    const photo = (mean[p] + detail[p] * foldGain) / litRef;

    // Cylinder normal: tilts outward by asin(s) as the surface rolls away.
    const sv = clamp(sSmooth[p], 0, 1);
    const theta = Math.asin(clamp(sv, 0, 1));
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    const nx = outX[p] * sinT;
    const ny = outY[p] * sinT;
    const nz = cosT;
    const lambert = clamp(nx * L[0] + ny * L[1] + nz * L[2], 0, 1);
    // Half-Lambert keeps the terminator soft; a hard cosine reads plastic.
    const limb = 1 - limbStrength * (1 - (0.5 + 0.5 * lambert));
    // A real garment's last millimetre turns away from the camera and picks up
    // its own contact shadow. Without it the fabric ends at a knife cut, which
    // is what makes a composite look pasted on however good the interior is.
    const rim = 1 - rimStrength * (1 - smoothstep(dist[p] / rimRadius));

    // Synthetic drape yields to whatever the photo actually recorded: where
    // the base carries real gathers (waistband, cuff rib) `detail` is large and
    // the invented creases fade out, so nothing competes with the real thing.
    drapeFade[p] =
      (1 - clamp(sv, 0, 1)) *
      (drapeYieldToPhoto ? 1 - smoothstep((Math.abs(detail[p]) - 2) / 7) : 1);
    const crease = 1 + drapeAmp * drape[p] * drapeFade[p];

    shade[p] = photo * limb * rim * crease;
    sum += shade[p];
    count++;
  }

  // --- 3b. BIL-2533: rib and seams, from the CUT rather than the garment ---
  //
  // Everything above treats the piece as one continuous surface. A sewn
  // garment is not: it is panels with edges, and two of the board's three
  // complaints are about exactly that — a waistband that is a flat gradient
  // where the real one has standing ribs, and zone borders that read as
  // stacked layers because nothing marks the seam.
  //
  // Both live in the relief map rather than in the renderer, for the same
  // reason the warp does: the geometry belongs to the garment, not to the
  // colour someone picked. The renderer stays a pure function of the map.
  const ribDx = new Float32Array(N);
  const ribDy = new Float32Array(N);
  if (zones) {
    // A zone edge that is ALSO the silhouette is not a seam — it is the hem
    // roll the rim term already handles, and darkening it twice makes the
    // garment look bruised. `dist` is the distance from the background, so
    // this fades the seam out wherever the two edges coincide.
    const notSilhouette = new Float32Array(N);
    for (let p = 0; p < N; p++) {
      notSilhouette[p] = isBg[p] ? 0 : smoothstep((dist[p] - 2) / 7);
    }

    for (const zone of zones) {
      const a = zone.alpha;
      // Masks arrive as RGBA (that is how they ship); read the alpha channel.
      const at = (p) => (a.length >= N * 4 ? a[p * 4 + 3] : a[p]);
      const inZone = new Uint8Array(N);
      for (let p = 0; p < N; p++) inZone[p] = at(p) >= 128 ? 1 : 0;

      // Seam groove: distance from this zone's own boundary, on BOTH sides, so
      // the two panels dip towards each other the way stitched cloth does.
      const outside = new Uint8Array(N);
      for (let p = 0; p < N; p++) outside[p] = inZone[p] ? 0 : 1;
      const dIn = distanceFrom(outside, W, H, seamWidth * 6);
      const dOut = distanceFrom(inZone, W, H, seamWidth * 6);
      for (let p = 0; p < N; p++) {
        if (isBg[p]) continue;
        const d = inZone[p] ? dIn[p] : dOut[p];
        if (d > seamWidth * 5) continue;
        const g = notSilhouette[p];
        if (g <= 0) continue;
        const groove = Math.exp(-((d / seamWidth) ** 2));
        const lift = Math.exp(-(((d - seamWidth * seamLiftAt) / seamWidth) ** 2));
        const f = 1 - seamDepth * groove * g + seamLift * lift * g;
        sum += (f - 1) * shade[p];
        shade[p] *= f;
      }

      if (!zone.rib) continue;
      // Rib: straight lines perpendicular to each cut piece's own long axis.
      for (const comp of maskComponents(inZone, W, H)) {
        for (const p of comp.pixels) {
          if (isBg[p]) continue;
          const x = p % W;
          const y = (p / W) | 0;
          const phase = ((x - comp.cx) * comp.ux + (y - comp.cy) * comp.uy) / ribPitch;
          const th = phase * Math.PI * 2;
          // A 2x2 rib is not a sine: the ridges are round and stand proud, the
          // valleys between them are narrow and deep. `c*c` on the crest side
          // keeps the ridge broad and flat, the exponent on the other side
          // sharpens the valley.
          //
          // The rib only ever DARKENS, and that is not a stylistic choice. The
          // shade channel is capped at `shadeCeil` (1.0) and the waistband
          // already averages 0.91, so a rib that brightened its crests would
          // have most of every ridge clipped flat against that ceiling. The
          // first version did exactly that and produced mottling instead of
          // ribs — the BIL-2522 ridge-clipping trap, one layer further down.
          // Ridges therefore sit AT the ambient level and the valleys fall away
          // from it; the global re-centring below hands the lost mean back.
          const c = Math.cos(th);
          const ridge = c > 0 ? c * c : -(Math.abs(c) ** 1.35);
          const valley = (1 - ridge) / 2;
          // Ribs stop at the seam — the groove is where the panel ends, and a
          // rib running through it would undo the seam that was just cut in.
          const fade = smoothstep((dIn[p] - seamWidth) / (seamWidth * 2));
          const f = 1 - ribAmp * valley * fade;
          sum += (f - 1) * shade[p];
          shade[p] *= f;
          // A standing rib also pushes the print sideways as it rolls over the
          // ridge — small, but it is what keeps a printed Bündchen from
          // looking like a flat photo of a rib.
          const slope = -Math.sin(th) * fade * ribWarp;
          ribDx[p] += comp.ux * slope;
          ribDy[p] += comp.uy * slope;
        }
      }
    }
  }

  // Re-centre before clamping. The limb term only ever removes light, so
  // without this the realism pass would read as "someone turned the lights
  // down" — a shift the board would rightly reject as a regression.
  const rawMean = sum / count;
  const lift = shadeMeanTarget - rawMean;
  let shadeSum = 0;
  for (let p = 0; p < N; p++) {
    if (isBg[p]) continue;
    // NB: the fabric grain is NOT baked in here. It is per-pixel noise, and
    // baking it cost ~45kB of lossless webp for an effect the renderer can
    // reproduce for free from (x, y) — see fabricGrain() in relief-math.mjs.
    shade[p] = clamp(shade[p] + lift, shadeFloor, shadeCeil);
    shadeSum += shade[p];
  }

  // --- 4. displacement ---------------------------------------------------
  // Fold term: slope of the (smoothed) crease band. A crease that gets darker
  // to the right means the surface turns away to the right, so the texture is
  // sampled from further right — hence the plain gradient, not its negative.
  // Radius 8, not 4: the base carries the waistband gathers and the cuff rib
  // as a fine vertical comb. Letting that drive the displacement turned every
  // print into corduroy — a real crease is a low-frequency event, so the fold
  // band is smoothed well past the rib pitch before its gradient is taken.
  // The drape creases join the fold band here rather than only tinting the
  // shade. That coupling is the whole point of the ticket: a crease that
  // darkens the fabric but leaves the print running dead straight through it
  // reads worse than no crease at all. Same units as `detail` (luminance).
  //
  // The drape's share carries `warpDrape / warpFold` so it can be pushed
  // independently of the photo's — see the note on `warpDrape` above. At the
  // default the factor is 1 and this is the expression BIL-2522 shipped.
  const drapeWarpRatio = warpDrape / warpFold;
  const foldField = new Float32Array(N);
  for (let p = 0; p < N; p++) {
    foldField[p] = isBg[p]
      ? 0
      : detail[p] * foldPhotoWeight +
        drape[p] * drapeFade[p] * drapeAmp * litRef * drapeWarpRatio;
  }
  const detailSmooth = boxBlurMasked(foldField, W, H, isBg, 8, 2);
  const dx = new Float32Array(N);
  const dy = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (isBg[p]) continue;
      const xm = x > 0 ? p - 1 : p;
      const xp = x < W - 1 ? p + 1 : p;
      const ym = y > 0 ? p - W : p;
      const yp = y < H - 1 ? p + W : p;
      const gx = (detailSmooth[xp] - detailSmooth[xm]) * 0.5;
      const gy = (detailSmooth[yp] - detailSmooth[ym]) * 0.5;
      // Normalised by litRef so the gain is independent of the base's range.
      let fx = (gx / litRef) * warpFold * 40;
      let fy = (gy / litRef) * warpFold * 40;

      // Limb term: on a cylinder of radius R, a point seen at screen offset
      // s*R sits at arc length asin(s)*R. The texture therefore has to be
      // fetched (asin(s) - s) * R further out. Pure geometry, no tuning knob
      // beyond how much of it we trust.
      const sv = clamp(sSmooth[p], 0, 1);
      const sr = Math.min(sv, rollCap);
      const roll = (Math.asin(sr) - sr) * limbRadius * warpLimb;
      fx += outX[p] * roll;
      fy += outY[p] * roll;

      dx[p] = fx;
      dy[p] = fy;
    }
  }
  const dxS = boxBlurMasked(dx, W, H, isBg, warpSmooth, 2);
  const dyS = boxBlurMasked(dy, W, H, isBg, warpSmooth, 2);
  // The rib joins AFTER the smoothing on purpose. `warpSmooth` exists to kill
  // single-pixel jitter in a field built from image gradients; a 9px rib is
  // signal at very nearly that scale, and blurring it would leave the ribs in
  // the shading but not in the print — the waistband would go back to looking
  // like a photo of a rib with a flat colour laid over it.
  for (let p = 0; p < N; p++) {
    dxS[p] += ribDx[p];
    dyS[p] += ribDy[p];
  }

  // --- 5. encode ---------------------------------------------------------
  const relief = Buffer.alloc(N * 4);
  let clipped = 0;
  let maxAbs = 0;
  for (let p = 0; p < N; p++) {
    if (isBg[p]) {
      relief[p * 4] = 128;
      relief[p * 4 + 1] = 128;
      relief[p * 4 + 2] = 255;
      relief[p * 4 + 3] = 0;
      continue;
    }
    const ex = dxS[p] / WARP_RANGE;
    const ey = dyS[p] / WARP_RANGE;
    maxAbs = Math.max(maxAbs, Math.abs(dxS[p]), Math.abs(dyS[p]));
    if (Math.abs(ex) > 1 || Math.abs(ey) > 1) clipped++;
    relief[p * 4] = Math.round(128 + clamp(ex, -1, 1) * 127);
    relief[p * 4 + 1] = Math.round(128 + clamp(ey, -1, 1) * 127);
    relief[p * 4 + 2] = Math.round(clamp(shade[p], 0, 1) * 255);
    relief[p * 4 + 3] = 255;
  }

  // Sub-pixel displacement is invisible; if the encoder clamps a lot the map
  // is lying about the geometry, so make that loud rather than silent.
  const stats = {
    pixels: count,
    shadeMean: +(shadeSum / count).toFixed(4),
    warpMaxPx: +maxAbs.toFixed(2),
    warpClippedPct: +((clipped / count) * 100).toFixed(3),
  };
  return { relief, stats, isBg, shade, dx: dxS, dy: dyS };
}

/**
 * The per-pixel render maths lives in the storefront so the browser layer and
 * this build/evidence pipeline literally run the same code — see the header of
 * relief-math.mjs for why that matters. Re-exported here so existing callers
 * keep importing one module.
 */
export {
  RENDER,
  WARP_RANGE as RENDER_WARP_RANGE,
  shadeFabric,
  sampleTile,
} from "../../src/app/konfigurator/_shared/relief-math.mjs";
