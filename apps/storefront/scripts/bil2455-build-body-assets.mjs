/**
 * BIL-2455 — synthesize body-konfigurator assets from a hand-authored vector
 * baby-body illustration.
 *
 * The board unlocked this configurator with "los" before a studio photo was
 * delivered, so this script generates a stylized front-view langarm-Body
 * directly from geometric primitives (rounded rects + ellipses + soft
 * shading), matching the visual grammar of the other konfigurator base
 * images: neutral grayscale silhouette with the same three-region breakdown
 * used elsewhere.
 *
 * Outputs (all under public/konfigurator/body-foto/):
 *   base.webp             — desaturated body silhouette on transparent bg
 *   mask-hauptteil.webp   — alpha mask for the torso + upper sleeves
 *   mask-halsbund.webp    — alpha mask for the neckband ring
 *   mask-aermelbund.webp  — alpha mask for both wrist cuffs
 *
 * Swap-in path when a real body photo arrives: replace the four output files
 * (using bil2445-build-muetze-assets.mjs as a segmentation template) — no
 * changes required in the /konfigurator/body route.
 *
 *   cd apps/storefront && node scripts/bil2455-build-body-assets.mjs
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = "public/konfigurator/body-foto";
await mkdir(OUT_DIR, { recursive: true });

const W = 1200;
const H = 1200;
const N = W * H;

// ---------------------------------------------------------------------------
// Geometry — measured against the reference photos (muetze 900x917, turban
// 900x796) so the body reads a similar visual weight at 900px width.
// ---------------------------------------------------------------------------
const NECK_CX = 600;
const NECK_CY = 220;
const NECK_RX = 95;
const NECK_RY = 45;

const HALSBUND_OUTER_RY = 78;
const HALSBUND_OUTER_RX = 130;
const HALSBUND_INNER_RY = 42;
const HALSBUND_INNER_RX = 90;

const TORSO_CX = 600;
const TORSO_TOP = 250;
const TORSO_BOT = 900;
const TORSO_HALF_W_TOP = 210;
const TORSO_HALF_W_MID = 240;
const TORSO_HALF_W_BOT = 195;
const TORSO_CORNER_R = 40;

const ARM_TOP = 268;
const ARM_BOT = 400;
const ARM_LEFT_END = 95;
const ARM_RIGHT_END = 1105;
const ARM_CORNER_R = 55;

const CUFF_WIDTH = 74;

const CROTCH_TAB_R = 60;
const CROTCH_TAB_Y = 900;
const CROTCH_TAB_X_L = 505;
const CROTCH_TAB_X_C = 600;
const CROTCH_TAB_X_R = 695;

// Snap-button dots (tiny circles decorating the crotch tabs — pure aesthetic).
const SNAPS = [
  { x: 555, y: 918, r: 6 },
  { x: 600, y: 918, r: 6 },
  { x: 645, y: 918, r: 6 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function torsoHalfWidth(y) {
  // Piecewise linear waist: narrower at shoulders, widest at chest, tapered
  // to the snap crotch. Same silhouette rhythm as commercial baby-body PDPs.
  if (y < TORSO_TOP + 120) {
    const t = (y - TORSO_TOP) / 120;
    return TORSO_HALF_W_TOP + t * (TORSO_HALF_W_MID - TORSO_HALF_W_TOP);
  }
  if (y > TORSO_BOT - 180) {
    const t = (y - (TORSO_BOT - 180)) / 180;
    return TORSO_HALF_W_MID + t * (TORSO_HALF_W_BOT - TORSO_HALF_W_MID);
  }
  return TORSO_HALF_W_MID;
}

function insideTorso(x, y) {
  if (y < TORSO_TOP || y > TORSO_BOT) return false;
  const half = torsoHalfWidth(y);
  // Rounded top corners (shoulder yoke) — quarter-circles blending into arms.
  if (y < TORSO_TOP + TORSO_CORNER_R) {
    const dy = TORSO_TOP + TORSO_CORNER_R - y;
    const dx = Math.max(0, Math.abs(x - TORSO_CX) - (half - TORSO_CORNER_R));
    if (dx * dx + dy * dy > TORSO_CORNER_R * TORSO_CORNER_R) return false;
  }
  return Math.abs(x - TORSO_CX) <= half;
}

function insideArmTube(x, y, leftEnd, rightEnd) {
  if (y < ARM_TOP || y > ARM_BOT) return false;
  if (x < leftEnd || x > rightEnd) return false;
  // Round the outer end.
  if (leftEnd === ARM_LEFT_END && x < leftEnd + ARM_CORNER_R) {
    const dx = leftEnd + ARM_CORNER_R - x;
    const midY = (ARM_TOP + ARM_BOT) / 2;
    const dy = Math.max(0, Math.abs(y - midY) - (ARM_BOT - ARM_TOP) / 2 + ARM_CORNER_R);
    if (dx * dx + dy * dy > ARM_CORNER_R * ARM_CORNER_R) return false;
  }
  if (rightEnd === ARM_RIGHT_END && x > rightEnd - ARM_CORNER_R) {
    const dx = x - (rightEnd - ARM_CORNER_R);
    const midY = (ARM_TOP + ARM_BOT) / 2;
    const dy = Math.max(0, Math.abs(y - midY) - (ARM_BOT - ARM_TOP) / 2 + ARM_CORNER_R);
    if (dx * dx + dy * dy > ARM_CORNER_R * ARM_CORNER_R) return false;
  }
  return true;
}

function insideLeftArm(x, y) {
  return insideArmTube(x, y, ARM_LEFT_END, TORSO_CX);
}
function insideRightArm(x, y) {
  return insideArmTube(x, y, TORSO_CX, ARM_RIGHT_END);
}

function insideNeckOpening(x, y) {
  const dx = (x - NECK_CX) / NECK_RX;
  const dy = (y - NECK_CY) / NECK_RY;
  return dx * dx + dy * dy <= 1;
}

function insideHalsbund(x, y) {
  const dx = (x - NECK_CX) / HALSBUND_OUTER_RX;
  const dy = (y - NECK_CY) / HALSBUND_OUTER_RY;
  const outer = dx * dx + dy * dy;
  const idx = (x - NECK_CX) / HALSBUND_INNER_RX;
  const idy = (y - NECK_CY) / HALSBUND_INNER_RY;
  const inner = idx * idx + idy * idy;
  return outer <= 1 && inner >= 1;
}

function insideLeftCuff(x, y) {
  return insideArmTube(x, y, ARM_LEFT_END, ARM_LEFT_END + CUFF_WIDTH);
}
function insideRightCuff(x, y) {
  return insideArmTube(x, y, ARM_RIGHT_END - CUFF_WIDTH, ARM_RIGHT_END);
}

function insideCrotchTab(x, y) {
  // Three overlapping half-disks along the bottom seam — one per snap.
  for (const cx of [CROTCH_TAB_X_L, CROTCH_TAB_X_C, CROTCH_TAB_X_R]) {
    const dx = x - cx;
    const dy = y - CROTCH_TAB_Y;
    if (dx * dx + dy * dy <= CROTCH_TAB_R * CROTCH_TAB_R && y >= CROTCH_TAB_Y) return true;
  }
  return false;
}

function insideSnap(x, y) {
  for (const s of SNAPS) {
    const dx = x - s.x;
    const dy = y - s.y;
    if (dx * dx + dy * dy <= s.r * s.r) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Rasterize regions
// ---------------------------------------------------------------------------
const isHauptteil = new Uint8Array(N);
const isHalsbundArr = new Uint8Array(N);
const isAermelbund = new Uint8Array(N);
const isSnap = new Uint8Array(N);

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const p = y * W + x;

    if (insideNeckOpening(x, y)) continue; // hole — nothing rendered here

    if (insideHalsbund(x, y)) {
      isHalsbundArr[p] = 1;
      continue;
    }

    // Wrist cuffs win over general arm.
    if (insideLeftCuff(x, y) || insideRightCuff(x, y)) {
      isAermelbund[p] = 1;
      continue;
    }

    if (
      insideTorso(x, y) ||
      insideLeftArm(x, y) ||
      insideRightArm(x, y) ||
      insideCrotchTab(x, y)
    ) {
      isHauptteil[p] = 1;
    }

    if (insideSnap(x, y)) {
      isSnap[p] = 1;
    }
  }
}

// The neckband ring should sit ON TOP of the shoulders — merge any halsbund
// pixel that also fell inside the torso back into the halsbund zone (it
// already is, above), and make sure the "neck cutout" hole is truly empty by
// clearing hauptteil there too. The order above handles both.

// ---------------------------------------------------------------------------
// Compose base (grayscale + subtle chest highlight) and alpha channel
// ---------------------------------------------------------------------------
const baseRGBA = Buffer.alloc(N * 4);

// Center of soft-light highlight — high on the chest.
const HL_CX = TORSO_CX;
const HL_CY = TORSO_TOP + 180;
const HL_R = 320;
const HL_STRENGTH = 26; // max grayscale lift

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const p = y * W + x;
    const inFabric = isHauptteil[p] || isHalsbundArr[p] || isAermelbund[p];
    if (!inFabric) continue;

    // Base tone — matches the muetze/hose base range (60..235).
    let gray = 150;

    // Subtle shading:
    // 1. Chest highlight (Gaussian-ish falloff)
    const dxH = x - HL_CX;
    const dyH = y - HL_CY;
    const hl = Math.max(0, 1 - (dxH * dxH + dyH * dyH) / (HL_R * HL_R));
    gray += Math.round(hl * hl * HL_STRENGTH);

    // 2. Cross-hem shadow near the very bottom to hint at a curved edge
    if (y > TORSO_BOT - 40 && isHauptteil[p]) {
      gray -= Math.round(((y - (TORSO_BOT - 40)) / 40) * 10);
    }

    // 3. Halsbund + Aermelbund read a hair darker so the ribbed knit reads
    //    apart from the smooth main fabric under the tint.
    if (isHalsbundArr[p]) gray -= 14;
    if (isAermelbund[p]) gray -= 12;

    // Clamp to keep the multiply blend readable at any swatch.
    gray = Math.min(220, Math.max(80, gray));

    // Snap dots — punch in a small darker circle over the crotch tab.
    if (isSnap[p]) gray = 90;

    const o = p * 4;
    baseRGBA[o] = gray;
    baseRGBA[o + 1] = gray;
    baseRGBA[o + 2] = gray;
    baseRGBA[o + 3] = 255;
  }
}

// ---------------------------------------------------------------------------
// Feather region boundaries so the multiply seam doesn't ring
// ---------------------------------------------------------------------------
function feather(mask) {
  // Convert 0/1 → 0/255 then apply two 3x3 mean-filter passes on the
  // interior boundary, matching the approach in bil2445-build-muetze-assets.
  const alpha = Buffer.alloc(N);
  for (let p = 0; p < N; p++) alpha[p] = mask[p] ? 255 : 0;
  for (let iter = 0; iter < 2; iter++) {
    const src = Buffer.from(alpha);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        const avg =
          (src[p] * 2 +
            src[p - 1] +
            src[p + 1] +
            src[p - W] +
            src[p + W]) /
          6;
        alpha[p] = Math.round(avg);
      }
    }
  }
  return alpha;
}

const maskHauptteil = feather(isHauptteil);
const maskHalsbund = feather(isHalsbundArr);
const maskAermelbund = feather(isAermelbund);

// ---------------------------------------------------------------------------
// Crop to garment bbox + pad, encode
// ---------------------------------------------------------------------------
let cropL = W;
let cropR = 0;
let cropT = H;
let cropB = 0;
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
const pad = 24;
cropL = Math.max(0, cropL - pad);
cropR = Math.min(W - 1, cropR + pad);
cropT = Math.max(0, cropT - pad);
cropB = Math.min(H - 1, cropB + pad);
const cropW = cropR - cropL + 1;
const cropH = cropB - cropT + 1;
console.log("crop", { cropL, cropT, cropW, cropH });

const TARGET_W = 900;
const extract = { left: cropL, top: cropT, width: cropW, height: cropH };

await sharp(baseRGBA, { raw: { width: W, height: H, channels: 4 } })
  .extract(extract)
  .resize({ width: TARGET_W })
  .webp({ quality: 82, alphaQuality: 90 })
  .toFile(path.join(OUT_DIR, "base.webp"));

async function saveMask(alpha, name) {
  const rgba = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) rgba[i * 4 + 3] = alpha[i];
  await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .extract(extract)
    .resize({ width: TARGET_W })
    .webp({ quality: 60, alphaQuality: 100 })
    .toFile(path.join(OUT_DIR, name));
}

await saveMask(maskHauptteil, "mask-hauptteil.webp");
await saveMask(maskHalsbund, "mask-halsbund.webp");
await saveMask(maskAermelbund, "mask-aermelbund.webp");

const meta = await sharp(path.join(OUT_DIR, "base.webp")).metadata();
console.log("base.webp", meta.width, "x", meta.height);
