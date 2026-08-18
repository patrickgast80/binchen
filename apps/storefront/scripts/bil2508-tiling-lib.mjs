// BIL-2508 — second pass on the Konfigurator fabric tiles.
//
// BIL-2497 made every tile *wrap* (the last column equals the column before the
// first), and its seam-energy metric duly reported ~1.0 for all 35. The board's
// next photo still showed "Kacheln" on stoff-09. Both facts are true, and the
// gap between them is the whole lesson:
//
//   The BIL-2497 metric compares the tile's last pixel column against its
//   first. The BIL-2497 algorithm cross-fades exactly that boundary to
//   equality. So the metric measured the one thing the algorithm guarantees —
//   it could
//   not have reported a failure. The visible damage sat 30-60 px *inside* the
//   band, where the min-error cut had routed a diagonal path.
//
// What that diagonal path does to a directional print is the actual bug. On
// stoff-09 (a medallion on a hand-painted vertical stripe ground) the y-pass
// cuts a wandering horizontal path across the stripes, so each column blends a
// different pair of stripe phases. The result is a fan of chevrons and a large
// diamond that exist nowhere in the fabric. Patrick read that — correctly — as
// "in Kacheln und nicht fließend".
//
// So this pass changes two things:
//
//   1. THE SEAM STAYS STRAIGHT. A straight seam cannot bend a stripe; the worst
//      it can do is ghost two stripes over the fade band, which still reads as
//      fabric. Sharpness inside the band is the price, and it is a much cheaper
//      price than inventing geometry.
//
//   2. THE CROP OFFSET IS SEARCHED, NOT FIXED. BIL-2497 took the centred square
//      and searched only the tile size, so it had one degree of freedom per
//      axis. The photos are 2040x1530, so a smaller window can slide ~500 px and
//      find a place where the two seam bands genuinely agree. Searching
//      (offset, size) per axis is what makes a straight seam affordable.
//
// Deliberately kept from BIL-2497 because they were right: the global quadratic
// flat-field (never a local blur — it tracks large motifs and washes them out),
// no mirror tiling (the collection has directional prints), and no blur on the
// output.
//
// The tile is no longer forced square. A square tile from a rectangular crop
// would have to squash the print; the physical fabric region is what should be
// preserved, so the output keeps the crop's aspect ratio and is scaled to
// **equal area** with the old 512x512, which keeps the BIL-2493 byte budget.

import sharp from "sharp";

const CH = 3;

export function lumaOf({ data, width, height }) {
  const l = new Float32Array(width * height);
  for (let i = 0; i < l.length; i += 1) {
    const o = i * CH;
    l[i] = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
  }
  return l;
}

export function transpose({ data, width, height }) {
  const out = Buffer.allocUnsafe(width * height * CH);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const s = (y * width + x) * CH;
      const d = (x * height + y) * CH;
      for (let c = 0; c < CH; c += 1) out[d + c] = data[s + c];
    }
  }
  return { data: out, width: height, height: width };
}

export function toSharp(img) {
  return sharp(Buffer.from(img.data), {
    raw: { width: img.width, height: img.height, channels: CH },
  });
}

/**
 * Loads the photo at working resolution *without* cropping it square.
 *
 * BIL-2497 cropped the largest centred square first, which threw away the
 * ~500 px of slack that the portrait/landscape photos have on their long axis —
 * exactly the slack the offset search needs.
 */
export async function loadFlatSource(src, work) {
  const { data, info } = await sharp(src, { failOn: "none" })
    .rotate()
    .resize({ width: work, height: work, fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Picks (offset, size) for a straight wrap along x.
 *
 * `cost` is the mean squared luma difference between the band that will become
 * the tile's left edge and the band `size` pixels to its right — i.e. exactly
 * the content that the cross-fade will have to reconcile. Minimising it is the
 * same thing as minimising the ghosting, so the search optimises the artefact
 * we actually ship rather than a proxy.
 *
 * The size range is deliberately wide (down to 55 % of the photo). A print with
 * a real repeat wants a size near that repeat; forcing >= 70 % as BIL-2497 did
 * ruled out the correct size for the tighter prints.
 */
export function pickWrapX(img, { minFrac = 0.55, maxFrac = 0.95, bandFrac = 0.12, step = 3 } = {}) {
  const { width, height } = img;
  const lum = lumaOf(img);
  const colDiff = (a, b) => {
    let s = 0;
    let n = 0;
    for (let y = 0; y < height; y += 2, n += 1) {
      const d = lum[y * width + a] - lum[y * width + b];
      s += d * d;
    }
    return s / n;
  };
  let best = null;
  for (let tw = Math.round(width * minFrac); tw <= Math.round(width * maxFrac); tw += step) {
    const band = Math.max(10, Math.round(tw * bandFrac));
    if (tw + band > width) continue;
    for (let ox = 0; ox + tw + band <= width; ox += step) {
      let s = 0;
      let n = 0;
      for (let k = 0; k < band; k += 3, n += 1) s += colDiff(ox + k, ox + tw + k);
      const c = s / n;
      if (!best || c < best.cost) best = { size: tw, offset: ox, band, cost: c };
    }
  }
  return best;
}

/**
 * Applies the straight wrap chosen by {@link pickWrapX}.
 *
 * Output column 0 is a full cross-fade to the pixel that physically *follows*
 * output column `size - 1` in the photo, so the repeat continues the fabric.
 * The fade is linear across the whole band: at x = 0 it is purely the
 * continuation and at x = band purely the crop, which is what makes the tile
 * wrap exactly.
 */
export function applyWrapX(img, { size, offset, band }) {
  const { data, width, height } = img;
  const at = (x, y) => (y * width + x) * CH;
  const out = Buffer.allocUnsafe(size * height * CH);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const o = (y * size + x) * CH;
      const sx = offset + x;
      if (x >= band) {
        data.copy(out, o, at(sx, y), at(sx, y) + CH);
        continue;
      }
      const t = 1 - x / band;
      const a = at(sx, y);
      const b = at(offset + size + x, y);
      for (let c = 0; c < CH; c += 1) {
        out[o + c] = Math.round(data[b + c] * t + data[a + c] * (1 - t));
      }
    }
  }
  return { data: out, width: size, height };
}

/**
 * Structure damage: how much of the print's gradient energy this tile moved
 * into orientations the source did not have.
 *
 * This is the check BIL-2497 was missing. A min-error cut across a striped
 * print converts vertical edges into diagonal ones; a straight seam cannot. The
 * histogram is over four orientation bins, energy-weighted, normalised, and
 * compared to the same histogram computed on the untouched source crop. Values
 * are an L1 distance in [0, 2]; anything above ~0.06 is a print that visibly
 * grew shapes it did not have.
 */
export function orientationHistogram(img, region) {
  const { width, height } = img;
  const lum = lumaOf(img);
  const bins = new Float64Array(4);
  const x0 = region?.x0 ?? 1;
  const x1 = region?.x1 ?? width - 1;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = Math.max(1, x0); x < Math.min(width - 1, x1); x += 1) {
      const gx = lum[y * width + x + 1] - lum[y * width + x - 1];
      const gy = lum[(y + 1) * width + x] - lum[(y - 1) * width + x];
      const mag = Math.hypot(gx, gy);
      if (mag < 6) continue; // ignore weave noise; we care about print structure
      // 0 = |, 1 = /, 2 = -, 3 = \  (angle of the *edge*, not the gradient)
      let a = Math.atan2(gy, gx); // [-pi, pi]
      if (a < 0) a += Math.PI;
      const bin = Math.min(3, Math.floor((a / Math.PI) * 4));
      bins[bin] += mag;
    }
  }
  const total = bins.reduce((s, v) => s + v, 0) || 1;
  return Array.from(bins, (v) => v / total);
}

export function histogramDistance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += Math.abs(a[i] - b[i]);
  return s;
}

/**
 * Does this print have large-scale directional structure? 0 = none, 1 = pure
 * stripe.
 *
 * This is what decides which of the two wraps a fabric gets, and it has to be
 * measured at **low frequency**. Measured on the full-resolution photo,
 * stoff-09 scores 0.29 — the medallion's dense line art is isotropic and swamps
 * the gradient budget, while the stripes it sits on are soft watercolour washes
 * with weak gradients. Downscale to ~96 px first and the line art disappears
 * while the stripes remain, and the same fabric scores 0.78.
 *
 * That distinction is the whole point: a wandering min-error cut is destructive
 * exactly when the print has structure that runs across the entire piece, and
 * such structure is by definition low-frequency.
 *
 * Structure tensor of the gradient field; the ratio of its eigenvalue spread to
 * its trace is orientation coherence, which is 1 for a single dominant edge
 * direction and 0 for an even mix.
 */
export function directionalCoherence(img, threshold = 2) {
  const { width, height } = img;
  const lum = lumaOf(img);
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const gx = lum[y * width + x + 1] - lum[y * width + x - 1];
      const gy = lum[(y + 1) * width + x] - lum[(y - 1) * width + x];
      if (Math.hypot(gx, gy) < threshold) continue;
      xx += gx * gx;
      yy += gy * gy;
      xy += gx * gy;
    }
  }
  const trace = xx + yy;
  if (!trace) return 0;
  return Math.sqrt((xx - yy) * (xx - yy) + 4 * xy * xy) / trace;
}

/** Mean gradient magnitude over a column range — "how much print is here". */
export function gradientEnergy(img, x0, x1) {
  const { width, height } = img;
  const lum = lumaOf(img);
  let s = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = Math.max(1, x0); x < Math.min(width - 1, x1); x += 1, n += 1) {
      const gx = lum[y * width + x + 1] - lum[y * width + x - 1];
      const gy = lum[(y + 1) * width + x] - lum[(y - 1) * width + x];
      s += Math.hypot(gx, gy);
    }
  }
  return n ? s / n : 0;
}

/**
 * How different the seam band looks from the rest of the same tile.
 *
 * This is the metric BIL-2497 needed and did not have. It is deliberately
 * *self-referential* — band versus interior of the same tile — because that is
 * exactly the comparison a customer's eye makes: the repeat is visible when one
 * strip of the print does not look like the rest of it.
 *
 * Two terms, one per failure mode:
 *   * orientation — a min-error cut across a stripe turns vertical edges into
 *     diagonal ones, so the band's edge-orientation mix stops matching the
 *     interior. This is what wrecked stoff-09.
 *   * energy — a straight cross-fade between two mismatched halves halves the
 *     local contrast, so the band goes soft. This is what ghosts a floral.
 *
 * Both wraps put their band at the start of the axis, so the band is columns
 * [0, band) and the interior is [band, width - band).
 */
export function seamBandAnomaly(img, band) {
  const { width } = img;
  const interiorEnd = Math.max(band + 8, width - band);
  const hBand = orientationHistogram(img, { x0: 0, x1: band });
  const hInt = orientationHistogram(img, { x0: band, x1: interiorEnd });
  const eBand = gradientEnergy(img, 0, band);
  const eInt = gradientEnergy(img, band, interiorEnd) || 1;
  return {
    orientation: histogramDistance(hBand, hInt),
    energy: Math.abs(Math.log(eBand / eInt || 1)),
  };
}

/**
 * Seam-band anomaly: local contrast inside the fade band relative to the rest
 * of the tile, measured on the *rolled* tile so the seam sits in the middle.
 *
 * Reported as a ratio. 1.0 = the band is as detailed as the rest of the print.
 * Below ~0.75 the cross-fade has visibly softened a stripe into a smear; above
 * ~1.3 something hard is sitting on the seam. Unlike BIL-2497's seam energy
 * this looks at the whole band, not at the single column the algorithm pins.
 */
export function bandContrastRatio(img, band) {
  const { data, width, height } = img;
  const at = (x, y) => (((y % height) + height) % height) * width * CH + ((((x % width) + width) % width) * CH);
  const colEnergy = (x) => {
    let s = 0;
    for (let y = 0; y < height; y += 1) {
      const a = at(x, y);
      const b = at(x + 1, y);
      for (let c = 0; c < CH; c += 1) s += Math.abs(data[a + c] - data[b + c]);
    }
    return s / (height * CH);
  };
  const inBand = [];
  const outBand = [];
  for (let x = 0; x < width; x += 1) {
    // The seam sits between column width-1 and column 0.
    const dist = Math.min(x, width - x);
    (dist <= band ? inBand : outBand).push(colEnergy(x));
  }
  const med = (arr) => {
    const s = [...arr].sort((p, q) => p - q);
    return s[s.length >> 1] || 1;
  };
  return med(inBand) / (med(outBand) || 1);
}
