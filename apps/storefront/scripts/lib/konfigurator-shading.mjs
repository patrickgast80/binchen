/**
 * BIL-2461 — shared shading pipeline for the Foto-Konfigurator base layers.
 *
 * WHY THIS EXISTS
 * ---------------
 * The first BIL-2461 attempt satisfied "Untergrund farb- und musterlos" by
 * blurring the source photo (radius 28) and compressing the result into a
 * 220..250 gray ramp. That did remove the print — but it also removed every
 * fold, every shadow and every bit of cloth grain, so a multiply-blended tint
 * rendered as three flat colour bands. Board verdict: "sieht nicht mehr
 * realistisch aus, vorher war sogar besser."
 *
 * The fix is to stop treating "remove the print" and "keep the shading" as the
 * same operation. On these garments the print is DARK/CHROMATIC MOTIFS ON A
 * LIGHT FABRIC, so the brightest pixel in a small neighbourhood is (almost
 * always) unprinted fabric. A grayscale MAX FILTER therefore reconstructs the
 * illumination — fold gradients and all — while the motifs disappear entirely.
 * That is the classic illumination-estimation trick from document scanning,
 * and it is what `estimateIllumination()` below does.
 *
 * On top of that we re-add the cues that make cloth read as cloth rather than
 * as a vector shape. All of them are ACHROMATIC by construction, so the board's
 * original requirement still holds: the base carries no colour and no pattern,
 * it only carries light.
 *
 *   estimateIllumination — print-free fold/shadow map (the actual realism win)
 *   normalizeShading     — stretch it to a real dynamic range, not 220..250
 *   applyEdgeShadow      — ambient occlusion along the silhouette (volume)
 *   applySeamShadow      — soft seam valley along a zone boundary, following
 *                          the true garment contour instead of a straight line
 *   applyGrain           — fine neutral jersey grain so it is not a gradient mesh
 *   buildHighlight       — sheen layer for `mix-blend-mode: screen`, so dark
 *                          tints keep a lit side instead of going muddy
 *
 * Every helper works on a Float32Array of 0..255 gray values, indexed by pixel
 * (not by byte), and skips background pixels via the `isBg` Uint8Array.
 */

/**
 * Separable sliding-window maximum, restricted to garment pixels.
 *
 * Background pixels are treated as -1 so they never win the window; near the
 * silhouette the maximum is therefore drawn from inside the garment and the
 * backdrop cannot bleed in.
 *
 * @param {Float32Array} src   luminance, one entry per pixel
 * @param {number} W
 * @param {number} H
 * @param {Uint8Array} isBg
 * @param {number} radius      half window size in px
 * @returns {Float32Array}
 */
export function maxFilter(src, W, H, isBg, radius) {
  const tmp = new Float32Array(W * H);
  const out = new Float32Array(W * H);

  // Horizontal pass. A monotonic deque gives O(1) amortised per pixel.
  const deque = new Int32Array(W);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    let head = 0, tail = 0;
    const valAt = (x) => (isBg[row + x] ? -1 : src[row + x]);
    for (let x = 0; x < W; x++) {
      const add = x + radius;
      if (x === 0) {
        for (let k = 0; k <= Math.min(radius, W - 1); k++) {
          while (tail > head && valAt(deque[tail - 1]) <= valAt(k)) tail--;
          deque[tail++] = k;
        }
      } else if (add < W) {
        while (tail > head && valAt(deque[tail - 1]) <= valAt(add)) tail--;
        deque[tail++] = add;
      }
      while (tail > head && deque[head] < x - radius) head++;
      tmp[row + x] = valAt(deque[head]);
    }
  }

  // Vertical pass over the horizontal result. tmp already encodes bg as -1.
  const dequeV = new Int32Array(H);
  for (let x = 0; x < W; x++) {
    let head = 0, tail = 0;
    const valAt = (y) => tmp[y * W + x];
    for (let y = 0; y < H; y++) {
      const add = y + radius;
      if (y === 0) {
        for (let k = 0; k <= Math.min(radius, H - 1); k++) {
          while (tail > head && valAt(dequeV[tail - 1]) <= valAt(k)) tail--;
          dequeV[tail++] = k;
        }
      } else if (add < H) {
        while (tail > head && valAt(dequeV[tail - 1]) <= valAt(add)) tail--;
        dequeV[tail++] = add;
      }
      while (tail > head && dequeV[head] < y - radius) head++;
      out[y * W + x] = valAt(dequeV[head]);
    }
  }
  return out;
}

/**
 * Separable box blur that only averages garment pixels (bg is excluded from
 * both the sum and the divisor), so smoothing never drags the backdrop in.
 * Run a few iterations for a near-Gaussian falloff.
 */
export function boxBlurMasked(src, W, H, isBg, radius, iterations = 2) {
  let cur = Float32Array.from(src);
  const tmp = new Float32Array(W * H);
  const tmpN = new Float32Array(W * H);

  for (let it = 0; it < iterations; it++) {
    // Horizontal
    for (let y = 0; y < H; y++) {
      const row = y * W;
      let sum = 0, count = 0;
      for (let x = 0; x <= Math.min(radius, W - 1); x++) {
        if (!isBg[row + x]) { sum += cur[row + x]; count++; }
      }
      for (let x = 0; x < W; x++) {
        tmp[row + x] = count > 0 ? sum / count : 0;
        tmpN[row + x] = count;
        const drop = x - radius;
        const add = x + radius + 1;
        if (drop >= 0 && !isBg[row + drop]) { sum -= cur[row + drop]; count--; }
        if (add < W && !isBg[row + add]) { sum += cur[row + add]; count++; }
      }
    }
    // Vertical
    const next = new Float32Array(W * H);
    for (let x = 0; x < W; x++) {
      let sum = 0, count = 0;
      for (let y = 0; y <= Math.min(radius, H - 1); y++) {
        if (!isBg[y * W + x]) { sum += tmp[y * W + x]; count++; }
      }
      for (let y = 0; y < H; y++) {
        next[y * W + x] = count > 0 ? sum / count : 0;
        const drop = y - radius;
        const add = y + radius + 1;
        if (drop >= 0 && !isBg[drop * W + x]) { sum -= tmp[drop * W + x]; count--; }
        if (add < H && !isBg[add * W + x]) { sum += tmp[add * W + x]; count++; }
      }
    }
    cur = next;
  }
  void tmpN;
  return cur;
}

/**
 * Print-free illumination map.
 *
 * `radius` must exceed the largest dark motif in the print, otherwise the
 * centre of that motif keeps its own (too dark) value and reappears as a stain.
 * `smooth` then removes the blockiness the max filter leaves behind.
 */
export function estimateIllumination(data, W, H, isBg, { radius = 40, smooth = 12, erode = 4, mode = "max" } = {}) {
  // The JPEG's anti-aliased silhouette rim blends garment into the (brighter)
  // studio backdrop. Those pixels are not background, but sampling them would
  // let the max filter paint a blown-out white halo all around the garment, so
  // the illumination is estimated on an eroded mask and extended back out.
  const inner = erode > 0 ? erodeMask(isBg, W, H, erode) : isBg;

  const lum = new Float32Array(W * H);
  for (let p = 0; p < W * H; p++) {
    if (inner[p]) continue;
    const i = p * 3;
    lum[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  // mode "max"    — print is dark motifs on light fabric (pumphose floral):
  //                 the locally brightest pixel is unprinted fabric.
  // mode "plain"  — caller already removed the print (e.g. a libvips median
  //                 pass), which is what a print with BOTH white and dark
  //                 motifs on mid-tone fabric needs; a max filter would just
  //                 latch onto the white stars.
  const lifted = mode === "max" ? maxFilter(lum, W, H, inner, radius) : lum;
  const smoothed = boxBlurMasked(lifted, W, H, inner, smooth, 2);
  return extendInto(smoothed, inner, isBg, W, H, erode + 2);
}

/** Grow the background inward by `px`, i.e. shrink the garment. */
export function erodeMask(isBg, W, H, px) {
  let cur = Uint8Array.from(isBg);
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

/**
 * Propagate values from the `inner` region out into the rim that `outer`
 * still counts as garment, by repeated averaging of already-valid neighbours.
 */
export function extendInto(field, innerBg, outerBg, W, H, iterations) {
  const out = Float32Array.from(field);
  let valid = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) if (!innerBg[p]) valid[p] = 1;

  for (let it = 0; it < iterations; it++) {
    const added = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = y * W + x;
        if (valid[p] || outerBg[p]) continue;
        let sum = 0, count = 0;
        if (x > 0 && valid[p - 1]) { sum += out[p - 1]; count++; }
        if (x < W - 1 && valid[p + 1]) { sum += out[p + 1]; count++; }
        if (y > 0 && valid[p - W]) { sum += out[p - W]; count++; }
        if (y < H - 1 && valid[p + W]) { sum += out[p + W]; count++; }
        if (count > 0) added.push([p, sum / count]);
      }
    }
    if (added.length === 0) break;
    const next = Uint8Array.from(valid);
    for (const [p, v] of added) { out[p] = v; next[p] = 1; }
    valid = next;
  }
  return out;
}

/**
 * Replace a zone's ragged `top` or `bottom` contour with a smooth curve.
 *
 * Colour segmentation gives a boundary that is correct on average but noisy
 * per pixel — the waistband hem came out as a row of battlements. A real hem
 * is a smooth curve, so we reduce the contour to one y per column, median- and
 * mean-filter that 1-D signal (median first: it rejects outlier columns
 * without rounding off the genuine curvature), and rebuild the zone from it.
 * The zone's other edge is left untouched.
 */
export function smoothContour(zone, W, H, isBg, { edge = "bottom", median = 121, mean = 61 } = {}) {
  const colTop = new Int32Array(W).fill(-1);
  const colBottom = new Int32Array(W).fill(-1);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      if (zone[y * W + x]) {
        if (colTop[x] < 0) colTop[x] = y;
        colBottom[x] = y;
      }
    }
  }
  const xs = [];
  for (let x = 0; x < W; x++) if (colTop[x] >= 0) xs.push(x);
  if (xs.length === 0) return zone;
  const xMin = xs[0], xMax = xs[xs.length - 1];

  const moving = edge === "bottom" ? colBottom : colTop;
  const anchor = edge === "bottom" ? colTop : colBottom;

  // Fill column gaps inside the span by nearest-neighbour so the 1-D filters
  // see a continuous signal.
  const raw = new Float64Array(xMax - xMin + 1);
  let last = moving[xs[0]];
  for (let x = xMin; x <= xMax; x++) {
    if (moving[x] >= 0) last = moving[x];
    raw[x - xMin] = last;
  }

  const med = median1d(raw, median);
  const smooth = mean1d(med, mean);

  const out = new Uint8Array(W * H);
  for (let x = xMin; x <= xMax; x++) {
    if (anchor[x] < 0) continue;
    const cut = Math.round(smooth[x - xMin]);
    const yFrom = edge === "bottom" ? anchor[x] : Math.min(cut, anchor[x]);
    const yTo = edge === "bottom" ? Math.max(cut, anchor[x]) : anchor[x];
    for (let y = yFrom; y <= yTo; y++) {
      if (y < 0 || y >= H) continue;
      const p = y * W + x;
      if (!isBg[p]) out[p] = 1;
    }
  }
  return out;
}

/**
 * Morphological smoothing of a binary map: blur it and re-threshold at 50%.
 *
 * That is a cheap open+close — it eats single-pixel spurs and fills notches
 * without shrinking the shape, which is what the colour-segmented Mütze
 * silhouette and lining need. (The Hose zones use `smoothContour` instead
 * because a hem is a 1-D curve and deserves a stronger, curve-aware filter;
 * a crescent-shaped lining has no single y per column.)
 */
export function smoothBinary(zone, W, H, { radius = 4, iterations = 2 } = {}) {
  let cur = Float32Array.from(zone, (v) => (v ? 255 : 0));
  for (let it = 0; it < iterations; it++) {
    const tmp = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      const row = y * W;
      let sum = 0, count = 0;
      for (let x = 0; x <= Math.min(radius, W - 1); x++) { sum += cur[row + x]; count++; }
      for (let x = 0; x < W; x++) {
        tmp[row + x] = sum / count;
        const drop = x - radius, add = x + radius + 1;
        if (drop >= 0) { sum -= cur[row + drop]; count--; }
        if (add < W) { sum += cur[row + add]; count++; }
      }
    }
    const next = new Float32Array(W * H);
    for (let x = 0; x < W; x++) {
      let sum = 0, count = 0;
      for (let y = 0; y <= Math.min(radius, H - 1); y++) { sum += tmp[y * W + x]; count++; }
      for (let y = 0; y < H; y++) {
        next[y * W + x] = sum / count;
        const drop = y - radius, add = y + radius + 1;
        if (drop >= 0) { sum -= tmp[drop * W + x]; count--; }
        if (add < H) { sum += tmp[add * W + x]; count++; }
      }
    }
    cur = next;
  }
  const out = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) out[p] = cur[p] >= 128 ? 1 : 0;
  return out;
}

function median1d(src, window) {
  const half = window >> 1;
  const out = new Float64Array(src.length);
  const buf = [];
  for (let i = 0; i < src.length; i++) {
    buf.length = 0;
    for (let k = Math.max(0, i - half); k <= Math.min(src.length - 1, i + half); k++) buf.push(src[k]);
    buf.sort((a, b) => a - b);
    out[i] = buf[buf.length >> 1];
  }
  return out;
}

function mean1d(src, window) {
  const half = window >> 1;
  const out = new Float64Array(src.length);
  for (let i = 0; i < src.length; i++) {
    let sum = 0, count = 0;
    for (let k = Math.max(0, i - half); k <= Math.min(src.length - 1, i + half); k++) { sum += src[k]; count++; }
    out[i] = sum / count;
  }
  return out;
}

/**
 * Stretch an illumination map onto [shadow, lit] using robust percentiles.
 *
 * The percentile clamp matters: a single blown-out specular pixel would
 * otherwise define the white point and flatten everything else. Returns a NEW
 * array plus the 0..1 normalized map, which `buildHighlight` reuses.
 */
export function normalizeShading(shade, W, H, isBg, { shadow = 156, lit = 252, loPct = 0.03, hiPct = 0.97 } = {}) {
  const hist = new Float64Array(256);
  let total = 0;
  for (let p = 0; p < W * H; p++) {
    if (isBg[p]) continue;
    const v = Math.max(0, Math.min(255, Math.round(shade[p])));
    hist[v]++;
    total++;
  }
  const pick = (frac) => {
    let acc = 0;
    const target = total * frac;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= target) return v;
    }
    return 255;
  };
  const lo = pick(loPct);
  const hi = Math.max(pick(hiPct), lo + 1);

  const gray = new Float32Array(W * H);
  const unit = new Float32Array(W * H);
  for (let p = 0; p < W * H; p++) {
    if (isBg[p]) continue;
    const t = Math.max(0, Math.min(1, (shade[p] - lo) / (hi - lo)));
    unit[p] = t;
    gray[p] = shadow + t * (lit - shadow);
  }
  return { gray, unit, lo, hi };
}

/**
 * Per-zone variant of `normalizeShading`, and the reason the board's original
 * complaint is properly answered rather than merely muted.
 *
 * The source garment's zones are different MATERIALS with different intrinsic
 * lightness — a white waistband, a printed body, dusty-pink cuffs; mint shell
 * and a darker pink lining on the Mütze. A single global stretch bakes that
 * lightness difference into the base, so picking the same colour for two zones
 * still rendered them as two different colours. Stretching each zone against
 * its OWN percentiles removes the material term and keeps only the lighting,
 * so identical swatches now render identically.
 *
 * Each zone's bright end is anchored at `lit`, so every zone renders its
 * chosen swatch at (near) full strength somewhere. `minSpan` caps how much a
 * nearly-uniform zone can be stretched, which stops sensor noise in a small
 * flat zone from being amplified into visible mottling.
 *
 * @param {Float32Array} shade
 * @param {Array<Uint8Array>} zones  binary zone maps; pixels in none of them
 *                                   fall back to global statistics
 */
export function normalizeShadingZoned(shade, W, H, isBg, zones, {
  shadow = 170,
  lit = 252,
  loPct = 0.05,
  hiPct = 0.95,
  minSpan = 45,
} = {}) {
  const zoneOf = new Int32Array(W * H).fill(-1);
  zones.forEach((z, idx) => {
    for (let p = 0; p < W * H; p++) if (z[p] && !isBg[p]) zoneOf[p] = idx;
  });

  const stats = [];
  for (let idx = -1; idx < zones.length; idx++) {
    const hist = new Float64Array(256);
    let total = 0;
    for (let p = 0; p < W * H; p++) {
      if (isBg[p] || zoneOf[p] !== idx) continue;
      hist[Math.max(0, Math.min(255, Math.round(shade[p])))]++;
      total++;
    }
    if (total === 0) { stats[idx + 1] = null; continue; }
    const pick = (frac) => {
      let acc = 0;
      const target = total * frac;
      for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) return v; }
      return 255;
    };
    const lo = pick(loPct);
    const hi = pick(hiPct);
    stats[idx + 1] = { lo, hi, span: Math.max(hi - lo, minSpan) };
  }

  const gray = new Float32Array(W * H);
  const unit = new Float32Array(W * H);
  for (let p = 0; p < W * H; p++) {
    if (isBg[p]) continue;
    const s = stats[zoneOf[p] + 1] ?? stats[0];
    if (!s) continue;
    // Anchor at the bright end: hi → 1, hi − span → 0.
    const t = Math.max(0, Math.min(1, (shade[p] - s.hi) / s.span + 1));
    unit[p] = t;
    gray[p] = shadow + t * (lit - shadow);
  }
  return { gray, unit, stats };
}

/**
 * Chamfer distance (3-4 / 3 approximation of Euclidean) from every pixel where
 * `seed[p]` is truthy. Distances are in px and capped at `max`.
 */
export function distanceFrom(seed, W, H, max = 64) {
  const BIG = max * 4;
  const d = new Float32Array(W * H).fill(BIG);
  for (let p = 0; p < W * H; p++) if (seed[p]) d[p] = 0;

  const relax = (p, q, w) => { const v = d[q] + w; if (v < d[p]) d[p] = v; };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (y > 0) relax(p, p - W, 1);
      if (y > 0 && x > 0) relax(p, p - W - 1, 1.41421356);
      if (y > 0 && x < W - 1) relax(p, p - W + 1, 1.41421356);
      if (x > 0) relax(p, p - 1, 1);
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const p = y * W + x;
      if (y < H - 1) relax(p, p + W, 1);
      if (y < H - 1 && x < W - 1) relax(p, p + W + 1, 1.41421356);
      if (y < H - 1 && x > 0) relax(p, p + W - 1, 1.41421356);
      if (x < W - 1) relax(p, p + 1, 1);
    }
  }
  for (let p = 0; p < W * H; p++) if (d[p] > max) d[p] = max;
  return d;
}

const smoothstep = (t) => {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return u * u * (3 - 2 * u);
};

/**
 * Ambient occlusion along the silhouette. Without this the garment reads as a
 * sticker: a flat fill that ends at a hard cut. A gentle darkening in the last
 * few px gives the edge roll-off a real photographed object has.
 */
export function applyEdgeShadow(gray, W, H, isBg, { radius = 16, strength = 0.16 } = {}) {
  const d = distanceFrom(isBg, W, H, radius + 2);
  for (let p = 0; p < W * H; p++) {
    if (isBg[p]) continue;
    const f = 1 - strength * (1 - smoothstep(d[p] / radius));
    gray[p] *= f;
  }
  return gray;
}

/**
 * Soft seam valley along a zone boundary.
 *
 * `boundary` marks the pixels where two zones meet. Because it is derived from
 * the real masks, the resulting shadow follows the garment's actual seam line
 * (curved waistband, differently-angled leg cuffs) instead of the straight
 * horizontal rule the previous version baked in. A narrow highlight just
 * outside the valley reads as the fabric rolling over the stitch.
 */
export function applySeamShadow(gray, W, H, isBg, boundary, {
  radius = 9,
  strength = 0.2,
  core = 3,
  highlight = 0.05,
} = {}) {
  const d = distanceFrom(boundary, W, H, radius + 6);
  for (let p = 0; p < W * H; p++) {
    if (isBg[p]) continue;
    const dist = d[p];
    if (dist <= radius) {
      const t = Math.max(0, 1 - dist / radius);
      gray[p] *= 1 - strength * Math.pow(t, 1 / (core / 3));
    } else if (dist <= radius + 5) {
      const t = 1 - (dist - radius) / 5;
      gray[p] *= 1 + highlight * t;
    }
  }
  return gray;
}

/**
 * DIRECTIONAL seam relief — the Bündchen/Hauptteil transition, BIL-2470.
 *
 * `applySeamShadow` above puts a symmetric valley on the boundary. On a photo
 * of a real Pumphose the transition is nothing like symmetric, which is why the
 * board kept reading it as a vector outline rather than a seam. Measured on
 * public/products/pumphose/pumphose-05.jpg, going across a cuff hem:
 *
 *   body side   the main fabric is GATHERED into the cuff and tucks in behind
 *               the rolled hem, so it sits in shadow — a wide, fairly deep
 *               occlusion band, deepest right at the stitch line.
 *   the hem     the Bündchen is a folded-over rib tube; the fold rolls towards
 *               the light and reads as a narrow BRIGHT ridge, 3-5 px.
 *   cuff side   below the ridge the cuff falls away from the light again, so a
 *               gentle darkening over ~25 px before it settles.
 *
 * Reproducing that asymmetry (dark / bright / gentle) is what makes the edge
 * read as two pieces of fabric sewn together instead of one shape with a stroke
 * around it.
 *
 * BIL-2473 — two corrections, both measured back against the same photo:
 *
 *   `ridge.offset`  The bright fold does NOT peak on the stitch line. Sampling
 *                   pumphose-05 across the left cuff (source x=350) gives
 *                   body 205 → 151 at the seam → 190 on the cuff: the darkest
 *                   pixel straddles the join and the cuff only recovers a few
 *                   px later. Peaking the ridge at distance 0 put a bright line
 *                   immediately against a dark line, which is a cartoon outline,
 *                   not a hem. Offsetting the peak into the cuff separates them.
 *   `ceiling`       The ridge is multiplicative, and the knit zones are already
 *                   normalised to `lit` (252), so `* 1.07` clipped to 255 — and
 *                   255 under `mix-blend-mode: multiply` is the swatch colour at
 *                   FULL saturation. That is why the hem rendered as a 1-2 px
 *                   stroke of pure, unshaded colour tracing the whole waistband.
 *                   Measured on the shipped base.webp at x=450: ... 250 255 |
 *                   167 182 ... — a hard 88-level step with a blown pixel on it.
 *   `occlusion.spill`
 *                   A real seam shadow does not stop dead at the stitch line; the
 *                   first few px of the cuff are shaded by the same tuck. Letting
 *                   the occlusion bleed a short way into the rolled zone removes
 *                   the remaining "two flat shapes butted together" read.
 *
 * @param {Uint8Array} boundary  seam pixels, e.g. from `boundaryBetween`
 * @param {Uint8Array} shadowed  zone whose fabric ducks BEHIND the seam (body)
 * @param {Uint8Array} rolled    zone with the rolled hem (cuff / waistband)
 */
export function applySeamRelief(gray, W, H, isBg, { boundary, shadowed, rolled }, {
  occlusion = { reach: 18, strength: 0.2, bias: 1.6, spill: 0 },
  ridge = { reach: 5, strength: 0.08, offset: 0 },
  falloff = { reach: 26, strength: 0.07 },
  ceiling = Infinity,
} = {}) {
  const spill = occlusion.spill ?? 0;
  const offset = ridge.offset ?? 0;
  const maxReach = Math.max(occlusion.reach, offset + ridge.reach, falloff.reach, spill);
  const d = distanceFrom(boundary, W, H, maxReach + 4);
  for (let p = 0; p < W * H; p++) {
    if (isBg[p]) continue;
    const dist = d[p];
    if (dist > maxReach) continue;
    if (shadowed[p]) {
      if (dist > occlusion.reach) continue;
      const t = 1 - dist / occlusion.reach;
      gray[p] *= 1 - occlusion.strength * Math.pow(t, occlusion.bias);
    } else if (rolled[p]) {
      if (spill > 0 && dist <= spill) {
        // Same tuck, other side of the stitch line: fades out much faster than
        // on the body, so the shadow stays legible as a line and not a band.
        gray[p] *= 1 - occlusion.strength * Math.pow(1 - dist / spill, occlusion.bias);
      }
      if (dist <= offset + ridge.reach) {
        // Peaks `offset` px in, easing to nothing at either end.
        const t = Math.abs(dist - offset) / ridge.reach;
        gray[p] = Math.min(ceiling, gray[p] * (1 + ridge.strength * (1 - smoothstep(t))));
      } else if (dist <= falloff.reach) {
        const t = (dist - offset - ridge.reach) / Math.max(1, falloff.reach - offset - ridge.reach);
        gray[p] *= 1 - falloff.strength * smoothstep(Math.min(1, t));
      }
    }
  }
  return gray;
}

/**
 * Gather folds running out of a seam into the gathered zone — BIL-2470.
 *
 * The main body of a Pumphose is sewn into a shorter cuff, so the surplus width
 * bunches up into a fan of near-vertical creases above the hem. Those creases
 * are the loudest "this is cloth, and it is sewn on" signal in the reference
 * photo, and the previous base had none of them: the fabric above the cuff was
 * a dead flat field, so the hem could only ever look drawn on.
 *
 * Both the waistband hem and the two leg hems run roughly horizontal, so the
 * creases are modelled as a 1-D signal along x whose amplitude decays with the
 * distance to the seam. Spacing is deliberately irregular (hash-jittered phase
 * accumulation, not a fixed period) — evenly spaced creases read as corduroy.
 * The profile is asymmetric too: broad soft ridges separated by narrower, deeper
 * valleys, which is how a fold in jersey actually catches light.
 */
export function applyGatherFolds(gray, W, H, isBg, zone, boundary, {
  reach = 70,
  amp = 7,
  period = 26,
  jitter = 0.55,
  decay = 1.4,
  seed = 2470,
} = {}) {
  const hash = (x) => {
    let h = (x * 2246822519 + seed * 374761393) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  // Accumulate phase column by column so crease spacing wanders instead of
  // repeating exactly; the >> 4 keeps a single crease coherent across ~16 px.
  const phase = new Float64Array(W);
  const strength = new Float64Array(W);
  let acc = 0;
  for (let x = 0; x < W; x++) {
    acc += (1 / period) * (1 + jitter * (hash(x >> 4) - 0.5) * 2);
    phase[x] = acc;
    // Coarser cell than the phase jitter, so prominence drifts across groups of
    // creases rather than flickering from one to the next.
    strength[x] = 0.5 + 1.0 * hash((x >> 6) + 9973);
  }

  const d = distanceFrom(boundary, W, H, reach + 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (isBg[p] || !zone[p]) continue;
      const dist = d[p];
      if (dist > reach) continue;
      const w = Math.cos(phase[x] * Math.PI * 2);
      // Soft ridge (w > 0) vs. sharper crease valley (w < 0).
      const shaped = w >= 0 ? w * 0.65 : -Math.pow(-w, 1.5);
      // Vary how prominent each crease is, not just where it sits. With a
      // constant amplitude the fan reads as ribbing; real gathers have a few
      // deep folds and a lot of shallow ones.
      gray[p] += shaped * amp * strength[x] * Math.pow(1 - dist / reach, decay);
    }
  }
  return gray;
}

/**
 * Gather creases radiating from a cinch point — BIL-2479.
 *
 * `applyGatherFolds` above models a garment gathered into a roughly HORIZONTAL
 * seam, so its crease signal is 1-D along x. The Mütze is a turban cap: both
 * halves of the shell are cinched into one small knot band in the middle of the
 * front, and the creases fan out from it in every direction. Sampled on
 * public/products/muetze/muetze-boho-mint-01.jpeg that fan is by far the
 * loudest structure on the garment — and it is exactly what the base lost,
 * because the boho print forces a heavy de-print pass (median 25 + blur 70,
 * see bil2445-build-muetze-assets.mjs) that erases fold and print alike.
 *
 * So the fan is re-synthesised: an angular crease signal around (cx, cy) whose
 * amplitude decays with radius. Angular frequency is constant, which means the
 * creases SPLAY as they travel out — the same thing gathered fabric does, since
 * a fixed amount of surplus width is spread over a growing arc.
 *
 * `jitter` wanders the angular spacing and `vary` the per-crease depth; without
 * both, a constant-frequency fan reads as a pinwheel rather than as cloth.
 * `inner` keeps the knot band itself flat — the fabric there is compressed under
 * the band, not creased.
 *
 * The accumulated phase is rescaled to close on a whole number of creases, so
 * the wrap at θ = ±π is continuous and no seam crease is left half-width.
 */
export function applyRadialGathers(gray, W, H, isBg, zone, {
  cx,
  cy,
  count = 26,
  amp = 6,
  inner = 40,
  reach = 320,
  decay = 1.3,
  jitter = 0.5,
  vary = 0.6,
  seed = 2479,
} = {}) {
  const hash = (x) => {
    let h = (x * 2246822519 + seed * 374761393) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };

  const BINS = 2048;
  const phase = new Float64Array(BINS);
  const depth = new Float64Array(BINS);
  let acc = 0;
  for (let i = 0; i < BINS; i++) {
    acc += (count / BINS) * (1 + jitter * (hash(i >> 5) - 0.5) * 2);
    phase[i] = acc;
    // Coarser cell than the spacing jitter: prominence drifts across groups of
    // creases instead of alternating from one to the next.
    depth[i] = 1 - vary * hash((i >> 7) + 7919);
  }
  const closed = Math.max(1, Math.round(acc));
  const scale = closed / acc;
  for (let i = 0; i < BINS; i++) phase[i] *= scale;

  const TWO_PI = Math.PI * 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (isBg[p] || !zone[p]) continue;
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r >= reach) continue;
      let bin = Math.floor(((Math.atan2(dy, dx) + Math.PI) / TWO_PI) * BINS);
      if (bin < 0) bin = 0;
      else if (bin >= BINS) bin = BINS - 1;
      const w = Math.cos(phase[bin] * TWO_PI);
      // Soft ridge (w > 0) against a sharper crease valley (w < 0), same
      // asymmetry as applyGatherFolds — that is how jersey folds catch light.
      const shaped = w >= 0 ? w * 0.65 : -Math.pow(-w, 1.5);
      const fade = smoothstep(r / inner) * Math.pow(1 - r / reach, decay);
      gray[p] += shaped * amp * depth[bin] * fade;
    }
  }
  return gray;
}

/**
 * Fine achromatic jersey grain.
 *
 * Uses a deterministic hash (no Math.random) so rebuilding the assets from the
 * same photo is byte-reproducible. `cell` > 1 keeps the grain coarse enough to
 * survive the downsample to the 900px delivery size.
 */
export function applyGrain(gray, W, H, isBg, { amp = 3.2, cell = 2, seed = 2461 } = {}) {
  const hash = (x, y) => {
    let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (isBg[p]) continue;
      const cx = (x / cell) | 0;
      const cy = (y / cell) | 0;
      // Two octaves: speckle plus a faint horizontal weave bias.
      const n = hash(cx, cy) - 0.5 + 0.5 * (hash(cx >> 2, cy) - 0.5);
      gray[p] += n * 2 * amp;
    }
  }
  return gray;
}

/**
 * Subtle vertical ribbing, for knitted cuff/waistband zones.
 *
 * A flat-filled cuff is the single most "vector graphic" looking part of the
 * preview, because real Bündchen are ribbed knit. The stripe is achromatic and
 * shallow, so it reads as knit structure without competing with the chosen
 * fabric. `fade` softens the rib out towards the zone border so it does not
 * end in a hard stripe against the seam.
 *
 * BIL-2473 adds `jitter` (spacing wanders) and `vary` (per-wale depth wanders),
 * both defaulting to 0 so existing Mütze/Turban/Dreieckstuch callers rebuild
 * byte-identically. They exist because a perfectly regular stripe is only right
 * for machine rib. The Hose waistband is smooth jersey held by an elastic, so
 * what it actually shows are irregular vertical STRETCH CREASES — same code
 * path, but even spacing there reads as corduroy printed on latex, which is
 * exactly what the board rejected.
 */
export function applyRib(gray, W, H, zone, {
  period = 9, amp = 3.5, fade = 6, knit = 0, jitter = 0, vary = 0, seed = 2473,
} = {}) {
  const inZone = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) if (!zone[p]) inZone[p] = 1; // seed = outside
  const d = distanceFrom(inZone, W, H, fade + 2);

  const hash = (x) => {
    let h = (x * 2246822519 + seed * 374761393) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  // Per-column phase and depth, precomputed once: the wale pattern is a 1-D
  // signal along x. `>> 4` / `>> 6` keep a single crease (and a group of them)
  // coherent instead of flickering column to column.
  const phase = new Float64Array(W);
  const depth = new Float64Array(W);
  let acc = 0;
  for (let x = 0; x < W; x++) {
    acc += (1 / period) * (1 + jitter * (hash(x >> 4) - 0.5) * 2);
    phase[x] = jitter > 0 ? acc : x / period;
    depth[x] = 1 - vary * hash((x >> 6) + 7919);
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (!zone[p]) continue;
      const s = Math.sin(phase[x] * Math.PI * 2);
      // knit = 0 keeps the original sine (Mütze/Turban callers unchanged).
      // knit > 0 blends towards a real 1x1 rib cross-section: a broad rounded
      // wale with a narrow, deeper valley between it and the next one.
      const wave = knit > 0
        ? s * (1 - knit) + knit * (s >= 0 ? Math.pow(s, 0.7) : -Math.pow(-s, 2.2))
        : s;
      gray[p] += wave * amp * depth[x] * smoothstep(d[p] / fade);
    }
  }
  return gray;
}

/**
 * Sheen layer for `mix-blend-mode: screen`.
 *
 * Multiply alone can only darken, so a dark tint (navy, forest) loses its lit
 * side and turns into a muddy blob. Screening a faint achromatic highlight on
 * top restores it. Black = no effect, so only the brightest part of the
 * illumination map contributes.
 *
 * `damp` (BIL-2473) is an optional per-pixel 0..1 multiplier. The knit zones are
 * both bright AND — before this ticket — nearly textureless, so the sheen was
 * the only structure left on them and the waistband rendered as a broad specular
 * gradient: latex, not jersey. Damping the sheen where the fabric now carries
 * its own crease structure keeps the lit side for dark tints without the gloss.
 */
export function buildHighlight(unit, W, H, isBg, { start = 0.72, gain = 0.3, damp = null } = {}) {
  const out = new Float32Array(W * H);
  for (let p = 0; p < W * H; p++) {
    if (isBg[p]) continue;
    const t = (unit[p] - start) / (1 - start);
    out[p] = Math.max(0, Math.min(1, t)) * gain * 255 * (damp ? damp[p] : 1);
  }
  return out;
}

/** Pack a 0..255 gray Float32Array into an RGBA buffer, bg fully transparent. */
export function grayToRGBA(gray, W, H, isBg) {
  const rgba = Buffer.alloc(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    if (isBg[p]) continue;
    const v = Math.max(0, Math.min(255, Math.round(gray[p])));
    const o = p * 4;
    rgba[o] = v;
    rgba[o + 1] = v;
    rgba[o + 2] = v;
    rgba[o + 3] = 255;
  }
  return rgba;
}

/** Mark pixels that sit on the border between two zone masks (both > 0). */
export function boundaryBetween(maskA, maskB, W, H, isBg) {
  const out = new Uint8Array(W * H);
  const inA = (p) => maskA[p] > 127;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      if (isBg[p] || !inA(p)) continue;
      for (const q of [p - 1, p + 1, p - W, p + W]) {
        if (!isBg[q] && maskB[q] > 127) { out[p] = 1; break; }
      }
    }
  }
  return out;
}
