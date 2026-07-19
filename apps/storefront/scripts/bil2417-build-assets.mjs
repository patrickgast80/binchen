/**
 * Preprocess pumphose-05.jpg into the assets the Foto-Konfigurator needs.
 *
 * Outputs (all under public/konfigurator/hose-foto/):
 *   base.webp        — desaturated pants on transparent bg (WebP, ~800px tall)
 *   mask-bund.webp   — alpha mask for the upper waistband zone
 *   mask-hose.webp   — alpha mask for the main body zone
 *   mask-buendchen.webp — alpha mask for the lower cuffs zone
 *
 * The masks are pure white (255) inside their zone, transparent elsewhere. In
 * the browser they are used as CSS `mask-image` for coloured overlays with
 * `mix-blend-mode: multiply`, so the base photo's shading and texture come
 * through the tint (see task spec: soft-light/multiply, KEIN hue-rotate).
 *
 * Rerun this script whenever the source photo changes.
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const SRC = "public/products/pumphose/pumphose-05.jpg";
const OUT_DIR = "public/konfigurator/hose-foto";
await mkdir(OUT_DIR, { recursive: true });

// -- Load raw pixels of the source image ------------------------------------
const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;

const idx = (x, y) => (y * W + x) * 3;

// Background = near-white. Everything else belongs to the pants garment.
function isBackground(r, g, b) {
  return r > 240 && g > 240 && b > 240;
}

// -- Zone classification by Y (with side-cuff bulge) ------------------------
// From analyze-photo output on pumphose-05.jpg:
//   Bund runs y ≈ 177 (top) → 328 (elastic shirred seam, center)
//   Body runs y ≈ 328 → 880 (patterned floral)
//   Bündchen (pink cuffs) run y ≈ 880 → 1027 (bottom of each leg)
const BUND_END = 336;
const BUENDCHEN_START = 878;
// Feather = pixels blended across the seam so the recolour boundary is soft.
const FEATHER = 6;

// A few pixels of the cuff extend up along the outer side seam because the
// shirred waist is wider than the leg opening — but since the seam line is
// nearly horizontal, a Y-slab classifier is Good Enough (mask edges will be
// hidden by the multiply blend, no hard color transitions bleed).

// -- Build 4 raw buffers ----------------------------------------------------
const baseRGBA = Buffer.alloc(W * H * 4);          // grayscale + alpha
const maskBund = Buffer.alloc(W * H);              // alpha-only
const maskHose = Buffer.alloc(W * H);
const maskBuen = Buffer.alloc(W * H);

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    const r = data[i], g = data[i + 1], b = data[i + 2];

    if (isBackground(r, g, b)) {
      // Fully transparent everywhere.
      baseRGBA.writeUInt32BE(0, (y * W + x) * 4);
      continue;
    }

    // Perceived luminance (Rec. 709). Normalise so the darkest pixel goes to
    // ~40 and the brightest to ~230 — gives multiply-blend enough dynamic range
    // to preserve shadows without going pitch black.
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Compress into a friendlier range: keeps texture from washing to pure white.
    const gray = Math.round(60 + (lum / 255) * 175);
    const p = (y * W + x) * 4;
    baseRGBA[p]     = gray;
    baseRGBA[p + 1] = gray;
    baseRGBA[p + 2] = gray;
    baseRGBA[p + 3] = 255;

    // Zone mask — feather at the seam so recolour doesn't ring.
    const featherBund = 1 - clamp01((y - (BUND_END - FEATHER)) / (2 * FEATHER));
    const featherBuen = clamp01((y - (BUENDCHEN_START - FEATHER)) / (2 * FEATHER));
    const featherHose = 1 - featherBund - featherBuen; // clamped below
    const mi = y * W + x;
    maskBund[mi] = Math.round(255 * featherBund);
    maskBuen[mi] = Math.round(255 * featherBuen);
    maskHose[mi] = Math.max(0, Math.round(255 * featherHose));
  }
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// -- Crop to pants bounding box (with breathing room) -----------------------
// Scan the base RGBA to find the tight non-transparent bounding box.
let cropL = W, cropR = 0, cropT = H, cropB = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (baseRGBA[(y * W + x) * 4 + 3] > 0) {
      if (x < cropL) cropL = x;
      if (x > cropR) cropR = x;
      if (y < cropT) cropT = y;
      if (y > cropB) cropB = y;
    }
  }
}
// Pad by ~2% each side so shadow-of-alpha bleed doesn't clip.
const pad = Math.round(Math.max(cropR - cropL, cropB - cropT) * 0.02);
cropL = Math.max(0, cropL - pad);
cropR = Math.min(W - 1, cropR + pad);
cropT = Math.max(0, cropT - pad);
cropB = Math.min(H - 1, cropB + pad);
const cropW = cropR - cropL + 1;
const cropH = cropB - cropT + 1;
console.log("crop", { cropL, cropT, cropW, cropH });

// -- Encode to WebP (single downsample step for smaller assets) -------------
const TARGET_W = 900; // Retina-friendly; pants max width ≈ 500 CSS px

async function saveBase(buf, name) {
  await sharp(buf, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: cropL, top: cropT, width: cropW, height: cropH })
    .resize({ width: TARGET_W })
    .webp({ quality: 82, alphaQuality: 90 })
    .toFile(path.join(OUT_DIR, name));
}
async function saveMask(buf, name) {
  // Convert single-channel alpha to RGBA (opaque black, alpha=mask) so we can
  // use it as CSS mask-image with a browser-portable format.
  const rgba = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    rgba[i * 4 + 3] = buf[i];
  }
  await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: cropL, top: cropT, width: cropW, height: cropH })
    .resize({ width: TARGET_W })
    .webp({ quality: 60, alphaQuality: 100 })
    .toFile(path.join(OUT_DIR, name));
}

await saveBase(baseRGBA, "base.webp");
await saveMask(maskBund, "mask-bund.webp");
await saveMask(maskHose, "mask-hose.webp");
await saveMask(maskBuen, "mask-buendchen.webp");

console.log("wrote", OUT_DIR, "at", TARGET_W, "px wide");
