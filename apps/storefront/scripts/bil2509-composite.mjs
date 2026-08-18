/**
 * BIL-2509 — offline reproduction of the Konfigurator blend stack.
 *
 * Why this exists: the realism pass has to be judged on the FINISHED preview
 * (base x fabric under multiply, then the screen sheen), not on the base asset.
 * A base that looks nicely folded can still render flat once a busy print is
 * multiplied over it, and vice versa. Iterating that through a browser costs a
 * dev server plus a screenshot per attempt; this reproduces the exact same
 * pixels from the assets on disk in ~1s.
 *
 * Fidelity notes — everything here mirrors _shared/zone-overlay.tsx:
 *   - each zone is `backgroundColor` + tiled `backgroundImage`, masked by the
 *     zone alpha, composited with `mix-blend-mode: multiply` and the mask alpha
 *     as the layer alpha (so feathered zone borders blend, as in the browser)
 *   - `backgroundSize: 42%` is 42% of the PHOTO WIDTH, and the quarter turns
 *     tile in a box with width/height swapped and rescale by `ratio`, so the
 *     on-screen tile stays the same size in every orientation (BIL-2492)
 *   - the sheen is `mix-blend-mode: screen`, applied after all zones
 *   - the label (hose-kurz only) is drawn last in normal blend mode
 *
 * Usage:
 *   node scripts/bil2509-composite.mjs --konfig hose-kurz \
 *     --paint hose=stoff-04 --paint bund=mustard --paint buendchen=mustard \
 *     --rot 90 --out .tmp/bil2509/before.png
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

/** Zone order must match the *-photo.tsx overlay order. */
export const KONFIGS = {
  hose: { dir: "hose-foto", w: 900, h: 1006, zones: ["bund", "hose", "buendchen"], sheen: true },
  "hose-kurz": { dir: "hose-kurz-foto", w: 900, h: 750, zones: ["bund", "hose", "buendchen"], sheen: true, label: true },
  turban: { dir: "turban-foto", w: 900, h: 796, zones: ["turban", "schleife"], sheen: false },
  muetze: { dir: "muetze-foto", w: 900, h: 880, zones: ["muetze", "futter"], sheen: true },
  dreieckstuch: { dir: "dreieckstuch-foto", w: 900, h: 482, zones: ["tuch"], sheen: false },
  body: { dir: "body-foto", w: 900, h: 737, zones: ["hauptteil", "halsbund", "aermelbund"], sheen: false },
};

/** Mask file names differ from the param name for the two Bündchen zones. */
const MASK_FILE = { buendchen: "buendchen", hauptteil: "hauptteil", halsbund: "halsbund", aermelbund: "aermelbund" };

const UNI = {
  cream: "#FAF7F2", sand: "#E8DDC8", taupe: "#B5A48A", "powder-pink": "#E8C2C2",
  terracotta: "#C4704A", rust: "#7A3318", mustard: "#D4A24C", sage: "#A8C5AB",
  forest: "#3F6444", sky: "#A8C8D8", petrol: "#5BA8AE", navy: "#2D3E50",
};
const TILE_PERCENT = 42;

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Average colour of a fabric swatch — the browser's `paint.hex` fallback. */
async function swatchHex(id) {
  const { dominant } = await sharp(`public/stoffe/${id}.webp`).stats();
  return [dominant.r, dominant.g, dominant.b];
}

/**
 * Build the tiled fabric layer at photo resolution, honouring the quarter turn
 * exactly the way the browser's rotated tiling DIV does.
 */
async function buildTileLayer(textureId, rotation, W, H) {
  const ratio = W / H;
  const quarter = rotation === 90 || rotation === 270;
  // The tiling box: same size as the photo for 0/180, width/height swapped for
  // the quarter turns (so the rotated result still covers the photo).
  const boxW = quarter ? Math.round(W / ratio) : W;
  const boxH = quarter ? Math.round(H * ratio) : H;
  // `backgroundSize` is a percentage of the tiling box width.
  const tilePx = Math.max(2, Math.round((quarter ? TILE_PERCENT * ratio : TILE_PERCENT) / 100 * boxW));

  const tile = await sharp(`public/stoffe/${textureId}.webp`)
    .resize({ width: tilePx, height: tilePx, fit: "fill" })
    .removeAlpha()
    .toBuffer();

  // `background-position: center` — the tile grid is centred on the box.
  const cols = Math.ceil(boxW / tilePx) + 2;
  const rows = Math.ceil(boxH / tilePx) + 2;
  const offX = Math.round((boxW - cols * tilePx) / 2);
  const offY = Math.round((boxH - rows * tilePx) / 2);
  const composites = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      composites.push({ input: tile, left: offX + c * tilePx, top: offY + r * tilePx });
    }
  }
  let layer = sharp({
    create: { width: boxW, height: boxH, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite(composites)
    .png();

  if (rotation !== 0) {
    layer = sharp(await layer.toBuffer()).rotate(rotation).png();
  }
  // After the turn the layer is boxH x boxW; centre-crop it back to the photo.
  const buf = await layer.toBuffer();
  const meta = await sharp(buf).metadata();
  // `removeAlpha()` before `raw()` is load-bearing: without it sharp can hand
  // back 4 channels, and reading that buffer as 3 shears the tile into a fine
  // diagonal grid in a wrong hue — which looks like a plausible fabric, not
  // like a bug. Assert the length rather than trusting the pipeline.
  const { data, info } = await sharp(buf)
    .extract({
      left: Math.max(0, Math.round((meta.width - W) / 2)),
      top: Math.max(0, Math.round((meta.height - H) / 2)),
      width: Math.min(W, meta.width),
      height: Math.min(H, meta.height),
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 3 || data.length !== W * H * 3) {
    throw new Error(`tile layer came back ${info.channels}ch / ${data.length}b, expected 3ch / ${W * H * 3}b`);
  }
  return data;
}

/**
 * @param {string} konfigId
 * @param {Record<string,string>} paints  zone param -> uni id or fabric id
 * @param {number} rotation
 * @returns {Promise<{buf: Buffer, W: number, H: number}>} RGB composite on white
 */
export async function composite(konfigId, paints, rotation = 0, assetDir = null) {
  const k = KONFIGS[konfigId];
  if (!k) throw new Error(`unknown konfigurator ${konfigId}`);
  // `assetDir` lets the evidence sheet render a saved copy of the SHIPPED assets
  // without ever moving anything inside public/. The first version swapped the
  // live directory in and out around each render; on Windows sharp still held
  // handles on the webp files, the restore half-failed, and it left the live
  // hose-kurz folder missing three of its six assets.
  const dir = assetDir ?? path.join("public/konfigurator", k.dir);

  const load = async (file) => {
    const { data, info } = await sharp(path.join(dir, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, W: info.width, H: info.height };
  };
  const base = await load("base.webp");
  const { W, H } = base;
  const N = W * H;
  if (W !== k.w || H !== k.h) {
    throw new Error(`${konfigId}: base is ${W}x${H} but registry says ${k.w}x${k.h}`);
  }

  // Start on white — the Konfigurator panel background.
  const out = Buffer.alloc(N * 3, 255);
  for (let p = 0; p < N; p++) {
    const a = base.data[p * 4 + 3] / 255;
    for (let ch = 0; ch < 3; ch++) {
      out[p * 3 + ch] = Math.round(255 * (1 - a) + base.data[p * 4 + ch] * a);
    }
  }

  for (const zone of k.zones) {
    const id = paints[zone];
    if (!id) continue;
    const mask = await load(`mask-${MASK_FILE[zone] ?? zone}.webp`);
    const isFabric = id.startsWith("stoff-");
    const flat = isFabric ? await swatchHex(id) : hexToRgb(UNI[id] ?? UNI.cream);
    const tile = isFabric ? await buildTileLayer(id, rotation, W, H) : null;

    for (let p = 0; p < N; p++) {
      const a = mask.data[p * 4 + 3] / 255;
      if (a <= 0) continue;
      for (let ch = 0; ch < 3; ch++) {
        const src = tile ? tile[p * 3 + ch] : flat[ch];
        const mul = (out[p * 3 + ch] * src) / 255;
        out[p * 3 + ch] = Math.round(out[p * 3 + ch] * (1 - a) + mul * a);
      }
    }
  }

  if (k.sheen) {
    const hi = await load("highlight.webp");
    for (let p = 0; p < N; p++) {
      const a = hi.data[p * 4 + 3] / 255;
      if (a <= 0) continue;
      for (let ch = 0; ch < 3; ch++) {
        const scr = 255 - ((255 - out[p * 3 + ch]) * (255 - hi.data[p * 4 + ch])) / 255;
        out[p * 3 + ch] = Math.round(out[p * 3 + ch] * (1 - a) + scr * a);
      }
    }
  }

  if (k.label) {
    const lb = await load("label.webp");
    for (let p = 0; p < N; p++) {
      const a = lb.data[p * 4 + 3] / 255;
      if (a <= 0) continue;
      for (let ch = 0; ch < 3; ch++) {
        out[p * 3 + ch] = Math.round(out[p * 3 + ch] * (1 - a) + lb.data[p * 4 + ch] * a);
      }
    }
  }

  return { buf: out, W, H };
}

if (process.argv[1]?.endsWith("bil2509-composite.mjs")) {
  const argv = process.argv.slice(2);
  const arg = (name, dflt) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : dflt;
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
  const outPath = arg("out", `.tmp/bil2509/${konfigId}.png`);
  await mkdir(path.dirname(outPath), { recursive: true });
  const { buf, W, H } = await composite(konfigId, paints, rot);
  await sharp(buf, { raw: { width: W, height: H, channels: 3 } }).png().toFile(outPath);
  console.log("wrote", outPath, W, "x", H);
}
