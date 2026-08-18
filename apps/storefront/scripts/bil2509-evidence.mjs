/**
 * BIL-2509 — before/after evidence sheet.
 *
 * Renders the same configuration from the assets in `--before` (a saved copy of
 * the shipped assets) and from the current working tree, side by side, plus the
 * fold-zone crops the ticket asks for. Everything goes through the same offline
 * reproduction of the browser blend stack (bil2509-composite.mjs), so a
 * difference in the sheet is a difference in the assets and nothing else.
 *
 * Usage:
 *   node scripts/bil2509-evidence.mjs --konfig hose-kurz --rot 90 \
 *     --paint hose=stoff-04 --paint bund=mustard --paint buendchen=mustard \
 *     --out .tmp/bil2509/sheet-hosekurz.png
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

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

const konfigId = arg("konfig", "hose-kurz");
const rot = Number(arg("rot", "0"));
const beforeDir = arg("before", `.tmp/bil2509/shipped/${konfigId}`);
const outPath = arg("out", `.tmp/bil2509/sheet-${konfigId}.png`);
await mkdir(path.dirname(outPath), { recursive: true });

const { composite } = await import("./bil2509-composite.mjs");

// Both renders read from an explicit directory; nothing under public/ is ever
// moved, copied over or deleted by this script.
const after = await composite(konfigId, paints, rot);
const before = await composite(konfigId, paints, rot, beforeDir);
const { W, H } = after;

const png = (r) => sharp(r.buf, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
const GAP = 24;
const sheet = await sharp({
  create: { width: W * 2 + GAP * 3, height: H + GAP * 2, channels: 3, background: { r: 246, g: 244, b: 240 } },
})
  .composite([
    { input: await png(before), left: GAP, top: GAP },
    { input: await png(after), left: GAP * 2 + W, top: GAP },
  ])
  .png()
  .toFile(outPath);

console.log("wrote", outPath, sheet.width, "x", sheet.height, "(left = shipped, right = BIL-2509)");
