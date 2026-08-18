#!/usr/bin/env node
// BIL-2497 — visual proof that the repeat is gone.
//
// A full-page screenshot hides the seam (the ticket's "Beweisfotos richtig
// schneiden" guardrail): at preview scale the tile boundary is a thin line in a
// busy photo. So this renders the tile the way the browser does —
// `background-repeat: repeat` at the preview's own tile scale — and crops
// exactly on the repeat boundary, where a seam would have to show.
//
// For every requested fabric it emits, side by side:
//   {id}-before.png  the current centre-crop tile, repeated 3x3
//   {id}-after.png   the seamless tile, repeated 3x3
//   {id}-compare.png both, labelled, with the seam crosshair marked
// plus the same pair after a 90° turn, which is the BIL-2492 rotation case.
//
// Usage:
//   node apps/storefront/scripts/bil2497-seam-evidence.mjs --only 14,20,33
//   ... --after public/stoffe   # measure what is actually deployed

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import {
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

const HERE = dirname(fileURLToPath(import.meta.url));
const STOREFRONT_ROOT = resolve(HERE, "..");
const SRC = resolve(arg("src", "C:/Users/Besitzer/Desktop/bilulu/stoffe"));
const OUT = resolve(arg("out", join(STOREFRONT_ROOT, ".tmp", "bil2497", "evidence")));
const AFTER_DIR = arg("after", null);

// The preview paints the tile at 42 % of a ~620px photo column on desktop, so
// ~260 CSS px. Rendering the crops at that size means the seam is exactly as
// prominent here as it is on bilulu.de — no zoom flattery in either direction.
const PAINT = Number(arg("paint", 260));
const only = (arg("only", "") || "").split(",").map((s) => s.trim()).filter(Boolean).map(Number);

const slug = (i) => `stoff-${String(i).padStart(2, "0")}`;

/** Repeats a tile 3x3 and crops the centre, so the crosshair sits mid-frame. */
async function tiled(tileBuf, rotation = 0) {
  const rotated = rotation ? await sharp(tileBuf).rotate(rotation).toBuffer() : tileBuf;
  const tile = await sharp(rotated).resize(PAINT, PAINT, { fit: "fill" }).png().toBuffer();
  const full = await sharp({
    create: { width: PAINT * 3, height: PAINT * 3, channels: 3, background: "#000" },
  })
    .composite([{ input: tile, tile: true }])
    .png()
    .toBuffer();
  // Centre crop straddling the seam crosshair at (PAINT*2, PAINT*2)... the
  // crosshair between tile 1|2 sits at PAINT*2 in both axes; crop around it.
  const half = Math.round(PAINT * 0.9);
  return sharp(full)
    .extract({ left: PAINT * 2 - half, top: PAINT * 2 - half, width: half * 2, height: half * 2 })
    .png()
    .toBuffer();
}

/** Draws the seam crosshair + a caption so the reviewer knows where to look. */
async function annotate(buf, label, verdict) {
  const { width, height } = await sharp(buf).metadata();
  const cx = Math.round(width / 2);
  const cy = Math.round(height / 2);
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <line x1="${cx}" y1="0" x2="${cx}" y2="${height}" stroke="#ff2d55" stroke-width="1" stroke-dasharray="7 7" opacity="0.85"/>
  <line x1="0" y1="${cy}" x2="${width}" y2="${cy}" stroke="#ff2d55" stroke-width="1" stroke-dasharray="7 7" opacity="0.85"/>
  <rect x="0" y="0" width="${width}" height="34" fill="#000" opacity="0.62"/>
  <text x="10" y="23" font-family="Segoe UI, sans-serif" font-size="15" fill="#fff">${label}</text>
  <text x="${width - 10}" y="23" text-anchor="end" font-family="Segoe UI, sans-serif" font-size="15" fill="#ffd8a8">${verdict}</text>
</svg>`;
  return sharp(buf).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
}

async function sideBySide(left, right) {
  const { width, height } = await sharp(left).metadata();
  return sharp({
    create: { width: width * 2 + 12, height, channels: 3, background: "#faf7f2" },
  })
    .composite([
      { input: left, left: 0, top: 0 },
      { input: right, left: width + 12, top: 0 },
    ])
    .png()
    .toBuffer();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const files = (await readdir(SRC)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
  const rows = [];

  for (let i = 1; i <= files.length; i += 1) {
    if (only.length && !only.includes(i)) continue;
    const id = slug(i);

    const square = await loadSquareRaw(join(SRC, files[i - 1]), 1200);
    const beforeTile = await toSharp(square).resize(512, 512, { fit: "fill" }).webp({ quality: 80, effort: 6 }).toBuffer();

    const afterTile = AFTER_DIR
      ? await sharp(resolve(AFTER_DIR, `${id}.webp`)).toBuffer()
      : await toSharp(
          seamlessWrap(await flattenIllumination(square), {
            band: Math.max(8, Math.round(square.width * 0.12)),
            featherFrac: 0.3,
          }),
        )
          .resize(512, 512, { fit: "fill" })
          .webp({ quality: 80, effort: 6 })
          .toBuffer();

    const be = seamEnergy(await decodeRaw(beforeTile));
    const ae = seamEnergy(await decodeRaw(afterTile));

    for (const rot of [0, 90]) {
      const suffix = rot ? `-rot${rot}` : "";
      const l = await annotate(
        await tiled(beforeTile, rot),
        `${id}${suffix} VORHER`,
        `Naht ${Math.max(be.x, be.y).toFixed(2)}x`,
      );
      const r = await annotate(
        await tiled(afterTile, rot),
        `${id}${suffix} NACHHER`,
        `Naht ${Math.max(ae.x, ae.y).toFixed(2)}x`,
      );
      await writeFile(join(OUT, `${id}${suffix}-compare.png`), await sideBySide(l, r));
    }
    rows.push({ id, before: Math.max(be.x, be.y), after: Math.max(ae.x, ae.y) });
    console.log(`  ${id}  ${rows.at(-1).before.toFixed(2)}x → ${rows.at(-1).after.toFixed(2)}x`);
  }

  await writeFile(join(OUT, "summary.json"), JSON.stringify({ paint: PAINT, rows }, null, 2) + "\n", "utf8");
  console.log(`\n→ ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
