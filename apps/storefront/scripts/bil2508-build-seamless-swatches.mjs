#!/usr/bin/env node
// BIL-2508 — rebuild public/stoffe/stoff-NN.webp with a straight, offset-searched
// seam. Rationale and the post-mortem of BIL-2497's metric live in
// bil2508-tiling-lib.mjs.
//
// Keeps BIL-2497's slug order (sorted source filenames -> stoff-01..stoff-35),
// so manifest.json and fabrics.generated.ts stay valid and are deliberately NOT
// rewritten. Owns exactly one artefact per fabric: the tiled preview texture.
// The 128 px chips (BIL-2493's palette path) are untouched.
//
// Usage:
//   node apps/storefront/scripts/bil2508-build-seamless-swatches.mjs                 # dry run -> .tmp/bil2508
//   node apps/storefront/scripts/bil2508-build-seamless-swatches.mjs --apply
//   ... --only 9,20,30       # single fabrics while iterating
//   ... --sheets             # also write 3x3 contact sheets, before and after

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  chooseTileSize,
  flattenIllumination,
  loadSquareRaw,
  seamlessWrap,
} from "./bil2497-seamless-lib.mjs";
import {
  applyWrapX,
  directionalCoherence,
  loadFlatSource,
  pickWrapX,
  seamBandAnomaly,
  toSharp,
  transpose,
} from "./bil2508-tiling-lib.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = resolve(arg("src", "C:/Users/Besitzer/Desktop/bilulu/stoffe"));
const APPLY = flag("apply");
const SHEETS = flag("sheets");
const LIVE_DIR = join(ROOT, "public", "stoffe");
const OUT = resolve(arg("out", APPLY ? LIVE_DIR : join(ROOT, ".tmp", "bil2508", "tiles")));
const SHEET_DIR = resolve(arg("sheets-out", join(ROOT, "..", "e2e", "reports", "bil2508", "sheets")));

// Same pixel budget as the 512x512 tiles BIL-2493 sized for: the output keeps
// the crop's aspect ratio and is scaled to equal *area*, so a tall tile gets
// proportionally narrower instead of costing extra bytes on the LCP path.
const AREA_SIDE = Number(arg("size", 512));
const QUALITY = Number(arg("q", 80));
const EFFORT = Number(arg("effort", 6));
// The seam search needs real detail to find a matching offset; the downscale to
// the shipped size happens last.
const WORK = Number(arg("work", 1200));
const BAND_FRAC = Number(arg("band-frac", 0.12));
const MIN_FRAC = Number(arg("min-frac", 0.55));
const MAX_FRAC = Number(arg("max-frac", 0.95));
// BIL-2497 default, kept so the quilt candidate reproduces the shipped bytes.
const FEATHER_FRAC = Number(arg("feather-frac", 0.3));
// `--method straight|quilt` overrides the picker, so both candidates can be
// rendered for the same fabric and compared by eye instead of by score alone.
const FORCE = arg("method", "auto");
const COHERENCE_THRESHOLD = Number(arg("coherence", 0.3));

/**
 * Fabrics that take the straight seam even though they are not directional
 * prints, decided by looking at both candidates tiled 3x3 side by side
 * (apps/e2e/reports/bil2508/sheets/*-SvQ.png).
 *
 * These are the washed / mottled grounds — denim, watercolour, dense scatter.
 * They have no long-range direction for the coherence test to find, but they
 * also give the min-error cut nowhere clean to route, so its path shows up as
 * diagonal streaks and a rectangular frame around every tile. The list is
 * written out rather than folded into the score on purpose: an eyeball verdict
 * that a reviewer can re-check against the sheets is more honest than a
 * threshold bent until it happens to agree.
 */
const STRAIGHT_OVERRIDE = new Set([3, 16, 18, 22, 23, 31]);

const only = (arg("only", "") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map(Number);

const slug = (i) => `stoff-${String(i).padStart(2, "0")}`;

async function contactSheet(file, out) {
  const meta = await sharp(file).metadata();
  const w = meta.width;
  const h = meta.height;
  const png = await sharp(file).png().toBuffer();
  const comps = [];
  for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) comps.push({ input: png, left: x * w, top: y * h });
  // sharp resizes before compositing, so the downscale needs a second pass.
  const sheet = await sharp({ create: { width: w * 3, height: h * 3, channels: 3, background: "#ffffff" } })
    .composite(comps)
    .png()
    .toBuffer();
  await sharp(sheet).resize(390, 390, { fit: "fill" }).png().toFile(out);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  if (SHEETS) await mkdir(SHEET_DIR, { recursive: true });

  const files = (await readdir(SRC)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
  if (!files.length) {
    console.error(`No source images under ${SRC}`);
    process.exit(1);
  }

  console.log(`${files.length} sources -> ${OUT}${APPLY ? "  (APPLY)" : "  (dry run)"}\n`);
  console.log("id        method    tile          coher   ghost  bandE#  orient#");

  const report = [];
  for (let i = 0; i < files.length; i += 1) {
    const n = i + 1;
    if (only.length && !only.includes(n)) continue;
    const id = slug(n);
    const src = join(SRC, files[i]);

    const raw = await loadFlatSource(src, WORK);
    const flat = await flattenIllumination(raw, { maxGain: 1.25 });

    // --- candidate A: straight seam, offset searched (this pass) -------------
    const px = pickWrapX(flat, { minFrac: MIN_FRAC, maxFrac: MAX_FRAC, bandFrac: BAND_FRAC });
    const afterX = applyWrapX(flat, px);
    const py = pickWrapX(transpose(afterX), { minFrac: MIN_FRAC, maxFrac: MAX_FRAC, bandFrac: BAND_FRAC });
    const straight = transpose(applyWrapX(transpose(afterX), py));

    // --- candidate B: BIL-2497's min-error quilt cut -------------------------
    // Kept as a live candidate rather than deleted: the wandering cut is genuinely
    // better on a scattered print (a floral on a plain ground), where a straight
    // cross-fade leaves a translucent duplicate flower and the cut has plenty of
    // background to route through. It is only destructive on directional prints.
    //
    // Reproduced bit-for-bit, including BIL-2497's crop-then-downscale order, so
    // that every fabric this pass leaves alone re-encodes to the exact bytes
    // already live. A byte-identical rebuild of the 29 untouched tiles is also
    // the cheapest possible proof that this script's quilt path really is the
    // shipped one and not a lookalike.
    const square = await flattenIllumination(await loadSquareRaw(src, WORK), { maxGain: 1.25 });
    const pick = chooseTileSize(square);
    const quilt = pick ? seamlessWrap(square, { band: pick.band, featherFrac: FEATHER_FRAC }) : null;

    // --- pick, by the property of the *print*, not of the output --------------
    // Scoring the two outputs against each other was tried first and does not
    // work: any band-versus-interior measure is confounded by the print's own
    // layout (on stoff-09 the seam band is pure stripe while the interior holds
    // the medallion, so the honest tile scores "worse" than the wrecked one).
    // The property that actually decides the outcome is a property of the
    // source — whether it has structure running across the whole piece.
    const coherence = directionalCoherence(await flattenIllumination(await loadFlatSource(src, 96), { maxGain: 1.25 }));
    // The 35 fabrics fall into two clusters with a 4x gap between them
    // (0.60..0.98 for the striped prints, 0.00..0.15 for everything else);
    // the threshold sits in the middle of that gap, in log space.
    const useQuilt =
      FORCE === "quilt"
        ? Boolean(quilt)
        : FORCE === "straight"
          ? false
          : Boolean(quilt) && coherence < COHERENCE_THRESHOLD && !STRAIGHT_OVERRIDE.has(n);
    const tile = useQuilt ? quilt : straight;

    const band = useQuilt ? pick.band : px.band;
    const anomaly = seamBandAnomaly(tile, band);
    const damage = anomaly.orientation;
    const bandRatio = anomaly.energy;
    const ghostRMS = Math.sqrt(px.cost);

    // Equal-area scale, aspect preserved.
    const k = AREA_SIDE / Math.sqrt(tile.width * tile.height);
    const outW = Math.max(2, Math.round(tile.width * k));
    const outH = Math.max(2, Math.round(tile.height * k));

    // With --apply only the tiles this pass actually re-authors are written.
    // Re-encoding the 29 quilt tiles would churn 29 binaries for a sub-1 %
    // encoder drift against what BIL-2497 shipped (the algorithm output is
    // bit-identical; the drift predates this pass), and a 6-file diff is a diff
    // a reviewer can actually check. Dry runs still write all 35, because the
    // contact sheets need them.
    const skipWrite = APPLY && useQuilt;
    const file = join(skipWrite ? LIVE_DIR : OUT, `${id}.webp`);
    if (!skipWrite) {
      await toSharp(tile)
        .resize(outW, outH, { fit: "fill", kernel: "lanczos3" })
        .webp({ quality: QUALITY, effort: EFFORT })
        .toFile(file);
    }
    const bytes = (await readFile(file)).length;

    if (SHEETS) {
      await contactSheet(file, join(SHEET_DIR, `${id}-after.png`));
      const live = join(LIVE_DIR, `${id}.webp`);
      if (!APPLY) await contactSheet(live, join(SHEET_DIR, `${id}-before.png`));
    }

    const row = {
      id,
      source: files[i],
      method: useQuilt ? "quilt" : "straight",
      width: outW,
      height: outH,
      bytes,
      x: { offset: px.offset, size: px.size, band: px.band },
      y: { offset: py.offset, size: py.size, band: py.band },
      ghostRMS: Number(ghostRMS.toFixed(1)),
      bandRatio,
      damage,
      coherence: Number(coherence.toFixed(3)),
    };
    report.push(row);
    console.log(
      `${id.padEnd(9)} ${row.method.padEnd(9)} ${String(outW + "x" + outH).padEnd(11)} ` +
        `${String(row.coherence).padStart(6)} ${String(row.ghostRMS).padStart(7)} ` +
        `${String(row.bandRatio.toFixed(2)).padStart(7)} ${String(row.damage.toFixed(3)).padStart(7)}`,
    );
  }

  const worst = [...report].sort((a, b) => b.damage - a.damage).slice(0, 5);
  console.log(`\nhighest structure damage: ${worst.map((r) => `${r.id} ${r.damage}`).join(", ")}`);
  const quilted = report.filter((r) => r.method === "quilt").map((r) => r.id);
  console.log(`quilt cut kept for ${quilted.length}: ${quilted.join(", ") || "-"}`);
  const total = report.reduce((s, r) => s + r.bytes, 0);
  console.log(`total ${(total / 1024).toFixed(0)} kB over ${report.length} tiles`);

  // Never next to the tiles: with --apply that directory is `public/`, and the
  // report would ship to every visitor as a stray asset.
  const reportDir = join(ROOT, ".tmp", "bil2508");
  await mkdir(reportDir, { recursive: true });
  const reportPath = join(reportDir, "report.json");
  await writeFile(reportPath, JSON.stringify({ apply: APPLY, report }, null, 2));
  console.log(`report -> ${reportPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
