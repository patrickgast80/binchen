/**
 * Preprocess pumphose-05.jpg into the assets the Foto-Konfigurator needs.
 *
 * Outputs (all under public/konfigurator/hose-foto/):
 *   base.webp        — near-white pants silhouette on transparent bg, only broad
 *                      fold shading + a thin darker seam line at the two zone
 *                      boundaries (no fabric print, no colour). BIL-2461 board
 *                      wanted the base "farb- und musterlos" so tints render 1:1.
 *   mask-bund.webp   — alpha mask for the upper waistband zone
 *   mask-hose.webp   — alpha mask for the main body zone
 *   mask-buendchen.webp — alpha mask for the lower cuffs zone
 *
 * The masks are pure white (255) inside their zone, transparent elsewhere. In
 * the browser they are used as CSS `mask-image` for coloured overlays with
 * `mix-blend-mode: multiply`, so the base's residual shading comes through the
 * tint (see task spec: soft-light/multiply, KEIN hue-rotate).
 *
 * Neutralization pipeline (BIL-2461):
 *   1. Background is flood-filled from the border across neutral studio grey
 *      pixels — the BIL-2455 photo rebuild replaced the old white backdrop
 *      with grey, so the previous `r>240` threshold no longer worked.
 *   2. The BASE gray uses a HEAVILY blurred copy of the source so the floral
 *      print smears out; only fold-scale luminance variation survives.
 *   3. The blurred luminance is compressed into a NARROW near-white range
 *      (BASE_MIN..BASE_MAX below) so any residual variation is muted — a
 *      multiply-blend of a swatch onto this base produces ~90-100% of the
 *      swatch's own colour, which is what the board asked for.
 *   4. A 1 px darker seam line is baked into the base at both zone boundaries
 *      so the seam reads as sewn without a hard mask transition.
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
// data = unaltered pixels used for background segmentation.
// blurred = heavily blurred copy used only for the base gray, so the fabric
// print smears into flat colour before we sample luminance.
const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const blurred = (await sharp(SRC).blur(28).raw().toBuffer({ resolveWithObject: true })).data;
const W = info.width;
const H = info.height;
const N = W * H;

// -- 1. Background flood-fill from the image border -------------------------
// The BIL-2455 photo rebuild set a uniform studio backdrop. Sample the actual
// border colour (rather than assume white) and flood only across pixels that
// are within a tight RGB delta of it. Robust to both the old white bg and the
// current grey bg; also rejects the cream bund (~224) and neutral bündchen
// (~180) which the previous generic-neutrality rule leaked into.
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

// The pumphose-05 studio shot has TWO bg tones — a grey vignette (~200) at
// the outer border AND near-white in the concavities between the pants legs.
// Both must qualify or the flood-fill leaves interior white pockets un-marked
// (which then flood the mask outward).
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

// -- Zone classification by Y (with side-cuff bulge) ------------------------
// From analyze-photo output on pumphose-05.jpg:
//   Bund runs y ≈ 177 (top) → 328 (elastic shirred seam, center)
//   Body runs y ≈ 328 → 880 (patterned floral)
//   Bündchen (pink cuffs) run y ≈ 880 → 1027 (bottom of each leg)
const BUND_END = 336;
const BUENDCHEN_START = 878;
// Feather = pixels blended across the seam. BIL-2461: tightened from 6 → 2 for
// a crisper seam; the darker seam line below carries the "sewn" impression.
const FEATHER = 2;
// Seam line: half-thickness (px) and darkness (0..255, lower = darker) baked
// into the base at each zone boundary. ~180 gives a subtle multiply-darkening
// without turning into a hard black outline.
const SEAM_HALF = 1;
const SEAM_GRAY = 180;

// Near-white base range. Chosen empirically: 220..250 keeps just enough fold
// shading for depth while a chosen tint reads as itself (0.86..0.98 × tint
// under multiply-blend).
const BASE_MIN = 220;
const BASE_MAX = 250;

// -- Build 4 raw buffers ----------------------------------------------------
const baseRGBA = Buffer.alloc(N * 4);              // near-white gray + alpha
const maskBund = Buffer.alloc(N);                  // alpha-only
const maskHose = Buffer.alloc(N);
const maskBuen = Buffer.alloc(N);

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (isBg[p]) continue; // stays fully transparent (already zeroed)

    const i = p * 3;
    // Perceived luminance of the BLURRED source (Rec. 709). Blurring first
    // erases the print but keeps fold-scale shading intact.
    const lum =
      0.2126 * blurred[i] + 0.7152 * blurred[i + 1] + 0.0722 * blurred[i + 2];
    const gray = Math.round(BASE_MIN + (lum / 255) * (BASE_MAX - BASE_MIN));
    const o = p * 4;
    baseRGBA[o] = gray;
    baseRGBA[o + 1] = gray;
    baseRGBA[o + 2] = gray;
    baseRGBA[o + 3] = 255;

    // Zone mask — narrow feather at the seam so recolour doesn't ring.
    const featherBund = 1 - clamp01((y - (BUND_END - FEATHER)) / (2 * FEATHER));
    const featherBuen = clamp01((y - (BUENDCHEN_START - FEATHER)) / (2 * FEATHER));
    const featherHose = 1 - featherBund - featherBuen;
    maskBund[p] = Math.round(255 * featherBund);
    maskBuen[p] = Math.round(255 * featherBuen);
    maskHose[p] = Math.max(0, Math.round(255 * featherHose));
  }
}

// -- Bake a thin darker seam line into the base at the two zone boundaries --
// Only affects garment pixels (alpha > 0); reads as a sewn seam once the tint
// is multiplied on top, while the mask feather (2 px) still hides any hard
// colour boundary between adjacent zones.
for (const yc of [BUND_END, BUENDCHEN_START]) {
  for (let dy = -SEAM_HALF; dy <= SEAM_HALF; dy++) {
    const y = yc + dy;
    if (y < 0 || y >= H) continue;
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (isBg[p]) continue;
      const o = p * 4;
      const g = Math.min(baseRGBA[o], SEAM_GRAY);
      baseRGBA[o] = g;
      baseRGBA[o + 1] = g;
      baseRGBA[o + 2] = g;
    }
  }
}

// -- Crop to pants bounding box (with breathing room) -----------------------
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

// -- Encode to WebP (single downsample step for smaller assets) -------------
const TARGET_W = 900;

async function saveBase(buf, name) {
  await sharp(buf, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: cropL, top: cropT, width: cropW, height: cropH })
    .resize({ width: TARGET_W })
    .webp({ quality: 82, alphaQuality: 90 })
    .toFile(path.join(OUT_DIR, name));
}
async function saveMask(buf, name) {
  const rgba = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) rgba[i * 4 + 3] = buf[i];
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

const meta = await sharp(path.join(OUT_DIR, "base.webp")).metadata();
console.log("base.webp", meta.width, "x", meta.height);
console.log("wrote", OUT_DIR, "at", TARGET_W, "px wide");
