#!/usr/bin/env node
// BIL-2455 — Batch-normalise board-delivered fabric photos into web-ready
// swatches for the Konfigurator "Hauptstoff" picker.
//
// Input:  a folder of raw JPEGs (board delivery via WhatsApp — arbitrary
//         aspect ratios, ~2040x1530).
// Output: public/stoffe/{slug}.webp (512x512, quality 80, sRGB) + a small
//         chip preview at public/stoffe/{slug}-128.webp and a manifest JSON
//         with the average dominant colour per swatch so the picker chip can
//         fall back to a solid hex on slow networks.
//
// BIL-2493 — tile size: the preview tiles the swatch at TILE_PERCENT (42 %) of
// the photo width. The widest we ever paint it is a 1440px desktop, where the
// photo column is ~620px, so the tile is ~260 CSS px — 520 device px at DPR 2.
// A 1024px master was therefore ~4x the pixels we can show, at ~444 kB each on
// the critical path (the tile is part of the LCP element). 512 covers the
// worst case exactly and is visually indistinguishable at paint size; see
// scripts/bil2493-probe-render-size.mjs for the measurement.
//
// The chip is a separate, much smaller file for the same reason: the palette
// renders 35 fabric chips as 44–48px circles, and they must not each pull the
// preview-sized tile.
//
// Usage:
//   node apps/storefront/scripts/bil2455-build-fabric-swatches.mjs \
//     --src "C:/Users/Besitzer/Desktop/bilulu/stoffe"
//
// Board can rename slugs later by editing manifest.json + palette entry;
// the storefront resolves swatches by slug id.

import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}

// Resolve output relative to the storefront app root, not cwd, so the script
// works from repo root or from apps/storefront.
const HERE = dirname(fileURLToPath(import.meta.url));
const STOREFRONT_ROOT = resolve(HERE, "..");
const SRC = resolve(arg("src", "C:/Users/Besitzer/Desktop/bilulu/stoffe"));
const OUT = resolve(arg("out", join(STOREFRONT_ROOT, "public", "stoffe")));
const TILE = Number(arg("size", 512));
const CHIP = Number(arg("chip", 128));
const QUALITY = Number(arg("q", 80));
// `effort` costs encode time only, never quality — worth it for assets that
// are generated once and shipped to every visitor.
const EFFORT = Number(arg("effort", 6));

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} kB`;
}

function slugify(index) {
  return `stoff-${String(index).padStart(2, "0")}`;
}

function niceName(index) {
  return `Stoff ${String(index).padStart(2, "0")}`;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const files = (await readdir(SRC))
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .sort();
  if (!files.length) {
    console.error(`No source images found under ${SRC}`);
    process.exit(1);
  }
  console.log(`Found ${files.length} source photos in ${SRC}`);
  const manifest = [];
  let tileBytes = 0;
  let chipBytes = 0;
  let i = 0;
  for (const file of files) {
    i += 1;
    const src = join(SRC, file);
    const slug = slugify(i);
    const name = niceName(i);
    const tileOut = join(OUT, `${slug}.webp`);
    const chipOut = join(OUT, `${slug}-${CHIP}.webp`);

    const img = sharp(src, { failOn: "none" }).rotate();
    const meta = await img.metadata();
    const side = Math.min(meta.width ?? TILE, meta.height ?? TILE);
    const left = Math.max(0, Math.floor(((meta.width ?? side) - side) / 2));
    const top = Math.max(0, Math.floor(((meta.height ?? side) - side) / 2));

    const square = img
      .extract({ left, top, width: side, height: side })
      .resize(TILE, TILE, { fit: "cover" });

    // Average colour → chip hex fallback (for slow networks / broken URL).
    const { dominant } = await square.clone().stats();
    const hex = "#" +
      [dominant.r, dominant.g, dominant.b]
        .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0"))
        .join("");

    const tileInfo = await square.clone().webp({ quality: QUALITY, effort: EFFORT }).toFile(tileOut);
    const chipInfo = await square
      .clone()
      .resize(CHIP, CHIP, { fit: "cover" })
      .webp({ quality: QUALITY, effort: EFFORT })
      .toFile(chipOut);
    tileBytes += tileInfo.size;
    chipBytes += chipInfo.size;
    console.log(
      `  → ${slug}  hex=${hex}  tile ${kb(tileInfo.size)}  chip ${kb(chipInfo.size)}  from ${basename(src)}`,
    );
    manifest.push({
      id: slug,
      name,
      hex,
      textureSrc: `/stoffe/${slug}.webp`,
      chipSrc: `/stoffe/${slug}-${CHIP}.webp`,
      source: basename(src),
    });
  }

  // Chip size is part of the filename, so a size change leaves the previous
  // generation behind as dead weight in the deployed bundle. Prune anything
  // that looks like one of our chips but isn't the current size.
  const keep = new Set(manifest.flatMap((s) => [basename(s.textureSrc), basename(s.chipSrc)]));
  for (const f of await readdir(OUT)) {
    if (!/^stoff-\d+(-\d+)?\.webp$/.test(f) || keep.has(f)) continue;
    await rm(join(OUT, f));
    console.log(`  ✕ pruned stale ${f}`);
  }
  await writeFile(
    join(OUT, "manifest.json"),
    JSON.stringify({ generatedAt: null, tile: TILE, chip: CHIP, swatches: manifest }, null, 2) + "\n",
    "utf8",
  );
  console.log(`Wrote manifest with ${manifest.length} swatches → ${join(OUT, "manifest.json")}`);

  // Emit a typed TS module the storefront can import directly. Regenerating
  // this file is the whole reason the manifest is derived from the delivery
  // folder — palette.ts only imports and re-exports.
  const tsOut = resolve(STOREFRONT_ROOT, "src", "app", "konfigurator", "_shared", "fabrics.generated.ts");
  const body = manifest
    .map(
      (s) =>
        `  { id: "${s.id}", name: "${s.name.replace(/"/g, '\\"')}", hex: "${s.hex}", textureSrc: "${s.textureSrc}", chipSrc: "${s.chipSrc}" },`,
    )
    .join("\n");
  const ts = `// AUTO-GENERATED by scripts/bil2455-build-fabric-swatches.mjs
// Do not edit by hand — re-run the script when new fabrics arrive.
//
// textureSrc = ${TILE}x${TILE} preview tile (ZoneOverlay, OG card, Merken thumbnail)
// chipSrc    = ${CHIP}x${CHIP} palette chip (swatchChipStyle) — BIL-2493
import type { Swatch } from "../hose/palette";

export const FABRICS: readonly Swatch[] = [
${body}
] as const;
`;
  await writeFile(tsOut, ts, "utf8");
  console.log(`Wrote generated fabric list → ${tsOut}`);
  console.log(
    `Total: ${manifest.length} tiles ${kb(tileBytes)} (avg ${kb(tileBytes / manifest.length)}), ` +
      `${manifest.length} chips ${kb(chipBytes)} (avg ${kb(chipBytes / manifest.length)})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
