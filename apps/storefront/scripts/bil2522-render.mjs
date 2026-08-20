/**
 * BIL-2522 — offline renderer for the relief-based fabric layer.
 *
 * Mirrors bil2509-composite.mjs (which reproduces the *shipped* CSS stack) but
 * runs the fabric zones through the relief map instead of a flat multiply, so
 * before/after can be judged on identical inputs without a browser.
 *
 * The per-pixel maths is imported from the storefront's relief-math.mjs — the
 * same module the browser layer runs — so what is tuned here is what ships.
 *
 * Usage:
 *   node scripts/bil2522-render.mjs --konfig hose \
 *     --paint hose=stoff-04 --paint bund=mustard --paint buendchen=mustard \
 *     --rot 0 --out .tmp/bil2522/after.png
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { KONFIGS } from "./bil2509-composite.mjs";
import { ZONE_STRUCTURE } from "./bil2522-build-relief.mjs";
import {
  buildTile,
  grainFor,
  paintReliefZone,
  tilePx,
} from "../src/app/konfigurator/_shared/relief-math.mjs";

const MASK_FILE = { buendchen: "buendchen" };
const UNI = {
  cream: "#FAF7F2", sand: "#E8DDC8", taupe: "#B5A48A", "powder-pink": "#E8C2C2",
  terracotta: "#C4704A", rust: "#7A3318", mustard: "#D4A24C", sage: "#A8C5AB",
  forest: "#3F6444", sky: "#A8C8D8", petrol: "#5BA8AE", navy: "#2D3E50",
};
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/**
 * Fabric tile, resampled and rotated by the SHARED code path — sharp only
 * decodes here. Letting sharp resize would reintroduce the Lanczos-vs-Chromium
 * mismatch that made the browser and this renderer disagree by up to 47/255.
 */
export async function loadTile(textureId, rotation, px) {
  const { data, info } = await sharp(`public/stoffe/${textureId}.webp`)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) throw new Error(`tile came back ${info.channels}ch`);
  return buildTile(data, info.width, info.height, 3, px, rotation);
}

export async function renderRelief(konfigId, paints, rotation = 0) {
  const k = KONFIGS[konfigId];
  if (!k) throw new Error(`unknown konfigurator ${konfigId}`);
  const dir = path.join("public/konfigurator", k.dir);
  const load = async (file) => {
    const { data, info } = await sharp(path.join(dir, file))
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, W: info.width, H: info.height };
  };

  const base = await load("base.webp");
  const { W, H } = base;
  const N = W * H;
  const relief = await load("relief.webp");
  if (relief.W !== W || relief.H !== H) {
    throw new Error(`relief is ${relief.W}x${relief.H}, base is ${W}x${H}`);
  }

  const out = Buffer.alloc(N * 3, 255);
  for (let p = 0; p < N; p++) {
    const a = base.data[p * 4 + 3] / 255;
    for (let ch = 0; ch < 3; ch++) {
      out[p * 3 + ch] = Math.round(255 * (1 - a) + base.data[p * 4 + ch] * a);
    }
  }

  // Pass 1 — uni zones, byte-for-byte the shipped multiply path so a uni colour
  // can never regress (BIL-2461's flat dark-navy silhouette lives here).
  //
  // BIL-2533: a Konfigurator whose relief map carries cut-piece structure sends
  // its uni zones through the relief path instead, exactly as relief-layer.tsx
  // now does — otherwise this renderer would keep producing "evidence" for a
  // waistband the shop no longer draws.
  const fabricZones = [];
  for (const zone of k.zones) {
    const id = paints[zone];
    if (!id) continue;
    if (id.startsWith("stoff-") || ZONE_STRUCTURE[konfigId]?.[zone] !== undefined) {
      fabricZones.push(zone);
      continue;
    }
    const mask = await load(`mask-${MASK_FILE[zone] ?? zone}.webp`);
    const flat = hexToRgb(UNI[id] ?? UNI.cream);
    for (let p = 0; p < N; p++) {
      const a = mask.data[p * 4 + 3] / 255;
      if (a <= 0) continue;
      for (let ch = 0; ch < 3; ch++) {
        const mul = (out[p * 3 + ch] * flat[ch]) / 255;
        out[p * 3 + ch] = Math.round(out[p * 3 + ch] * (1 - a) + mul * a);
      }
    }
  }

  // Pass 2 — the sheen, BEFORE the fabric zones. It is a broad white screen
  // blob covering a whole leg; it exists so dark uni colours keep a lit side.
  // Over a relief-shaded fabric it is pure damage — it drains the print's
  // saturation across half the garment, and it was the most "composited"
  // looking thing left once the warp was in. Relief zones carry their own
  // light and paint on top of it; uni zones keep it untouched.
  if (k.sheen) {
    const hi = await load("highlight.webp");
    for (let p = 0; p < N; p++) {
      const a = hi.data[p * 4 + 3] / 255;
      if (a <= 0) continue;
      for (let ch = 0; ch < 3; ch++) {
        const scr = 255 - ((255 - out[p * 3 + ch]) * (255 - hi.data[p * 4 + ch])) / 255;
        out[p * 3 + ch] = Math.round(out[p * 3 + ch] * (1 - a) + scr * a);
      }
    }
  }

  // Pass 3 — relief fabric, accumulated into one RGBA layer exactly as the
  // browser builds its canvas, then composited over the result.
  if (fabricZones.length) {
    const layer = new Uint8ClampedArray(N * 4);
    const maskAlpha = new Uint8Array(N);
    for (const zone of fabricZones) {
      const mask = await load(`mask-${MASK_FILE[zone] ?? zone}.webp`);
      for (let p = 0; p < N; p++) maskAlpha[p] = mask.data[p * 4 + 3];
      const grain = grainFor(zone);
      const id = paints[zone];
      const tile = id.startsWith("stoff-")
        ? await loadTile(id, rotation, tilePx(W, grain))
        // Same 1x1 trick relief-layer.tsx uses: one paint path for both kinds
        // of zone, so an offline sheet cannot drift from the browser.
        : { data: Uint8ClampedArray.from(hexToRgb(UNI[id] ?? UNI.cream)), TW: 1, TH: 1, stride: 3 };
      paintReliefZone(layer, relief.data, maskAlpha, tile, W, H, grain);
    }
    for (let p = 0; p < N; p++) {
      const a = layer[p * 4 + 3] / 255;
      if (a <= 0) continue;
      for (let ch = 0; ch < 3; ch++) {
        out[p * 3 + ch] = Math.round(out[p * 3 + ch] * (1 - a) + layer[p * 4 + ch] * a);
      }
    }
  }

  if (k.label) {
    const lb = await load("label.webp");
    for (let p = 0; p < N; p++) {
      const a = lb.data[p * 4 + 3] / 255;
      if (a <= 0) continue;
      for (let ch = 0; ch < 3; ch++) {
        out[p * 3 + ch] = Math.round(out[p * 3 + ch] * (1 - a) + lb.data[p * 4 + ch] * a);
      }
    }
  }
  return { buf: out, W, H };
}

if (process.argv[1]?.endsWith("bil2522-render.mjs")) {
  const argv = process.argv.slice(2);
  const arg = (n, d) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 ? argv[i + 1] : d;
  };
  const paints = {};
  argv.forEach((a, i) => {
    if (a === "--paint") {
      const [z, v] = argv[i + 1].split("=");
      paints[z] = v;
    }
  });
  const konfigId = arg("konfig", "hose");
  const outPath = arg("out", `.tmp/bil2522/${konfigId}-after.png`);
  await mkdir(path.dirname(outPath), { recursive: true });
  const { buf, W, H } = await renderRelief(konfigId, paints, Number(arg("rot", "0")));
  await sharp(buf, { raw: { width: W, height: H, channels: 3 } }).png().toFile(outPath);
  console.log("wrote", outPath, W, "x", H);
}
