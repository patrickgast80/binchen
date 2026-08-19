/**
 * BIL-2522 — one contact sheet per Konfigurator, EVERY fabric on it.
 *
 * Board direction 2026-08-19 11:54Z: "es soll mit jedem gewählten stoff genauso
 * echt aussehen wie das original bild". Two hand-picked example fabrics cannot
 * show that. A print that happens to have a fold-sized repeat can hide a warp
 * that is too strong, and a near-uni fabric can hide one that is too weak, so
 * the only honest form of the claim is all 35 swatches on one page next to the
 * original photo.
 *
 * The sheet is also the cheapest way to catch a per-fabric outlier: a single
 * tile that tears, aliases or goes flat is obvious in a grid and invisible in a
 * pair of examples.
 *
 *   node scripts/bil2522-contact-sheet.mjs --konfig turban
 *   node scripts/bil2522-contact-sheet.mjs            # all five
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { KONFIGS } from "./bil2509-composite.mjs";
import { renderRelief } from "./bil2522-render.mjs";

const CELL_W = 260;
const COLS = 6;
const GAP = 10;
const PAD = 24;
const CAP_H = 20;
const HEAD_H = 200;
const BG = { r: 250, g: 247, b: 242 };

const REFERENCE = {
  hose: "scripts/sources/hose-pumphose-05.jpg",
  "hose-kurz": "scripts/sources/hose-kurz-dinos-01.jpeg",
  muetze: "scripts/sources/muetze-boho-mint-01.jpeg",
  turban: "scripts/sources/turban-rosen-01.jpeg",
  dreieckstuch: "scripts/sources/dreieckstuch-zoo-01.jpeg",
};

/** The uni colour the trim zones get, so the print zone is what varies. */
const TRIM = "cream";

/**
 * The zone that carries the chosen fabric on each piece.
 *
 * Explicit, because the obvious heuristic is wrong: "the second zone" picks
 * `hose` correctly on both trousers but lands on the Mütze's *Futter* and the
 * Turban's *Schleife* — so a whole set of evidence sheets showed the print on
 * the lining and the bow while the garment itself stayed a flat uni colour.
 */
const MAIN_ZONE = {
  hose: "hose",
  "hose-kurz": "hose",
  muetze: "muetze",
  turban: "turban",
  dreieckstuch: "tuch",
};

const esc = (s) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]);

async function text(str, w, h, size, weight = 600) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="100%" height="100%" fill="rgb(250,247,242)"/>
    <text x="0" y="${size}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${size}"
      font-weight="${weight}" fill="#2C2417">${esc(str)}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function contactSheet(konfigId, outDir) {
  const k = KONFIGS[konfigId];
  const swatches = JSON.parse(await readFile("public/stoffe/manifest.json", "utf8")).swatches;
  // The print goes on the piece's main zone; everything else stays cream so a
  // difference between two cells can only come from the fabric.
  const main = MAIN_ZONE[konfigId];
  if (!main) throw new Error(`no main zone mapped for ${konfigId}`);

  const cellH = Math.round((CELL_W * k.h) / k.w);
  const rows = Math.ceil(swatches.length / COLS);
  const gridW = COLS * CELL_W + (COLS - 1) * GAP;
  const totalW = PAD * 2 + gridW;
  const totalH = PAD * 2 + HEAD_H + rows * (cellH + CAP_H + GAP);

  const composites = [];

  // Header: the original photo, at the same cell height, plus the claim being
  // made — so the sheet cannot be read without the thing it is compared to.
  const refFile = REFERENCE[konfigId];
  const refH = HEAD_H - 30;
  const ref = await sharp(refFile)
    .resize({ height: refH, fit: "inside" })
    .flatten({ background: BG })
    .png()
    .toBuffer();
  composites.push({ input: ref, left: PAD, top: PAD + 26 });
  const refMeta = await sharp(ref).metadata();
  composites.push({ input: await text("ORIGINALFOTO", 300, 24, 15), left: PAD, top: PAD });
  composites.push({
    input: await text(`${konfigId} — Relief-Stoff, alle ${swatches.length} Stoffe`, 900, 30, 22),
    left: PAD + refMeta.width + 24,
    top: PAD + 26,
  });
  composites.push({
    input: await text(
      `Zone "${main}" traegt den Stoff, alle uebrigen Zonen ${TRIM}. Rotation 0.`,
      900, 24, 14, 400,
    ),
    left: PAD + refMeta.width + 24,
    top: PAD + 60,
  });

  for (let i = 0; i < swatches.length; i++) {
    const s = swatches[i];
    const paints = { [main]: s.id };
    for (const z of k.zones) if (z !== main) paints[z] = TRIM;
    const { buf, W, H } = await renderRelief(konfigId, paints, 0);
    const cell = await sharp(buf, { raw: { width: W, height: H, channels: 3 } })
      .resize({ width: CELL_W, height: cellH, fit: "inside" })
      .flatten({ background: BG })
      .png()
      .toBuffer();
    const col = i % COLS;
    const row = (i / COLS) | 0;
    const left = PAD + col * (CELL_W + GAP);
    const top = PAD + HEAD_H + row * (cellH + CAP_H + GAP);
    composites.push({ input: cell, left, top });
    composites.push({ input: await text(s.id, CELL_W, CAP_H, 13, 500), left, top: top + cellH + 2 });
  }

  await mkdir(outDir, { recursive: true });
  const out = path.join(outDir, `${konfigId}-alle-stoffe.png`);
  await sharp({ create: { width: totalW, height: totalH, channels: 3, background: BG } })
    .composite(composites)
    .png()
    .toFile(out);
  console.log(`wrote ${out} (${swatches.length} Stoffe, ${totalW}x${totalH})`);
  return out;
}

if (process.argv[1]?.endsWith("bil2522-contact-sheet.mjs")) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--konfig");
  const j = argv.indexOf("--out");
  const outDir = j >= 0 ? argv[j + 1] : "reports/bil2522";
  const ids = i >= 0 ? [argv[i + 1]] : ["hose", "hose-kurz", "muetze", "turban", "dreieckstuch"];
  for (const id of ids) await contactSheet(id, outDir);
}
