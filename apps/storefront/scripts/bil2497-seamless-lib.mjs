// BIL-2497 — make the Konfigurator fabric swatches tile seamlessly.
//
// Board (Patrick, Telegram 2026-08-18): "Hier sieht der Stoff zusammengesetzt
// aus. Kannst du den Stoff nicht fließend erweitern dass es aussieht wie aus
// einem Stück?"
//
// The preview paints the swatch with `background-repeat: repeat`
// (zone-overlay.tsx) and the OG card does the same with sharp
// (`composite({tile: true})`). A swatch that is just a centre crop of a fabric
// photo therefore shows a hard rectangular grid: the crop's left edge abuts its
// own right edge, and neither the lighting nor the motifs line up.
//
// Two independent cues make that grid visible, and both have to go:
//
//   1. ILLUMINATION. The raw photos are lit from one side, so every tile is
//      brighter on one edge than the other. Repeated, that reads as a
//      chequerboard of light and dark blocks — visible even on a print where
//      the motifs happen to match. Fixed by dividing out a low-frequency
//      illumination estimate (see `flattenIllumination`).
//
//   2. GEOMETRY. Motifs are cut mid-flower at the crop edge and restart
//      abruptly. Fixed by a wrap-around overlap with a minimum-error boundary
//      cut (Efros/Freeman image quilting), see `seamlessWrap`.
//
// Explicitly NOT used, per the BIL-2444ff. blend-stack notes and the ticket's
// own guardrails:
//   * no blur on the output — blur kills the fabric weave and the fold texture
//     that the multiply/screen stack depends on. The only blur here estimates
//     the illumination field and is divided out, never composited.
//   * no mirror tiling — the collection has directional prints (whales, dinos,
//     lettering) where a mirrored repeat produces butterfly artefacts.
//   * no wide cross-fade — a 12 % feather band is a soft stripe on a busy
//     floral. The min-error cut moves the seam to where the content already
//     matches instead of smearing it.
//
// Rotation (BIL-2492) needs no extra work and is asserted by the metric script:
// a tile that wraps in x and in y still wraps after a quarter turn, because a
// quarter turn just swaps the two axes.

import sharp from "sharp";

/** RGB channel count we work in. Alpha is dropped — swatches are opaque. */
const CH = 3;

/**
 * Loads an image as a square, EXIF-rotated raw RGB buffer.
 * The square is the largest centred crop, so we never invent pixels.
 */
export async function loadSquareRaw(src, maxSide) {
  const img = sharp(src, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  const w = meta.width ?? maxSide;
  const h = meta.height ?? maxSide;
  const side = Math.min(w, h);
  let pipeline = img.extract({
    left: Math.floor((w - side) / 2),
    top: Math.floor((h - side) / 2),
    width: side,
    height: side,
  });
  const target = Math.min(side, maxSide);
  if (target !== side) pipeline = pipeline.resize(target, target, { fit: "fill" });
  const { data } = await pipeline.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: target, height: target };
}

/** Solves a small dense system in place (Gauss-Jordan with partial pivoting). */
function solve(a, b) {
  const n = b.length;
  for (let col = 0; col < n; col += 1) {
    let piv = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r;
    }
    if (Math.abs(a[piv][col]) < 1e-9) return null;
    [a[col], a[piv]] = [a[piv], a[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    const d = a[col][col];
    for (let c = col; c < n; c += 1) a[col][c] /= d;
    b[col] /= d;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const f = a[r][col];
      if (!f) continue;
      for (let c = col; c < n; c += 1) a[r][c] -= f * a[col][c];
      b[r] -= f * b[col];
    }
  }
  return b;
}

/**
 * Flat-field correction: divides out the photographic lighting so every tile
 * edge sits at the same brightness as the opposite edge.
 *
 * This matters as much as the geometry. The raw swatches are phone photos of
 * fabric on a table, so each one is brighter on the lit side. Repeated, that
 * gradient becomes a chequerboard of light and dark blocks — the grid stays
 * visible even where the motifs line up perfectly.
 *
 * The field is a least-squares **quadratic surface** over the whole image, not
 * a locally blurred copy. That distinction is the entire point: a local field
 * (a heavy blur, or a downscale-and-back) follows the print itself whenever the
 * motifs are large — on the unicorn swatches it tracked the unicorns, so
 * dividing by it darkened every unicorn and lifted the blue ground, and the
 * whole swatch came out washed and desaturated. Six coefficients can bend
 * across the frame like a lens vignette but cannot bend around a motif, so the
 * print's own contrast survives untouched.
 *
 * Gain is applied to all three channels equally (luma-only correction), so hue
 * and saturation are unchanged: a terracotta print stays terracotta. `maxGain`
 * caps how hard we may push, which keeps a badly lit corner from clipping.
 */
export async function flattenIllumination(img, { maxGain = 1.25, strength = 1 } = {}) {
  const { data, width, height } = img;
  const px = width * height;

  const lum = new Float32Array(px);
  let mean = 0;
  for (let i = 0; i < px; i += 1) {
    const o = i * CH;
    lum[i] = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
    mean += lum[i];
  }
  mean /= px;

  // Basis: 1, x, y, x², xy, y² with x, y normalised to [-1, 1].
  const N = 6;
  const ata = Array.from({ length: N }, () => new Float64Array(N));
  const atb = new Float64Array(N);
  const basis = new Float64Array(N);
  // Every 4th pixel is plenty to fit six coefficients and keeps this ~O(px/16).
  for (let y = 0; y < height; y += 4) {
    const ny = (2 * y) / (height - 1) - 1;
    for (let x = 0; x < width; x += 4) {
      const nx = (2 * x) / (width - 1) - 1;
      basis[0] = 1;
      basis[1] = nx;
      basis[2] = ny;
      basis[3] = nx * nx;
      basis[4] = nx * ny;
      basis[5] = ny * ny;
      const v = lum[y * width + x];
      for (let r = 0; r < N; r += 1) {
        atb[r] += basis[r] * v;
        for (let c = r; c < N; c += 1) ata[r][c] += basis[r] * basis[c];
      }
    }
  }
  for (let r = 0; r < N; r += 1) for (let c = 0; c < r; c += 1) ata[r][c] = ata[c][r];

  const k = solve(
    ata.map((row) => Array.from(row)),
    Array.from(atb),
  );
  if (!k) return img;

  const out = Buffer.allocUnsafe(px * CH);
  const minGain = 1 / maxGain;
  for (let y = 0; y < height; y += 1) {
    const ny = (2 * y) / (height - 1) - 1;
    for (let x = 0; x < width; x += 1) {
      const nx = (2 * x) / (width - 1) - 1;
      const fit =
        k[0] + k[1] * nx + k[2] * ny + k[3] * nx * nx + k[4] * nx * ny + k[5] * ny * ny;
      let g = fit > 1 ? mean / fit : 1;
      if (g > maxGain) g = maxGain;
      else if (g < minGain) g = minGain;
      g = 1 + (g - 1) * strength;
      const o = (y * width + x) * CH;
      for (let c = 0; c < CH; c += 1) {
        const v = data[o + c] * g;
        out[o + c] = v > 255 ? 255 : v < 0 ? 0 : v;
      }
    }
  }
  return { data: out, width, height };
}

/**
 * Minimum-error boundary cut through a band of `band` columns and `rows` rows.
 *
 * `cost(y, x)` must return how badly the two candidate sources disagree at
 * that pixel. Returns one cut column per row; columns up to and including the
 * cut come from the wrapped continuation, the rest from the original.
 */
function minErrorPath(rows, band, cost, wantCost = false) {
  const acc = new Float64Array(rows * band);
  const back = new Int32Array(rows * band);
  for (let x = 0; x < band; x += 1) acc[x] = cost(0, x);
  for (let y = 1; y < rows; y += 1) {
    for (let x = 0; x < band; x += 1) {
      let best = acc[(y - 1) * band + x];
      let bestX = x;
      if (x > 0 && acc[(y - 1) * band + x - 1] < best) {
        best = acc[(y - 1) * band + x - 1];
        bestX = x - 1;
      }
      if (x + 1 < band && acc[(y - 1) * band + x + 1] < best) {
        best = acc[(y - 1) * band + x + 1];
        bestX = x + 1;
      }
      acc[y * band + x] = cost(y, x) + best;
      back[y * band + x] = bestX;
    }
  }
  let cut = 0;
  for (let x = 1; x < band; x += 1) {
    if (acc[(rows - 1) * band + x] < acc[(rows - 1) * band + cut]) cut = x;
  }
  const total = acc[(rows - 1) * band + cut];
  const path = new Int32Array(rows);
  for (let y = rows - 1; y >= 0; y -= 1) {
    path[y] = cut;
    cut = back[y * band + cut];
  }
  return wantCost ? { path, cost: total / rows } : path;
}

/**
 * Picks the tile edge length.
 *
 * The seam is not equally hard at every size: a striped fabric whose stripes
 * repeat every 137 px wraps almost for free at a multiple of 137 and badly at
 * 137/2, and the same holds for any print with a real repeat. Fixing the tile
 * at "source minus 12 %" therefore left the stripe swatches with a visible
 * vertical jog — the cut had to step across a stripe because no matching path
 * existed at that particular size.
 *
 * So instead of guessing, score every candidate size by the thing we actually
 * care about — the cost of the best min-error path we would end up cutting —
 * and keep the cheapest. Scoring uses luma only; it decides *where* the fabric
 * repeats, and chroma adds cost without adding information.
 *
 * The lower bound on the search keeps at least ~70 % of the photo's field of
 * view, so the print never visibly shrinks in the preview.
 */
export function chooseTileSize(img, { minFrac = 0.7, maxFrac = 0.92, step = 4 } = {}) {
  const { data, width, height } = img;
  const lum = new Float32Array(width * height);
  for (let i = 0; i < lum.length; i += 1) {
    const o = i * CH;
    lum[i] = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
  }
  const S = Math.min(width, height);
  let best = null;
  for (let s = Math.round(S * minFrac); s <= Math.round(S * maxFrac); s += step) {
    const band = S - s;
    if (band < 8) continue;
    const cx = minErrorPath(
      height,
      band,
      (y, x) => {
        const d = lum[y * width + x] - lum[y * width + s + x];
        return d * d;
      },
      true,
    );
    const cy = minErrorPath(
      width,
      band,
      (x, y) => {
        const d = lum[y * width + x] - lum[(s + y) * width + x];
        return d * d;
      },
      true,
    );
    const score = cx.cost + cy.cost;
    if (!best || score < best.score) best = { size: s, band, score };
  }
  return best;
}

/**
 * Makes the x axis wrap. Input is `width x height`; output is
 * `(width - band) x height`.
 *
 * Output column `w-1` is source column `w-1` and output column 0 is source
 * column `w` (the pixel that physically follows it in the photo), so the repeat
 * continues the fabric instead of restarting it. Inside the band the cut
 * follows the path where the original and the continuation already agree, and a
 * ramp of `featherFrac * band` pixels swallows the remaining step.
 */
export function seamlessWrapX(img, { band, featherFrac = 0.3 } = {}) {
  const { data, width, height } = img;
  const w = width - band;
  const at = (x, y) => (y * width + x) * CH;

  // The cut alone is enough for a print whose motifs can be routed around, but
  // a hand-drawn stripe wobbles: the two candidates never agree exactly, and a
  // hard cut then shifts every stripe sideways by a few pixels — a row of
  // visible steps, which reads worse than the original grid. So the cut is
  // cross-faded over a ramp instead. Because the ramp is centred on the
  // *min-error path*, it blends two regions that already almost match, so it
  // costs no sharpness on a floral while it dissolves the step on a stripe.
  // (This is a local ramp along one seam, not a blur of the print — the fabric
  // weave and fold texture the multiply/screen stack needs stay intact.)
  // Ramp half-width. The ramp must sit fully inside the band: at x = 0 the
  // output has to be *exactly* the wrapped continuation and at x >= band
  // exactly the original, otherwise the tile stops wrapping and the seam comes
  // straight back. So the path is searched only in the sub-band that keeps the
  // whole ramp in range.
  let half = Math.max(0, Math.round((band * featherFrac) / 2));
  if (band - 2 * half < 4) half = Math.max(0, Math.floor((band - 4) / 2));
  const inner = band - 2 * half + 1;

  const cost = (y, x) => {
    const a = at(x + half, y);
    const b = at(w + x + half, y);
    let s = 0;
    for (let c = 0; c < CH; c += 1) {
      const d = data[a + c] - data[b + c];
      s += d * d;
    }
    return s;
  };
  const path = minErrorPath(height, inner, cost);

  const out = Buffer.allocUnsafe(w * height * CH);
  for (let y = 0; y < height; y += 1) {
    const cut = path[y] + half;
    for (let x = 0; x < w; x += 1) {
      const o = (y * w + x) * CH;
      if (x >= band) {
        data.copy(out, o, at(x, y), at(x, y) + CH);
        continue;
      }
      // t = 1 → wrapped continuation, t = 0 → original crop.
      let t = half === 0 ? (x <= cut ? 1 : 0) : (cut + half - x) / (2 * half);
      if (t > 1) t = 1;
      else if (t < 0) t = 0;
      const a = at(x, y);
      const b = at(w + x, y);
      for (let c = 0; c < CH; c += 1) {
        out[o + c] = Math.round(data[b + c] * t + data[a + c] * (1 - t));
      }
    }
  }
  return { data: out, width: w, height };
}

/** Transposes a raw RGB buffer, so the x pass can be reused for y. */
export function transpose(img) {
  const { data, width, height } = img;
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

/** Makes both axes wrap. Output is `(width - band) x (height - band)`. */
export function seamlessWrap(img, opts) {
  const x = seamlessWrapX(img, opts);
  return transpose(seamlessWrapX(transpose(x), opts));
}

/**
 * Seam energy: how much louder the wrap-around edge is than a normal interior
 * edge, per axis. 1.0 means the repeat boundary is statistically
 * indistinguishable from any other pixel column, i.e. invisible.
 *
 * Measured on the *encoded* tile, not the intermediate buffer, so it also
 * catches a seam re-introduced by WebP block artefacts or by a resize.
 */
export function seamEnergy(img) {
  const { data, width, height } = img;
  const at = (x, y) => (y * width + x) * CH;
  const meanAbs = (ax, bx, vertical) => {
    const n = vertical ? width : height;
    let s = 0;
    for (let i = 0; i < n; i += 1) {
      const a = vertical ? at(i, ax) : at(ax, i);
      const b = vertical ? at(i, bx) : at(bx, i);
      for (let c = 0; c < CH; c += 1) s += Math.abs(data[a + c] - data[b + c]);
    }
    return s / (n * CH);
  };
  const interior = (vertical) => {
    const n = vertical ? height : width;
    let s = 0;
    let k = 0;
    for (let i = 1; i < n; i += 1, k += 1) s += meanAbs(i - 1, i, vertical);
    return s / k;
  };
  const seamX = meanAbs(width - 1, 0, false);
  const seamY = meanAbs(height - 1, 0, true);
  const intX = interior(false);
  const intY = interior(true);
  return {
    x: seamX / (intX || 1),
    y: seamY / (intY || 1),
    seamX,
    seamY,
    interiorX: intX,
    interiorY: intY,
  };
}

/** Decodes any image file to a raw RGB buffer for measurement. */
export async function decodeRaw(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export function toSharp(img) {
  return sharp(Buffer.from(img.data), {
    raw: { width: img.width, height: img.height, channels: CH },
  });
}
