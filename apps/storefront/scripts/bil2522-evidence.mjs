/**
 * BIL-2522 — evidence sheets.
 *
 * Renders the SHIPPED stack (bil2509-composite) and the relief stack
 * (bil2522-render) from the same assets and paints, then stitches them into
 * one sheet per fabric so the board judges a real pair, not two screenshots
 * taken minutes apart. A reference photo of the real garment is pasted next to
 * them when one exists — "täuschend echt" is only meaningful against the thing
 * it is supposed to be mistaken for.
 *
 *   node scripts/bil2522-evidence.mjs --konfig hose --out reports/bil2522
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { composite, KONFIGS } from "./bil2509-composite.mjs";
import { renderRelief } from "./bil2522-render.mjs";

const PANEL_W = 560;
const GAP = 18;
const PAD = 22;
const LABEL_H = 34;
const BG = { r: 250, g: 247, b: 242 };

/**
 * The photo each render is judged against — board direction of 2026-08-19
 * 11:54Z: "vergleiche immer mit dem original bild des jeweiligen konfigurator,
 * nicht mit der vorherigen version". So this is deliberately the PINNED SOURCE
 * the base asset was built from, not a catalog crop and not the last render.
 * Pinned under scripts/sources/ because the catalog normalisation pass has
 * silently rewritten these files before (see scripts/sources/README.md).
 */
const REFERENCE = {
  hose: "scripts/sources/hose-pumphose-05.jpg",
  "hose-kurz": "scripts/sources/hose-kurz-dinos-01.jpeg",
  muetze: "scripts/sources/muetze-boho-mint-01.jpeg",
  turban: "scripts/sources/turban-rosen-01.jpeg",
  dreieckstuch: "scripts/sources/dreieckstuch-zoo-01.jpeg",
};

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

const escapeXml = (s) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

async function labelPng(text, w) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${LABEL_H}">
    <rect width="100%" height="100%" fill="rgb(250,247,242)"/>
    <text x="${w / 2}" y="23" font-family="DejaVu Sans, Arial, sans-serif" font-size="19"
      font-weight="600" fill="#2C2417" text-anchor="middle">${escapeXml(text)}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Scale to PANEL_W and pad to a common height so panels line up. */
async function panel(buf, w, h, boxH) {
  const scaled = await sharp(buf)
    .resize({ width: PANEL_W, fit: "inside" })
    .flatten({ background: BG })
    .png()
    .toBuffer();
  const meta = await sharp(scaled).metadata();
  void w; void h;
  return sharp({
    create: { width: PANEL_W, height: boxH, channels: 3, background: BG },
  })
    .composite([{ input: scaled, left: Math.round((PANEL_W - meta.width) / 2), top: Math.round((boxH - meta.height) / 2) }])
    .png()
    .toBuffer();
}

export async function sheet(panels, outFile) {
  const boxH = Math.max(...panels.map((p) => p.h));
  const built = [];
  for (const p of panels) built.push(await panel(p.buf, p.w, p.h, boxH));
  const totalW = PAD * 2 + panels.length * PANEL_W + (panels.length - 1) * GAP;
  const totalH = PAD * 2 + LABEL_H + boxH;
  const composites = [];
  for (let i = 0; i < panels.length; i++) {
    const left = PAD + i * (PANEL_W + GAP);
    composites.push({ input: await labelPng(panels[i].label, PANEL_W), left, top: PAD });
    composites.push({ input: built[i], left, top: PAD + LABEL_H });
  }
  await sharp({ create: { width: totalW, height: totalH, channels: 3, background: BG } })
    .composite(composites)
    .png()
    .toFile(outFile);
  return { totalW, totalH };
}

const toPng = (r) =>
  sharp(r.buf, { raw: { width: r.W, height: r.H, channels: 3 } }).png().toBuffer();

export async function pairFor(konfigId, paints, rotation, outDir, tag) {
  const before = await composite(konfigId, paints, rotation);
  const after = await renderRelief(konfigId, paints, rotation);
  const panels = [
    { buf: await toPng(before), w: before.W, h: before.H, label: "VORHER — flache Kachel" },
    { buf: await toPng(after), w: after.W, h: after.H, label: "NACHHER — Relief-Stoff" },
  ];
  const ref = REFERENCE[konfigId];
  if (ref) {
    const meta = await sharp(ref).metadata();
    panels.push({ buf: await sharp(ref).png().toBuffer(), w: meta.width, h: meta.height, label: "ECHTES PRODUKTFOTO" });
  }
  const outFile = path.join(outDir, `${konfigId}-${tag}.png`);
  await sheet(panels, outFile);
  // Standalone copies too — a sheet is for judging, a single render is for
  // dropping into the ticket next to a live screenshot.
  await sharp(await toPng(before)).toFile(path.join(outDir, `${konfigId}-${tag}-vorher.png`));
  await sharp(await toPng(after)).toFile(path.join(outDir, `${konfigId}-${tag}-nachher.png`));
  console.log("wrote", outFile);
  return outFile;
}

if (process.argv[1]?.endsWith("bil2522-evidence.mjs")) {
  const argv = process.argv.slice(2);
  const arg = (n, d) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 ? argv[i + 1] : d;
  };
  const konfigId = arg("konfig", "hose");
  const outDir = arg("out", `reports/bil2522`);
  await mkdir(outDir, { recursive: true });

  const k = KONFIGS[konfigId];
  const main = MAIN_ZONE[konfigId];
  if (!main) throw new Error(`no main zone mapped for ${konfigId}`);
  const mk = (fabric, uni) => {
    const p = { [main]: fabric };
    for (const z of k.zones) if (z !== main) p[z] = uni;
    return p;
  };

  await pairFor(konfigId, mk("stoff-04", "mustard"), 0, outDir, "stoff-04-mustard");
  await pairFor(konfigId, mk("stoff-15", "sage"), 0, outDir, "stoff-15-sage");
  await pairFor(konfigId, mk("stoff-20", "petrol"), 90, outDir, "stoff-20-petrol-rot90");
}
