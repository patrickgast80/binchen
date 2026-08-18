/**
 * BIL-2499 — proves the "made with love" label survives every recolour.
 *
 * Runs the REAL server-side compositor (`composeKonfigPhoto`, the same code the
 * share card uses) over a spread of combinations, then measures the label patch
 * against the untouched source pixels. Screenshots alone cannot prove this:
 * a tinted tag still looks like a tag. So this asserts on bytes —
 * max per-channel deviation inside the label bbox — and additionally writes
 * zoomed waistband crops for the human review the board asked for.
 *
 * `next/og` cannot be imported on Windows/Node 24 (ERR_INVALID_URL on its
 * bundled font path), which is why this calls the compositor directly instead
 * of hitting /api/og/konfig/hose-kurz.
 *
 * Usage:
 *   cd apps/storefront
 *   node --experimental-strip-types scripts/bil2499-label-proof.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { composeKonfigPhoto } from "../src/app/api/og/konfig/[konfigurator]/compose.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const storefront = path.resolve(here, "..");
process.chdir(storefront); // mirror the standalone server's cwd

const OUT = path.resolve(storefront, "../e2e/reports/bil2499");
await mkdir(OUT, { recursive: true });

// Geometry mirrors registry.ts. Duplicated on purpose: importing the registry
// would drag the client palette (and "use client") into a plain node run.
const HOSE_KURZ = {
  id: "hose-kurz",
  path: "/konfigurator/hose-kurz",
  productLabel: "Kurze Hose",
  basePhoto: "/konfigurator/hose-kurz-foto/base.webp",
  sheenPhoto: "/konfigurator/hose-kurz-foto/highlight.webp",
  labelPhoto: "/konfigurator/hose-kurz-foto/label.webp",
  width: 900,
  height: 750,
  regions: [
    { param: "bund", src: "/konfigurator/hose-kurz-foto/mask-bund.webp", label: "Bund", defaultColor: "terracotta" },
    { param: "hose", src: "/konfigurator/hose-kurz-foto/mask-hose.webp", label: "Hose", defaultColor: "petrol" },
    { param: "buendchen", src: "/konfigurator/hose-kurz-foto/mask-buendchen.webp", label: "Bündchen", defaultColor: "terracotta" },
  ],
};

/**
 * Spread chosen to break the label if anything can: the two extremes of the
 * palette (near-white cream and near-black navy) plus two real fabric prints,
 * one of them rotated. If a mask leaked, cream would wash the tag out and navy
 * would darken it — in opposite directions, so no single tolerance hides both.
 */
const CASES = [
  { name: "default-terracotta-petrol", colors: { bund: "#C4704A", hose: "#5BA8AE", buendchen: "#C4704A" }, textures: {}, rotation: 0 },
  { name: "cream-cream-cream", colors: { bund: "#FAF7F2", hose: "#FAF7F2", buendchen: "#FAF7F2" }, textures: {}, rotation: 0 },
  { name: "navy-forest-rust", colors: { bund: "#2D3E50", hose: "#3F6444", buendchen: "#7A3318" }, textures: {}, rotation: 0 },
  { name: "stoff-14-mustard", colors: { bund: "#D4A24C", hose: "#a8c8f8", buendchen: "#D4A24C" }, textures: { hose: "/stoffe/stoff-14.webp" }, rotation: 0 },
  { name: "stoff-01-sage-rot90", colors: { bund: "#A8C5AB", hose: "#783898", buendchen: "#A8C5AB" }, textures: { hose: "/stoffe/stoff-01.webp" }, rotation: 90 },
];

// Which pixels count as "the label", in the 900x750 asset space, read off
// label.webp's own alpha.
const labelMeta = await (async () => {
  const { data, info } = await sharp("public/konfigurator/hose-kurz-foto/label.webp")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const solid = new Uint8Array(w * h);
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] < 255) continue;
      solid[y * w + x] = 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { solid, w, h, minX, minY, maxX, maxY };
})();
console.log("label bbox in asset space:", {
  minX: labelMeta.minX, minY: labelMeta.minY, maxX: labelMeta.maxX, maxY: labelMeta.maxY,
});

/**
 * Compare a SET of pixels, not a rectangle. The tag has rounded corners and
 * sits at a slight angle, so a bounding box necessarily contains waistband —
 * the first version of this check did exactly that and reported a 142/255
 * "leak" that was entirely the band showing in the crop's corners.
 *
 * The set is the fully opaque alpha eroded by `ERODE` px. The erosion covers
 * two real effects: the ~1px alpha ramp at the tag's edge (which is meant to
 * blend) and the reach of the resampling kernel used for the card's downscale,
 * which mixes neighbouring band pixels a few px in.
 */
const ERODE = 9;
const solidCore = (() => {
  const { solid, w, h } = labelMeta;
  let cur = solid;
  for (let it = 0; it < ERODE; it++) {
    const next = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        if (cur[p] && cur[p - 1] && cur[p + 1] && cur[p - w] && cur[p + w]) next[p] = 1;
      }
    }
    cur = next;
  }
  let n = 0;
  for (let p = 0; p < w * h; p++) if (cur[p]) n++;
  console.log(`label core: ${n}px after ${ERODE}px erosion`);
  if (n < 500) throw new Error("label core eroded away — nothing left to compare");
  return cur;
})();

/** Samples the composed card at every core pixel, in card space. */
async function labelCore(pngBuf) {
  const { data, info } = await sharp(pngBuf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const sx = info.width / labelMeta.w;
  const sy = info.height / labelMeta.h;
  const out = [];
  for (let y = labelMeta.minY; y <= labelMeta.maxY; y++) {
    for (let x = labelMeta.minX; x <= labelMeta.maxX; x++) {
      if (!solidCore[y * labelMeta.w + x]) continue;
      const cx = Math.min(info.width - 1, Math.round(x * sx));
      const cy = Math.min(info.height - 1, Math.round(y * sy));
      const i = (cy * info.width + cx) * 3;
      out.push(data[i], data[i + 1], data[i + 2]);
    }
  }
  return { data: out, info };
}

const results = [];
let reference = null;

for (const c of CASES) {
  const composed = await composeKonfigPhoto("http://localhost:3000", HOSE_KURZ, c.colors, c.textures, c.rotation);
  if (!composed.dataUri) {
    throw new Error(`compose failed for ${c.name}: ${composed.trace}`);
  }
  const png = Buffer.from(composed.dataUri.split(",")[1], "base64");
  await writeFile(path.join(OUT, `compose-${c.name}.png`), png);

  // Waistband zoom for the human review — 6x, nearest neighbour so the crop is
  // not smoothed into looking cleaner than it is.
  const meta = await sharp(png).metadata();
  const sx = (meta.width ?? 1) / labelMeta.w;
  const sy = (meta.height ?? 1) / labelMeta.h;
  const zoom = {
    left: Math.max(0, Math.round((labelMeta.minX - 90) * sx)),
    top: Math.max(0, Math.round((labelMeta.minY - 40) * sy)),
    width: Math.round(260 * sx),
    height: Math.round(170 * sy),
  };
  await sharp(png)
    .extract(zoom)
    .resize({ width: zoom.width * 6, kernel: "nearest" })
    .png()
    .toFile(path.join(OUT, `bund-zoom-${c.name}.png`));

  const { data } = await labelCore(png);
  if (!reference) {
    reference = { data, name: c.name };
    results.push({ case: c.name, maxDelta: 0, meanDelta: 0, note: "reference", trace: composed.trace });
    continue;
  }
  if (data.length !== reference.data.length) {
    throw new Error(`label sample count drifted between cases (${c.name})`);
  }
  let maxDelta = 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const d = Math.abs(data[i] - reference.data[i]);
    if (d > maxDelta) maxDelta = d;
    sum += d;
  }
  results.push({
    case: c.name,
    maxDelta,
    meanDelta: +(sum / data.length).toFixed(3),
    trace: composed.trace,
  });
}

console.table(results);
await writeFile(
  path.join(OUT, "label-proof.json"),
  JSON.stringify(
    {
      bbox: { minX: labelMeta.minX, minY: labelMeta.minY, maxX: labelMeta.maxX, maxY: labelMeta.maxY },
      erodePx: ERODE,
      samplesPerCase: reference.data.length / 3,
      results,
    },
    null,
    2,
  ),
);

// The label layer is byte-identical in every case and PNG re-encoding is
// lossless, so the honest expectation is an exact match. Allow 2/255 only for
// the downscale resampler's rounding.
const TOLERANCE = 2;
const failed = results.filter((r) => r.maxDelta > TOLERANCE);
if (failed.length) {
  console.error("LABEL LEAK — a recolour reached the tag:", failed);
  process.exit(1);
}
console.log(`\nPASS — label identical across ${results.length} combinations (tolerance ${TOLERANCE}/255).`);
console.log("evidence in", OUT);
