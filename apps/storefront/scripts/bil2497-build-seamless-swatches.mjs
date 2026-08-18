#!/usr/bin/env node
// BIL-2497 — rebuild public/stoffe/stoff-NN.webp so the Konfigurator repeat
// looks like one continuous piece of fabric. Algorithm and rationale live in
// bil2497-seamless-lib.mjs.
//
// Reads the same board delivery folder as bil2455-build-fabric-swatches.mjs and
// keeps its slug order (sorted filenames → stoff-01..stoff-35), so manifest.json
// and fabrics.generated.ts stay valid and are deliberately NOT rewritten. This
// script owns exactly one artefact per fabric: the tiled preview texture.
//
// Usage:
//   node apps/storefront/scripts/bil2497-build-seamless-swatches.mjs            # dry run → .tmp/bil2497/tiles
//   node apps/storefront/scripts/bil2497-build-seamless-swatches.mjs --apply    # write public/stoffe
//   ... --only 14,20,33   # single fabrics, for iterating on one print

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  chooseTileSize,
  decodeRaw,
  flattenIllumination,
  loadSquareRaw,
  seamEnergy,
  seamlessWrap,
  toSharp,
} from "./bil2497-seamless-lib.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const HERE = dirname(fileURLToPath(import.meta.url));
const STOREFRONT_ROOT = resolve(HERE, "..");
const SRC = resolve(arg("src", "C:/Users/Besitzer/Desktop/bilulu/stoffe"));
const APPLY = flag("apply");
const OUT = resolve(
  arg("out", APPLY ? join(STOREFRONT_ROOT, "public", "stoffe") : join(STOREFRONT_ROOT, ".tmp", "bil2497", "tiles")),
);

// Matches bil2455: 512 is the widest the 42 %-of-photo tile is ever painted
// (BIL-2493), so anything larger is bytes on the LCP path for nothing.
const TILE = Number(arg("size", 512));
const QUALITY = Number(arg("q", 80));
const EFFORT = Number(arg("effort", 6));

// Work resolution for the seam search. The min-error cut needs real detail to
// find a matching path, so the wrap runs well above the shipped size and the
// downscale happens last.
const WORK = Number(arg("work", 1200));
// Tile edge is searched, not fixed — see `chooseTileSize`. These bound the
// search: never keep less than 70 % of the photo's field of view (the print
// must not visibly shrink) and always leave at least an 8 % overlap band for
// the cut to route through.
const MIN_FRAC = Number(arg("min-frac", 0.7));
const MAX_FRAC = Number(arg("max-frac", 0.92));
const FEATHER_FRAC = Number(arg("feather-frac", 0.3));

const only = (arg("only", "") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map(Number);

const slug = (i) => `stoff-${String(i).padStart(2, "0")}`;
const fmt = (n) => n.toFixed(2);

async function main() {
  await mkdir(OUT, { recursive: true });
  const files = (await readdir(SRC)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
  if (!files.length) {
    console.error(`No source images under ${SRC}`);
    process.exit(1);
  }

  console.log(
    `${files.length} sources → ${OUT}\n` +
      `  work=${WORK} size-search=${MIN_FRAC}..${MAX_FRAC} feather=${FEATHER_FRAC} tile=${TILE} q=${QUALITY}` +
      `${APPLY ? "  [APPLY]" : "  [dry run]"}\n`,
  );

  const report = [];
  for (let i = 1; i <= files.length; i += 1) {
    if (only.length && !only.includes(i)) continue;
    const id = slug(i);
    const src = join(SRC, files[i - 1]);
    const dest = join(OUT, `${id}.webp`);

    const square = await loadSquareRaw(src, WORK);

    // Baseline: what bil2455 ships today — the plain centre crop, same encoder
    // settings. Measured so the improvement is a number, not an impression.
    const beforeBuf = await toSharp(square)
      .resize(TILE, TILE, { fit: "fill" })
      .webp({ quality: QUALITY, effort: EFFORT })
      .toBuffer();
    const before = seamEnergy(await decodeRaw(beforeBuf));

    const flat = await flattenIllumination(square);
    const pick = chooseTileSize(flat, { minFrac: MIN_FRAC, maxFrac: MAX_FRAC });
    const wrapped = seamlessWrap(flat, { band: pick.band, featherFrac: FEATHER_FRAC });
    const info = await toSharp(wrapped)
      .resize(TILE, TILE, { fit: "fill" })
      .webp({ quality: QUALITY, effort: EFFORT })
      .toFile(dest);
    const after = seamEnergy(await decodeRaw(dest));

    report.push({
      id,
      source: basename(src),
      bytes: info.size,
      tileSize: pick.size,
      band: pick.band,
      before: { x: before.x, y: before.y },
      after: { x: after.x, y: after.y },
    });
    console.log(
      `  ${id}  seam x ${fmt(before.x)}→${fmt(after.x)}   y ${fmt(before.y)}→${fmt(after.y)}   ` +
        `s=${pick.size} band=${pick.band}  ${(info.size / 1024).toFixed(1)} kB`,
    );
  }

  const worst = report.reduce((m, r) => Math.max(m, r.after.x, r.after.y), 0);
  const worstBefore = report.reduce((m, r) => Math.max(m, r.before.x, r.before.y), 0);
  const avgBefore = report.reduce((s, r) => s + (r.before.x + r.before.y) / 2, 0) / report.length;
  const avgAfter = report.reduce((s, r) => s + (r.after.x + r.after.y) / 2, 0) / report.length;
  console.log(
    `\nSeam energy (1.00 = repeat edge indistinguishable from any interior edge)\n` +
      `  avg   ${fmt(avgBefore)} → ${fmt(avgAfter)}\n` +
      `  worst ${fmt(worstBefore)} → ${fmt(worst)}`,
  );

  // Never next to the tiles: with --apply that directory is `public/`, and the
  // report would ship to every visitor as a stray asset.
  const reportDir = join(STOREFRONT_ROOT, ".tmp", "bil2497");
  await mkdir(reportDir, { recursive: true });
  const reportOut = join(reportDir, "seam-report.json");
  await writeFile(reportOut, JSON.stringify({ report }, null, 2) + "\n", "utf8");
  console.log(`Report → ${reportOut}`);
  if (!APPLY) console.log("\nDry run — re-run with --apply to write public/stoffe.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
