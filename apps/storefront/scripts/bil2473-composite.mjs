/**
 * BIL-2473 diagnostic: reproduce the browser composite of the Hose-Konfigurator
 * (base * colour via multiply, then highlight via screen) offline, so we can
 * compare all 12 palette colours without a browser round-trip.
 *
 * Usage: node scripts/bil2473-composite.mjs [outDir]
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const DIR = process.argv[3] ?? "public/konfigurator/hose-foto";
const OUT = process.argv[2] ?? ".tmp/bil2473";
await mkdir(OUT, { recursive: true });

const PALETTE = {
  cream: "#FAF7F2", sand: "#E8DDC8", taupe: "#B5A48A", "powder-pink": "#E8C2C2",
  terracotta: "#C4704A", rust: "#7A3318", mustard: "#D4A24C", sage: "#A8C5AB",
  forest: "#3F6444", sky: "#A8C8D8", petrol: "#5BA8AE", navy: "#2D3E50",
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const raw = async (n) => sharp(path.join(DIR, `${n}.webp`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { data: base, info } = await raw("base");
const { data: hi } = await raw("highlight");
const W = info.width, H = info.height, N = W * H;
const masks = {};
for (const z of ["bund", "hose", "buendchen"]) masks[z] = (await raw(`mask-${z}`)).data;

/** paints: {bund, hose, buendchen} palette ids. Returns RGBA buffer on white. */
export function composite(paints) {
  const out = Buffer.alloc(N * 4, 255);
  const cols = Object.fromEntries(Object.entries(paints).map(([z, id]) => [z, hex(PALETTE[id])]));
  for (let p = 0; p < N; p++) {
    const i = p * 4;
    const a = base[i + 3] / 255;
    if (a < 0.004) continue;
    let zone = null;
    for (const z of ["bund", "hose", "buendchen"]) if (masks[z][i + 3] >= 128) zone = z;
    const c = zone ? cols[zone] : [255, 255, 255];
    for (let ch = 0; ch < 3; ch++) {
      const mul = (base[i + ch] * c[ch]) / 255;
      const scr = 255 - ((255 - mul) * (255 - hi[i + ch])) / 255;
      out[i + ch] = Math.round(255 * (1 - a) + scr * a);
    }
  }
  return out;
}

const CROPS = {
  bund: { left: 200, top: 10, width: 520, height: 260 },
  buendchen: { left: 30, top: 810, width: 420, height: 190 },
};

if (process.argv[1].endsWith("bil2473-composite.mjs")) {
  const combos = process.env.BIL2473_COLORS?.split(",") ?? ["petrol", "cream", "terracotta", "navy", "forest", "rust"];
  for (const col of combos) {
    const buf = composite({ bund: col, hose: "cream", buendchen: col });
    const img = sharp(buf, { raw: { width: W, height: H, channels: 4 } });
    await img.clone().png().toFile(path.join(OUT, `full-${col}.png`));
    for (const [name, box] of Object.entries(CROPS)) {
      await sharp(buf, { raw: { width: W, height: H, channels: 4 } })
        .extract(box).resize({ width: box.width * 2, kernel: "nearest" })
        .png().toFile(path.join(OUT, `${name}-${col}.png`));
    }
  }
  console.log("wrote composites to", OUT);
}
