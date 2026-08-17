#!/usr/bin/env node
// BIL-2486: real AI cutout instead of crop+mat.
//
// Board feedback 2026-08-17 on BIL-1 rejected the BIL-2462 approach (crop +
// trim + a mat/canvas colour, with the ORIGINAL studio backdrop still
// visible inside the frame — and, briefly, matched per-photo per BIL-2483/
// the 2026-08-17 "own backdrop colour" directive in STUDIO-LOOK.md). The
// board wants a real foreground/background segmentation cutout, composited
// onto ONE uniform colour for every product photo, no exceptions.
//
// This uses @imgly/background-removal-node (ONNX foreground-segmentation
// model, runs fully local/offline, no API key) instead of the flood-fill
// approach in bil2462-studio-normalize.mjs, which could only ever crop a
// uniform-enough backdrop, never truly cut around a non-uniform one.
//
// NOT a workspace dependency: @imgly/background-removal-node pulls in
// onnxruntime-node (~100MB of native binaries) that the Next.js production
// app never needs at runtime. Install it ad hoc before running this script,
// e.g. in a scratch dir added to NODE_PATH, or `npm install
// @imgly/background-removal-node sharp` right here in apps/storefront/scripts/
// (that would create a second lockfile — fine for a folder that's a CLI
// tool, not part of the Next.js build/bundle; just don't commit
// node_modules). Do not add it to apps/storefront/package.json/pnpm-lock —
// that would bloat every `next build` / Coolify deploy with a dependency
// the storefront itself never imports.
//
// Usage:
//   node bil2486-segment-normalize.mjs --in file.jpg --out file.jpg
//   node bil2486-segment-normalize.mjs --in dir/ --out dir/   (batch)
import fs from "node:fs";
import path from "node:path";
import { removeBackground } from "@imgly/background-removal-node";
import sharp from "sharp";

// = apps/storefront/tailwind.config.*'s binchen.cream-dark. Chosen (not the
// old fallback grey 200/200/198, not a new invented colour) because it's
// already the product-card container background site-wide — the photo
// canvas now blends into its own card with zero visible seam.
export const CANVAS_BG = { r: 240, g: 235, b: 225 }; // #F0EBE1
export const CANVAS_SIZE = 1200;
// Product must fill the frame (board directive 2026-08-17: "Fenstergröße
// einnehmen") while leaving a hairline so nothing touches the edge.
export const PAD_RATIO = 0.04;

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, a) => {
  if (cur.startsWith("--")) acc.push([cur.slice(2), a[i + 1]]);
  return acc;
}, []));

export async function segmentToUniformCanvas(inputPath) {
  // removeBackground bakes EXIF orientation itself (reads via jpeg/onnx
  // preprocessing pipeline), but bake it explicitly first anyway so the
  // alpha bbox math below and any --rotate step agree on the same frame.
  const oriented = await sharp(inputPath).rotate().png().toBuffer();
  const cutout = await removeBackground(new Blob([oriented], { type: "image/png" }));
  const cutoutBuf = Buffer.from(await cutout.arrayBuffer());

  // Trim to the alpha bounding box so the product is centred and scaled to
  // fill the canvas consistently, regardless of how much empty margin the
  // source photo had.
  const trimmed = await sharp(cutoutBuf).trim({ threshold: 1 }).toBuffer();
  const meta = await sharp(trimmed).metadata();

  const innerMax = Math.round(CANVAS_SIZE * (1 - PAD_RATIO * 2));
  const scale = Math.min(innerMax / meta.width, innerMax / meta.height, 1);
  const targetW = Math.round(meta.width * scale);
  const targetH = Math.round(meta.height * scale);
  const resized = await sharp(trimmed).resize(targetW, targetH, { fit: "inside" }).toBuffer();

  // Optical centre ~48% from top (STUDIO-LOOK.md), not geometric 50%.
  const left = Math.round((CANVAS_SIZE - targetW) / 2);
  const top = Math.round(CANVAS_SIZE * 0.48 - targetH / 2);

  return sharp({
    create: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 3, background: CANVAS_BG },
  })
    .composite([{ input: resized, left, top: Math.max(0, Math.min(top, CANVAS_SIZE - targetH)) }])
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

async function processOne(inFile, outFile) {
  const out = await segmentToUniformCanvas(inFile);
  const tmp = outFile + ".tmp.jpg";
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, outFile); // sharp can't overwrite the file it read from
  console.log(`OK ${inFile} -> ${outFile}`);
}

async function main() {
  if (!args.in || !args.out) { console.error("--in and --out required"); process.exit(1); }
  const inStat = fs.statSync(args.in);
  if (inStat.isDirectory()) {
    fs.mkdirSync(args.out, { recursive: true });
    const files = fs.readdirSync(args.in).filter((f) => /\.(jpe?g|png)$/i.test(f));
    for (const f of files) {
      await processOne(path.join(args.in, f), path.join(args.out, f.replace(/\.png$/i, ".jpg")));
    }
  } else {
    await processOne(args.in, args.out);
  }
}

// Only run the CLI when invoked with --in/--out, not when
// segmentToUniformCanvas is imported from a batch driver (e.g.
// bil2486-*-batch.mjs), which calls it without touching argv.
if (args.in || args.out) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
