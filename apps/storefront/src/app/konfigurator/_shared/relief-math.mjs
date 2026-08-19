/**
 * BIL-2522 — per-pixel maths for the relief fabric layer.
 *
 * Deliberately dependency-free plain ESM so it has exactly ONE implementation:
 * the browser layer (relief-layer.tsx) imports it, and so does the Node build
 * and evidence pipeline (scripts/lib/bil2522-relief.mjs, scripts/bil2522-*.mjs)
 * straight off disk. If these ever forked, an offline before/after sheet would
 * stop being evidence about what the shop actually renders — which is the one
 * thing the board is being asked to sign off.
 *
 * Do not add imports here, and do not use anything that is not available in
 * both Node and the browser.
 */

/** Displacement encoded by the relief map's R/G channels, in source pixels. */
export const WARP_RANGE = 36;

export const RENDER = {
  /** Saturation left in the deepest shadow (1 = no falloff at all). */
  satMin: 0.58,
  satGamma: 0.85,
  /** Shade below which the cool ambient starts bleeding in. */
  shadowKnee: 0.62,
  shadowTint: [126, 132, 148],
  shadowTintAmt: 0.22,
  /** Shade above which the warm key light starts colouring the fabric. */
  litKnee: 0.9,
  lightTint: [255, 244, 228],
  lightAmt: 0.17,
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (t) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};

/** ±this many 1/255 steps of jersey grain on the shading. */
const GRAIN_AMP = 2.6;

/**
 * Per-pixel fabric grain, derived from the coordinates instead of baked into
 * the relief map.
 *
 * A woven jersey is never a perfectly smooth ramp, and a smooth one is the
 * giveaway that the shading was computed rather than photographed. But noise
 * is exactly what a lossless codec cannot compress: baking it into relief.webp
 * cost ~45kB for something both renderers can regenerate for free.
 */
export function fabricGrain(x, y) {
  const h = (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 8;
  return ((h & 255) / 255 - 0.5) * ((GRAIN_AMP / 255) * 2);
}

/**
 * Shade one fabric sample.
 *
 * @param {ArrayLike<number>} rgb  fabric sample, 0..255
 * @param {number} shade  0..1 from the relief map's B channel
 * @param {number[]|Float32Array} out  destination triple
 */
export function shadeFabric(rgb, shade, out, cfg = RENDER) {
  let r = rgb[0] * shade;
  let g = rgb[1] * shade;
  let b = rgb[2] * shade;

  // Light does not just dim a fabric, it drains it: in shadow the dye reads
  // greyer, not merely darker. Constant-chroma multiply — what the shipped CSS
  // stack does — is exactly what made the tile look like a sticker.
  const sat = cfg.satMin + (1 - cfg.satMin) * Math.pow(clamp(shade, 0, 1), cfg.satGamma);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  r = lum + (r - lum) * sat;
  g = lum + (g - lum) * sat;
  b = lum + (b - lum) * sat;

  // Ambient fill in the deep shadows — a touch of the room's cool bounce.
  const t = smoothstep((cfg.shadowKnee - shade) / cfg.shadowKnee) * cfg.shadowTintAmt;
  if (t > 0) {
    r = r * (1 - t) + cfg.shadowTint[0] * shade * t;
    g = g * (1 - t) + cfg.shadowTint[1] * shade * t;
    b = b * (1 - t) + cfg.shadowTint[2] * shade * t;
  }

  // Key light, screened in so it lifts without flattening the hue.
  const w = smoothstep((shade - cfg.litKnee) / (1 - cfg.litKnee)) * cfg.lightAmt;
  if (w > 0) {
    r = 255 - ((255 - r) * (255 - cfg.lightTint[0] * w)) / 255;
    g = 255 - ((255 - g) * (255 - cfg.lightTint[1] * w)) / 255;
    b = 255 - ((255 - b) * (255 - cfg.lightTint[2] * w)) / 255;
  }

  out[0] = clamp(Math.round(r), 0, 255);
  out[1] = clamp(Math.round(g), 0, 255);
  out[2] = clamp(Math.round(b), 0, 255);
  return out;
}

/**
 * Catmull-Rom sample of a wrapping RGB tile.
 *
 * Bilinear was the obvious choice and it cost visible sharpness: with the warp
 * applied every pixel lands on a fractional texel, so the whole print picked up
 * a half-pixel blur and read softer than the untouched CSS tile it replaces. A
 * softer print is a *less* convincing one — the comparison is a studio photo.
 *
 * `stride` is 3 for a packed RGB buffer (Node/sharp) and 4 for ImageData.
 */
const crWeights = (t, w) => {
  const t2 = t * t;
  const t3 = t2 * t;
  w[0] = 0.5 * (-t3 + 2 * t2 - t);
  w[1] = 0.5 * (3 * t3 - 5 * t2 + 2);
  w[2] = 0.5 * (-3 * t3 + 4 * t2 + t);
  w[3] = 0.5 * (t3 - t2);
};
const WX = [0, 0, 0, 0];
const WY = [0, 0, 0, 0];

export function sampleTile(tile, TW, TH, u, v, out, stride = 3) {
  let x = u % TW;
  if (x < 0) x += TW;
  let y = v % TH;
  if (y < 0) y += TH;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  crWeights(x - x0, WX);
  crWeights(y - y0, WY);
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  for (let j = 0; j < 4; j++) {
    const yy = (((y0 + j - 1) % TH) + TH) % TH;
    const wy = WY[j];
    if (wy === 0) continue;
    const row = yy * TW;
    for (let i = 0; i < 4; i++) {
      const xx = (((x0 + i - 1) % TW) + TW) % TW;
      const w = wy * WX[i];
      const idx = (row + xx) * stride;
      out[0] += tile[idx] * w;
      out[1] += tile[idx + 1] * w;
      out[2] += tile[idx + 2] * w;
    }
  }
  // Catmull-Rom overshoots at hard print edges; clamping keeps it in gamut.
  for (let c = 0; c < 3; c++) out[c] = out[c] < 0 ? 0 : out[c] > 255 ? 255 : out[c];
  return out;
}

/**
 * Tile width as a share of the photo width — same 42% the shipped CSS stack
 * uses, so switching a zone to the relief renderer never changes print scale.
 */
export const TILE_PERCENT = 42;

/**
 * Cut pieces are not one sheet of wallpaper. A waistband is a separate panel
 * with its own placement on the bolt, so the print must NOT run continuously
 * across the seam — that continuity is the second-loudest composite tell after
 * the missing warp. Offsets are fractions of a tile, deterministic per zone.
 */
export const GRAIN = {
  bund: { ox: 0.37, oy: 0.14, scale: 1 },
  buendchen: { ox: 0.68, oy: 0.55, scale: 0.94 },
  schleife: { ox: 0.41, oy: 0.27, scale: 0.9 },
  futter: { ox: 0.55, oy: 0.62, scale: 1 },
  halsbund: { ox: 0.37, oy: 0.14, scale: 0.94 },
  aermelbund: { ox: 0.68, oy: 0.55, scale: 0.94 },
};

export const grainFor = (zone) => GRAIN[zone] ?? { ox: 0, oy: 0, scale: 1 };

/** Tile edge length in px for a photo `W` wide and a given zone's grain. */
export const tilePx = (W, grain) =>
  Math.max(2, Math.round(((TILE_PERCENT * grain.scale) / 100) * W));

/**
 * Area-average resample of a swatch to the on-screen tile size, returning a
 * packed RGB buffer.
 *
 * This exists because the resampler has to be *the same* on both sides. sharp
 * downscales with Lanczos3 and Chromium's drawImage does something else, and
 * the two disagreed by up to 47/255 on a finely detailed print — enough that
 * an offline evidence sheet would no longer be a statement about what the shop
 * renders. Box averaging is the correct filter for minification anyway, and
 * doing it once per tile costs nothing.
 */
export function resampleTile(src, sw, sh, stride, dw, dh) {
  const out = new Uint8ClampedArray(dw * dh * 3);
  const sx = sw / dw;
  const sy = sh / dh;
  for (let dy = 0; dy < dh; dy++) {
    const y0 = dy * sy;
    const y1 = y0 + sy;
    const iy0 = Math.floor(y0);
    const iy1 = Math.min(sh, Math.ceil(y1));
    for (let dx = 0; dx < dw; dx++) {
      const x0 = dx * sx;
      const x1 = x0 + sx;
      const ix0 = Math.floor(x0);
      const ix1 = Math.min(sw, Math.ceil(x1));
      let r = 0;
      let g = 0;
      let b = 0;
      let wsum = 0;
      for (let y = iy0; y < iy1; y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        if (wy <= 0) continue;
        const row = y * sw;
        for (let x = ix0; x < ix1; x++) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0);
          if (wx <= 0) continue;
          const w = wx * wy;
          const i = (row + x) * stride;
          r += src[i] * w;
          g += src[i + 1] * w;
          b += src[i + 2] * w;
          wsum += w;
        }
      }
      const o = (dy * dw + dx) * 3;
      out[o] = Math.round(r / wsum);
      out[o + 1] = Math.round(g / wsum);
      out[o + 2] = Math.round(b / wsum);
    }
  }
  return out;
}

/**
 * Quarter-turn of a packed RGB tile. A pure index permutation, so it is
 * bit-exact in Node and the browser — unlike asking either one's image
 * pipeline to rotate for us.
 */
export function rotateTile(src, w, h, rotation) {
  const r = ((rotation % 360) + 360) % 360;
  if (r === 0) return { data: src, TW: w, TH: h };
  const quarter = r === 90 || r === 270;
  const dw = quarter ? h : w;
  const dh = quarter ? w : h;
  const out = new Uint8ClampedArray(dw * dh * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx;
      let ny;
      if (r === 90) {
        nx = h - 1 - y;
        ny = x;
      } else if (r === 180) {
        nx = w - 1 - x;
        ny = h - 1 - y;
      } else {
        nx = y;
        ny = w - 1 - x;
      }
      const si = (y * w + x) * 3;
      const di = (ny * dw + nx) * 3;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
    }
  }
  return { data: out, TW: dw, TH: dh };
}

/**
 * Swatch pixels -> the tile this renderer samples. `stride` is 3 for a packed
 * RGB buffer (sharp) and 4 for ImageData (canvas).
 */
export function buildTile(src, sw, sh, stride, px, rotation) {
  const scaled = resampleTile(src, sw, sh, stride, px, px);
  const { data, TW, TH } = rotateTile(scaled, px, px, rotation);
  return { data, TW, TH, stride: 3 };
}

/**
 * Composite one fabric zone into an RGBA destination.
 *
 * Shared by the browser canvas and the Node evidence renderer so both walk the
 * pixels in the same order with the same rounding.
 *
 * @param {Uint8ClampedArray|Uint8Array} dst  RGBA, W*H*4, straight alpha
 * @param {Uint8ClampedArray|Uint8Array} relief  RGBA relief map, W*H*4
 * @param {ArrayLike<number>} maskAlpha  W*H alpha, 0..255
 * @param {{data: ArrayLike<number>, TW: number, TH: number, stride: number}} tile
 */
export function paintReliefZone(dst, relief, maskAlpha, tile, W, H, grain, y0 = 0, y1 = H) {
  const { data, TW, TH, stride } = tile;
  // `background-position: center` in the shipped stack; the grain offset then
  // slides this zone's panel off the shared grid.
  const offX = (W - TW) / 2 - grain.ox * TW;
  const offY = (H - TH) / 2 - grain.oy * TH;
  const smp = [0, 0, 0];
  const shaded = [0, 0, 0];
  // `y0`/`y1` let the browser paint the zone in horizontal bands and yield in
  // between. Every pixel is independent here, so a band is exactly the same
  // work as the full pass — no seams, and Node still calls it once for the
  // whole image.
  for (let p = y0 * W, end = y1 * W; p < end; p++) {
    const a = maskAlpha[p] / 255;
    if (a <= 0) continue;
    const x = p % W;
    const y = (p / W) | 0;
    const dx = ((relief[p * 4] - 128) / 127) * WARP_RANGE;
    const dy = ((relief[p * 4 + 1] - 128) / 127) * WARP_RANGE;
    const shade = relief[p * 4 + 2] / 255 + fabricGrain(x, y);
    sampleTile(data, TW, TH, x + dx - offX, y + dy - offY, smp, stride);
    shadeFabric(smp, shade, shaded);
    // Straight-alpha "over": zones are disjoint in practice, but the feathered
    // mask borders do overlap and must blend rather than punch each other out.
    const da = dst[p * 4 + 3] / 255;
    const outA = a + da * (1 - a);
    for (let c = 0; c < 3; c++) {
      const back = dst[p * 4 + c] * da * (1 - a);
      dst[p * 4 + c] = outA > 0 ? Math.round((shaded[c] * a + back) / outA) : 0;
    }
    dst[p * 4 + 3] = Math.round(outA * 255);
  }
  return dst;
}
