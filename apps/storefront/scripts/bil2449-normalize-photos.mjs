/**
 * BIL-2449 — Normalize all 41 raw WhatsApp product photos so the shop catalog
 * reads as one system: uniform background, brightness, aspect ratio, and (via
 * a per-photo `mirror` flag) uniform orientation per category.
 *
 * Input:  ../../../incoming-assets/neue-kleider-2026-08-01/*.jpeg  (1200x1600 flat-lay on grey table)
 * Output: ../../../incoming-assets/neue-kleider-2026-08-01-normalized/*.jpg (1500x1500 on warm cream)
 * Plus:   contact-sheet.jpg (7-col grid of thumbnails for orientation review)
 *
 * Pipeline per photo:
 *   1. EXIF auto-orient (no-op on this batch but future-safe)
 *   2. Border flood-fill: mark grey/white background pixels reachable from edges
 *   3. Crop tightly to product bbox + 6% padding
 *   4. Auto white-balance via linear stretch on non-bg pixels
 *   5. Composite over warm cream (#F7EFE3)
 *   6. Optional horizontal flip (mirror) per manifest for orientation unification
 *   7. Resize to 1500x1500 with contain + cream padding
 *
 * Usage:
 *   cd apps/storefront && node scripts/bil2449-normalize-photos.mjs
 *   cd apps/storefront && node scripts/bil2449-normalize-photos.mjs --only=1,7,29
 *   cd apps/storefront && node scripts/bil2449-normalize-photos.mjs --sheet-only
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const SRC_DIR = path.resolve(REPO_ROOT, "..", "incoming-assets", "neue-kleider-2026-08-01");
const OUT_DIR = path.resolve(REPO_ROOT, "..", "incoming-assets", "neue-kleider-2026-08-01-normalized");
const MANIFEST_PATH = path.join(HERE, "bil2449-mirror-manifest.json");

const CREAM = { r: 247, g: 239, b: 227 }; // #F7EFE3 — same warm cream as BIL-1 storefront tokens
const OUT_SIZE = 1500;
const PADDING_PCT = 0.06;

const argv = process.argv.slice(2);
const onlyArg = argv.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.slice(7).split(",").map((n) => parseInt(n, 10)) : null;
const sheetOnly = argv.includes("--sheet-only");

fs.mkdirSync(OUT_DIR, { recursive: true });

const mirrorManifest = fs.existsSync(MANIFEST_PATH)
  ? JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"))
  : { _description: "Per-photo transforms for orientation unification. Photo indexes are 1-based, matching apps/backend/scripts/bil2432/products.json.", mirror: {}, rotate: {} };
mirrorManifest.mirror = mirrorManifest.mirror || {};
mirrorManifest.rotate = mirrorManifest.rotate || {};

const files = fs.readdirSync(SRC_DIR).filter((f) => /\.jpe?g$/i.test(f)).sort();
console.log(`[bil2449] found ${files.length} source photos`);

async function normalizeOne(inPath, outPath, mirror, rotateDeg) {
  // Approach:
  // 1. Auto-orient (EXIF) via .rotate()
  // 2. sharp.trim() — remove uniform grey border by matching the top-left pixel
  //    within a tolerance. Safer than flood-fill because it only crops from the
  //    edges and never touches interior pixels (so white fabric prints stay intact).
  // 3. Auto-levels via percentile stretch — read a downsampled version, find p02/p98
  //    luminance and lift so darks reach 15 and highlights reach 240.
  // 4. Optional horizontal flip for orientation unification.
  // 5. Resize to fit OUT_SIZE with 8% inner margin, then centre on a cream canvas.
  //    The cream border is what unifies the catalog visually even if the immediate
  //    fabric backdrop varies slightly in tone.

  const oriented = sharp(inPath).rotate();
  const trimmed = await oriented.trim({ threshold: 20 }).toBuffer().catch(async () => {
    // Fall back to the raw oriented image if trim can't determine a border.
    return oriented.toBuffer();
  });

  // Sample down for stats.
  const stat = sharp(trimmed);
  const meta = await stat.metadata();
  const sample = await sharp(trimmed).resize(200, 200, { fit: "inside" }).raw().toBuffer();
  const lums = new Array(sample.length / 3);
  for (let p = 0; p < sample.length / 3; p++) {
    const i = p * 3;
    lums[p] = 0.2126 * sample[i] + 0.7152 * sample[i + 1] + 0.0722 * sample[i + 2];
  }
  lums.sort((a, b) => a - b);
  const p02 = lums[Math.floor(lums.length * 0.02)] || 20;
  const p98 = lums[Math.floor(lums.length * 0.98)] || 230;
  const targetLow = 15;
  const targetHigh = 240;
  const gain = Math.min(1.30, Math.max(0.9, (targetHigh - targetLow) / Math.max(40, p98 - p02)));
  const bias = targetLow - gain * p02;

  let pipe = sharp(trimmed).linear(gain, bias).modulate({ saturation: 1.05 });
  if (rotateDeg) pipe = pipe.rotate(rotateDeg, { background: { r: CREAM.r, g: CREAM.g, b: CREAM.b } });
  if (mirror) pipe = pipe.flop();

  const productBuf = await pipe.toBuffer();
  const pMeta = await sharp(productBuf).metadata();

  // Fit into OUT_SIZE with 8% inner margin.
  const scale = Math.min(OUT_SIZE / pMeta.width, OUT_SIZE / pMeta.height) * 0.92;
  const targetW = Math.round(pMeta.width * scale);
  const targetH = Math.round(pMeta.height * scale);
  const resized = await sharp(productBuf)
    .resize(targetW, targetH, { fit: "fill", kernel: "lanczos3" })
    .toBuffer();

  const canvas = await sharp({
    create: {
      width: OUT_SIZE,
      height: OUT_SIZE,
      channels: 3,
      background: { r: CREAM.r, g: CREAM.g, b: CREAM.b },
    },
  })
    .composite([{ input: resized, gravity: "center" }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  fs.writeFileSync(outPath, canvas);
  return {
    gain,
    bias,
    cropSize: `${meta.width}x${meta.height}`,
    srcSize: `${(await sharp(inPath).metadata()).width}x${(await sharp(inPath).metadata()).height}`,
  };
}

async function buildContactSheet() {
  const outFiles = fs.readdirSync(OUT_DIR).filter((f) => /^photo-\d+\.jpg$/.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
  if (outFiles.length === 0) { console.log("[bil2449] no normalized outputs yet — skipping sheet"); return; }
  const cols = 7;
  const rows = Math.ceil(outFiles.length / cols);
  const thumb = 240;
  const label = 26;
  const cellH = thumb + label;
  const sheetW = cols * thumb;
  const sheetH = rows * cellH;

  const thumbs = await Promise.all(outFiles.map(async (f, i) => {
    const b = await sharp(path.join(OUT_DIR, f)).resize(thumb, thumb, { fit: "cover" }).toBuffer();
    return { buf: b, idx: i };
  }));

  // Compose thumbs, then overlay labels as SVG.
  const composites = [];
  const svgLabels = [];
  for (let i = 0; i < thumbs.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    composites.push({ input: thumbs[i].buf, left: col * thumb, top: row * cellH });
    const cx = col * thumb + thumb / 2;
    const ty = row * cellH + thumb + 18;
    const n = i + 1;
    const name = outFiles[i].replace("photo-", "").replace(".jpg", "");
    svgLabels.push(`<text x="${cx}" y="${ty}" font-family="Inter, sans-serif" font-size="14" fill="#3d3025" text-anchor="middle">#${n} (${name})</text>`);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetW}" height="${sheetH}">${svgLabels.join("")}</svg>`;
  const sheet = await sharp({
    create: { width: sheetW, height: sheetH, channels: 3, background: { r: 247, g: 239, b: 227 } },
  })
    .composite([...composites, { input: Buffer.from(svg), left: 0, top: 0 }])
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  fs.writeFileSync(path.join(OUT_DIR, "contact-sheet.jpg"), sheet);
  console.log(`[bil2449] contact sheet -> ${path.join(OUT_DIR, "contact-sheet.jpg")}`);
}

if (!sheetOnly) {
  for (let i = 0; i < files.length; i++) {
    const num = i + 1;
    if (only && !only.includes(num)) continue;
    const inPath = path.join(SRC_DIR, files[i]);
    const outPath = path.join(OUT_DIR, `photo-${String(num).padStart(2, "0")}.jpg`);
    const mirror = !!mirrorManifest.mirror[String(num)];
    const rotateDeg = Number(mirrorManifest.rotate[String(num)] || 0);
    process.stdout.write(`[bil2449] #${num}/${files.length} ${files[i].slice(-25)} `);
    try {
      const info = await normalizeOne(inPath, outPath, mirror, rotateDeg);
      console.log(`ok (crop ${info.cropSize}, gain=${info.gain.toFixed(2)}, mirror=${mirror ? "y" : "n"}, rot=${rotateDeg})`);
    } catch (e) {
      console.log(`FAIL: ${e.message}`);
    }
  }
}
await buildContactSheet();
console.log(`[bil2449] output dir: ${OUT_DIR}`);
