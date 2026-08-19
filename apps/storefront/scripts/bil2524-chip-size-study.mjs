#!/usr/bin/env node
// BIL-2524 — how small may the palette chip get before the fabric stops being
// recognisable? Frontend costed the options in bytes; this script costs them in
// pixels, which is the half of the question that has to be answered by eye.
//
// What it renders is deliberately NOT the chip file. It is the chip file
// decoded and blown back up to the size the browser actually paints it at, so
// the sheet shows the artefacts a customer sees, not the ones a 1:1 crop hides.
//
// Display size is 48 CSS px (`h-12 w-12` in every Konfigurator palette; 44 px
// only from the `sm:` breakpoint up). So the honest worst case is DPR 3 = 144
// device px, and DPR 2 = 96 device px.
//
// Usage:
//   node apps/storefront/scripts/bil2524-chip-size-study.mjs
//   ... --group 1            # only the first sheet
//   ... --dpr 2              # paint at 96 px instead of 144 px

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = resolve(arg("src", "C:/Users/Besitzer/Desktop/bilulu/stoffe"));
const OUT = resolve(arg("out", join(ROOT, "..", "e2e", "reports", "bil2524")));
const DPR = Number(arg("dpr", 3));
const ONLY_GROUP = arg("group", null);
// `--only 33,34` restricts the sheet to the fabrics that decide the question.
const ONLY_SLUGS = arg("only", null)
  ? new Set(arg("only", "").split(",").map((n) => `stoff-${String(Number(n)).padStart(2, "0")}`))
  : null;
// `--variants 128@80,96@70` overrides the default candidate list.
const VARIANT_SPEC = arg("variants", null);
const TAG = arg("tag", `dpr${DPR}`);

// 48 CSS px is the real chip. Paint at DPR so the upscale is the one Chrome does.
const PAINT = 48 * DPR;
const PER_SHEET = 12;

// The candidates from the BIL-2524 table, plus today's build as the control.
const VARIANTS = VARIANT_SPEC
  ? VARIANT_SPEC.split(",").map((spec) => {
      const [size, quality] = spec.split("@").map(Number);
      return { label: `${size}@q${quality}`, size, quality };
    })
  : [
      { label: "heute 128@q80", size: 128, quality: 80 },
      { label: "96@q70", size: 96, quality: 70 },
      { label: "80@q72", size: 80, quality: 72 },
      { label: "64@q75", size: 64, quality: 75 },
    ];

const EFFORT = 6;
const GAP = 14;
const LABEL_H = 34;
const ROW_LABEL_W = 92;

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} kB`;
}

/** Centre-crop to square exactly the way bil2455-build-fabric-swatches does. */
async function squareSource(file) {
  const img = sharp(file, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  const side = Math.min(meta.width ?? 512, meta.height ?? 512);
  const left = Math.max(0, Math.floor(((meta.width ?? side) - side) / 2));
  const top = Math.max(0, Math.floor(((meta.height ?? side) - side) / 2));
  return img.extract({ left, top, width: side, height: side }).resize(512, 512, { fit: "cover" });
}

/**
 * Encode the candidate chip, then decode it and scale it up to paint size.
 * `mitchell` on the way up, not the default lanczos3: lanczos sharpens the
 * upscale and would flatter the small variants, which is the opposite of what
 * this sheet is for.
 */
async function paintChip(square, variant) {
  const chip = await square
    .clone()
    .resize(variant.size, variant.size, { fit: "cover" })
    .webp({ quality: variant.quality, effort: EFFORT })
    .toBuffer();
  const painted = await sharp(chip)
    .resize(PAINT, PAINT, { kernel: "mitchell" })
    .png()
    .toBuffer();
  return { bytes: chip.length, painted };
}

/** Round mask — the chip is a circle, and a circle hides the corner artefacts. */
function circleMask(size) {
  const r = size / 2;
  return Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r - 1}" fill="#fff"/></svg>`,
  );
}

function textSvg(text, w, h, { size = 13, anchor = "middle", weight = 500 } = {}) {
  const x = anchor === "start" ? 4 : w / 2;
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return Buffer.from(
    `<svg width="${w}" height="${h}"><text x="${x}" y="${h / 2 + 4}" text-anchor="${anchor}" ` +
      `font-family="Segoe UI, DejaVu Sans, sans-serif" font-size="${size}" font-weight="${weight}" ` +
      `fill="#2c2723">${esc}</text></svg>`,
  );
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const files = (await readdir(SRC)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
  if (files.length !== 35) {
    console.warn(`! expected 35 source photos, found ${files.length} — slug mapping may drift`);
  }

  const mask = await sharp(circleMask(PAINT)).png().toBuffer();
  const totals = VARIANTS.map(() => 0);
  const rows = [];

  for (let i = 0; i < files.length; i += 1) {
    const slug = `stoff-${String(i + 1).padStart(2, "0")}`;
    if (ONLY_SLUGS && !ONLY_SLUGS.has(slug)) continue;
    const square = await squareSource(join(SRC, files[i]));
    const cells = [];
    for (let v = 0; v < VARIANTS.length; v += 1) {
      const { bytes, painted } = await paintChip(square, VARIANTS[v]);
      totals[v] += bytes;
      const round = await sharp(painted)
        .composite([{ input: mask, blend: "dest-in" }])
        .png()
        .toBuffer();
      cells.push({ round, bytes });
    }
    rows.push({ slug, cells });
    console.log(`  ${slug}  ${cells.map((c, v) => `${VARIANTS[v].size}px ${kb(c.bytes)}`).join("  ")}`);
  }

  // Sheets of PER_SHEET fabrics each, so a sheet stays readable at 1:1.
  const groups = [];
  for (let i = 0; i < rows.length; i += PER_SHEET) groups.push(rows.slice(i, i + PER_SHEET));

  for (let g = 0; g < groups.length; g += 1) {
    if (ONLY_GROUP && Number(ONLY_GROUP) !== g + 1) continue;
    const group = groups[g];
    const w = ROW_LABEL_W + VARIANTS.length * (PAINT + GAP) + GAP;
    const h = LABEL_H + group.length * (PAINT + GAP) + GAP;
    const composite = [];

    for (let v = 0; v < VARIANTS.length; v += 1) {
      composite.push({
        input: textSvg(VARIANTS[v].label, PAINT + GAP, LABEL_H, { weight: 600 }),
        left: ROW_LABEL_W + v * (PAINT + GAP),
        top: 0,
      });
    }
    for (let r = 0; r < group.length; r += 1) {
      const top = LABEL_H + r * (PAINT + GAP);
      composite.push({
        input: textSvg(group[r].slug, ROW_LABEL_W, PAINT, { anchor: "start", size: 12 }),
        left: 0,
        top,
      });
      for (let v = 0; v < VARIANTS.length; v += 1) {
        composite.push({
          input: group[r].cells[v].round,
          left: ROW_LABEL_W + GAP / 2 + v * (PAINT + GAP),
          top,
        });
      }
    }

    const out = join(OUT, `chips-${TAG}-sheet${g + 1}.png`);
    await sharp({
      create: { width: w, height: h, channels: 3, background: "#faf7f2" },
    })
      .composite(composite)
      .png()
      .toFile(out);
    console.log(`Sheet ${g + 1} → ${out}`);
  }

  console.log("\nTotals over all fabrics:");
  const base = totals[0];
  VARIANTS.forEach((v, i) => {
    const saved = base - totals[i];
    console.log(
      `  ${v.label.padEnd(14)} ${kb(totals[i]).padStart(10)}   ` +
        (i === 0 ? "—" : `-${kb(saved)} (${((saved / base) * 100).toFixed(0)} %)`),
    );
  });
  await writeFile(
    join(OUT, `bytes-${TAG}.json`),
    JSON.stringify(
      { paintPx: PAINT, cssPx: 48, dpr: DPR, variants: VARIANTS.map((v, i) => ({ ...v, totalBytes: totals[i] })) },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
