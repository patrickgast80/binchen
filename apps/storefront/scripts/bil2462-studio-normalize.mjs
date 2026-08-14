#!/usr/bin/env node
// BIL-2462: studio-look normalizer, v2.
//
// The BIL-2455 normalizer (bil2455-normalize-product-bg.mjs) only cropped a
// decorative cream frame and trimmed near-uniform outer rows/cols. That left
// the ORIGINAL backdrop (dark table, vinyl, fabric) visible everywhere it sat
// inside the garment's bounding box — which the BIL-2462 grader caught as
// "dark-backdrop" / "corner-drift" on 24 of 34 live products.
//
// This version actually SEGMENTS foreground (garment) from background and
// repaints every background pixel with the studio-grey target
// (docs/design/STUDIO-LOOK.md: RGB 200/200/198), instead of just cropping
// around it. Segmentation reuses the flood-fill approach already proven in
// the Foto-Konfigurator asset builders (bil2417-build-assets.mjs): walk out
// from the border, and instead of comparing every candidate pixel to one
// fixed seed colour (which fails on backdrops with a vignette/shadow
// gradient), compare it to the ALREADY-CLASSIFIED neighbour that queued it.
// That "chained" tolerance follows gradients smoothly and still stops hard
// at the garment edge, where the colour jump is large.
//
// Usage:
//   node bil2462-studio-normalize.mjs --in file.jpg --out file.jpg
//   node bil2462-studio-normalize.mjs --in dir/ --out dir/   (batch, *.jpg|*.jpeg|*.png)
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const FRAME_TARGET = { r: 238, g: 233, b: 217 };
const FRAME_TOLERANCE = 22;
const CANVAS_BG = { r: 200, g: 200, b: 198 };
const CANVAS_SIZE = 1200;
const PAD_RATIO = 0.06;
const CHAIN_DELTA = 24; // per-channel tolerance vs. the neighbour that queued this pixel
const SEED_DELTA = 26; // per-channel tolerance vs. the sampled border colour (first ring only)
const MIN_COMPONENT_RATIO = 0.004; // keep any foreground island >= 0.4% of canvas (multi-part flatlays)

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, a) => {
  if (cur.startsWith("--")) acc.push([cur.slice(2), a[i + 1]]);
  return acc;
}, []));
if (!args.in || !args.out) { console.error("--in and --out required"); process.exit(1); }

function nearColour(r, g, b, target, tolerance) {
  return Math.abs(r - target.r) <= tolerance
    && Math.abs(g - target.g) <= tolerance
    && Math.abs(b - target.b) <= tolerance;
}

// Finds the bounding box of "real content" by trimming rows/cols from every
// edge that are close to `target` on average — used both for the decorative
// cream frame (older batches) and, in a second pass, for the flat studio-grey
// CANVAS_BG padding a prior normalizer run (BIL-2455) already composited
// around the original photo. Without that second pass, this script's own
// border-seeded flood fill only ever finds the pre-existing grey padding
// (a big color jump separates it from whatever backdrop the original photo
// actually has) and never reaches the real problem pixels — see BIL-2462
// apply-run notes.
async function findContentCrop(pngBuf, target, tolerance) {
  const { data, info } = await sharp(pngBuf).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const pixelAt = (x, y) => {
    const i = (y * w + x) * c;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
  };
  const rowAvg = (y) => {
    let R = 0, G = 0, B = 0;
    for (let x = 0; x < w; x++) { const p = pixelAt(x, y); R += p.r; G += p.g; B += p.b; }
    return { r: R / w, g: G / w, b: B / w };
  };
  const colAvg = (x) => {
    let R = 0, G = 0, B = 0;
    for (let y = 0; y < h; y++) { const p = pixelAt(x, y); R += p.r; G += p.g; B += p.b; }
    return { r: R / h, g: G / h, b: B / h };
  };
  const near = (p) => nearColour(p.r, p.g, p.b, target, tolerance);
  let top = 0; while (top < h / 2 && near(rowAvg(top))) top++;
  let bottom = h - 1; while (bottom > h / 2 && near(rowAvg(bottom))) bottom--;
  let left = 0; while (left < w / 2 && near(colAvg(left))) left++;
  let right = w - 1; while (right > w / 2 && near(colAvg(right))) right--;
  return { left, top, width: right - left + 1, height: bottom - top + 1, orig: { w, h } };
}

const findFrameCrop = (pngBuf) => findContentCrop(pngBuf, FRAME_TARGET, FRAME_TOLERANCE);
const findPaddingCrop = (pngBuf) => findContentCrop(pngBuf, CANVAS_BG, 4);

/**
 * Chained flood fill from the border: a pixel joins the background if it is
 * 4-connected to one already in the background and its colour is close to
 * THAT NEIGHBOUR's colour (not a single global seed). Falls back to a wider
 * SEED_DELTA check against the sampled border colour for the very first ring
 * so a slightly noisy border still seeds correctly.
 */
function segmentBackground(data, w, h, channels) {
  const N = w * h;
  let brSum = 0, bgSum = 0, bbSum = 0, n = 0;
  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) {
      const i = (y * w + x) * channels;
      brSum += data[i]; bgSum += data[i + 1]; bbSum += data[i + 2]; n++;
    }
  }
  for (let y = 0; y < h; y++) {
    for (const x of [0, w - 1]) {
      const i = (y * w + x) * channels;
      brSum += data[i]; bgSum += data[i + 1]; bbSum += data[i + 2]; n++;
    }
  }
  const seed = { r: brSum / n, g: bgSum / n, b: bbSum / n };

  // Safety gate 1: only trust this seed if it actually LOOKS like a studio
  // backdrop (light, low-chroma — grey/cream/off-white). Product photos that
  // are shot close-up have the garment itself dominating the border ring
  // (e.g. a dark navy-print Mütze filling the frame): averaging that ring
  // yields a "seed" that IS the garment colour, and a naive flood fill from
  // it then repaints the real fabric as background — deleting product detail.
  // Refuse the segmentation outright rather than risk that.
  const chroma = Math.max(seed.r, seed.g, seed.b) - Math.min(seed.r, seed.g, seed.b);
  const brightness = (seed.r + seed.g + seed.b) / 3;
  if (chroma > 26 || brightness < 150) {
    return { isBg: null, reason: `implausible backdrop seed rgb(${seed.r.toFixed(0)},${seed.g.toFixed(0)},${seed.b.toFixed(0)})` };
  }

  const isBg = new Uint8Array(N);
  const queue = new Int32Array(N);
  let qh = 0, qt = 0;
  const colourAt = (p) => {
    const i = p * channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const closeTo = (p, ref, delta) => {
    const [r, g, b] = colourAt(p);
    return Math.abs(r - ref[0]) <= delta && Math.abs(g - ref[1]) <= delta && Math.abs(b - ref[2]) <= delta;
  };
  const tryPush = (p, ref) => {
    if (isBg[p]) return;
    if (!closeTo(p, ref, CHAIN_DELTA) && !closeTo(p, [seed.r, seed.g, seed.b], SEED_DELTA)) return;
    isBg[p] = 1;
    queue[qt++] = p;
  };
  // Seed the border ring directly against the global seed colour, and track
  // what fraction of the ring actually matches it.
  let ringN = 0, ringMatch = 0;
  const seedRing = (p) => {
    ringN++;
    if (closeTo(p, [seed.r, seed.g, seed.b], SEED_DELTA)) { isBg[p] = 1; queue[qt++] = p; ringMatch++; }
  };
  for (let x = 0; x < w; x++) { seedRing(x); seedRing((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seedRing(y * w); seedRing(y * w + w - 1); }

  // Safety gate 2: the border ring must be MOSTLY the seed colour. A ring
  // that is only half backdrop (garment silhouette touching several edges)
  // means the seed is unreliable even though it happened to look plausible.
  if (ringMatch / ringN < 0.7) {
    return { isBg: null, reason: `border ring only ${Math.round((ringMatch / ringN) * 100)}% uniform` };
  }

  while (qh < qt) {
    const p = queue[qh++];
    const ref = colourAt(p);
    const x = p % w, y = (p / w) | 0;
    if (x > 0) tryPush(p - 1, ref);
    if (x < w - 1) tryPush(p + 1, ref);
    if (y > 0) tryPush(p - w, ref);
    if (y < h - 1) tryPush(p + w, ref);
  }
  return { isBg, reason: null };
}

/** Drop foreground islands smaller than minSize (JPEG speckle at the studio edge). */
function stripSpeckle(isBg, w, h, minSize) {
  const N = w * h;
  const label = new Int32Array(N);
  const q = new Int32Array(N);
  const sizes = [0];
  let next = 0;
  for (let seed = 0; seed < N; seed++) {
    if (isBg[seed] || label[seed]) continue;
    next++;
    let size = 0, h2 = 0, t = 0;
    label[seed] = next;
    q[t++] = seed;
    while (h2 < t) {
      const p = q[h2++];
      size++;
      const x = p % w, y = (p / w) | 0;
      if (x > 0 && !isBg[p - 1] && !label[p - 1]) { label[p - 1] = next; q[t++] = p - 1; }
      if (x < w - 1 && !isBg[p + 1] && !label[p + 1]) { label[p + 1] = next; q[t++] = p + 1; }
      if (y > 0 && !isBg[p - w] && !label[p - w]) { label[p - w] = next; q[t++] = p - w; }
      if (y < h - 1 && !isBg[p + w] && !label[p + w]) { label[p + w] = next; q[t++] = p + w; }
    }
    sizes[next] = size;
  }
  let stripped = 0;
  for (let p = 0; p < N; p++) {
    if (!isBg[p] && sizes[label[p]] < minSize) { isBg[p] = 1; stripped++; }
  }
  return { components: next, stripped };
}

/** 1px box-blur feather of the fg/bg boundary so the repaint has no hard jaggy edge. */
function featherEdges(isBg, w, h) {
  const N = w * h;
  const alpha = new Float32Array(N);
  for (let p = 0; p < N; p++) alpha[p] = isBg[p] ? 0 : 255;
  const tmp = new Float32Array(N);
  const R = 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, cnt = 0;
      for (let dy = -R; dy <= R; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= w) continue;
          sum += alpha[yy * w + xx]; cnt++;
        }
      }
      tmp[y * w + x] = sum / cnt;
    }
  }
  return tmp; // 0..255 foreground weight
}

async function normalizeOne(inFile, outFile) {
  // 1) bake EXIF orientation
  let pngBuf = await sharp(inFile).rotate().png().toBuffer();

  // 2) crop decorative cream frame if present (older photo batches)
  const crop = await findFrameCrop(pngBuf);
  if (crop.width < crop.orig.w * 0.98 || crop.height < crop.orig.h * 0.98) {
    pngBuf = await sharp(pngBuf).extract({
      left: crop.left, top: crop.top, width: crop.width, height: crop.height,
    }).png().toBuffer();
  }

  // 2b) strip a prior run's studio-grey CANVAS_BG padding, if present, so
  // segmentation below sees the actual original photo (and its real
  // backdrop) instead of stalling at the padding's edge — see findPaddingCrop.
  const padCrop = await findPaddingCrop(pngBuf);
  if (padCrop.width < padCrop.orig.w * 0.98 || padCrop.height < padCrop.orig.h * 0.98) {
    pngBuf = await sharp(pngBuf).extract({
      left: padCrop.left, top: padCrop.top, width: padCrop.width, height: padCrop.height,
    }).png().toBuffer();
  }

  // 3) legacy safe bbox (BIL-2455): trim near-uniform outer rows/cols only.
  // Used both as the fallback path AND as a sanity cross-check on segmentation.
  const legacyTrimmed = await sharp(pngBuf).trim({ threshold: 18 }).png().toBuffer();
  const legacyMeta = await sharp(legacyTrimmed).metadata();
  const legacyArea = legacyMeta.width * legacyMeta.height;

  // 4) segment background vs. garment, repaint background as studio grey —
  // but only if it passes the plausibility gates in segmentBackground() AND
  // doesn't shrink the garment far below what the legacy trim already found
  // (a sign the flood fill ate into real fabric rather than backdrop).
  const { data, info } = await sharp(pngBuf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  const seg = segmentBackground(data, w, h, channels);

  let mode, outBuf, note;
  if (seg.isBg) {
    const { components, stripped } = stripSpeckle(seg.isBg, w, h, Math.round(w * h * MIN_COMPONENT_RATIO));
    let cropL = w, cropR = 0, cropT = h, cropB = 0;
    for (let p = 0; p < w * h; p++) {
      if (seg.isBg[p]) continue;
      const x = p % w, y = (p / w) | 0;
      if (x < cropL) cropL = x;
      if (x > cropR) cropR = x;
      if (y < cropT) cropT = y;
      if (y > cropB) cropB = y;
    }
    const segArea = cropR >= cropL && cropB >= cropT ? (cropR - cropL + 1) * (cropB - cropT + 1) : 0;
    let nonBgCount = 0;
    for (let p = 0; p < w * h; p++) if (!seg.isBg[p]) nonBgCount++;
    const bgCount = w * h - nonBgCount;
    // Bbox area alone is fooled by a shredded result (small print motifs
    // scattered inside a bbox that still spans the whole garment): also
    // require enough SOLID fill inside that bbox, not just wide spread.
    //
    // The opposite failure also needs catching: a backdrop with a strong
    // vignette/shadow gradient can make the CHAIN_DELTA hop too small to
    // cross it, so the flood fill stalls a few pixels past the border. That
    // still "passes" the two checks above (nothing looks eaten, because
    // almost nothing was classified as background at all) but silently
    // produces an unchanged image while claiming success.
    if (segArea < legacyArea * 0.7 || nonBgCount < legacyArea * 0.45 || bgCount < w * h * 0.08) {
      mode = "fallback";
      note = bgCount < w * h * 0.08
        ? `flood fill stalled — only ${(bgCount / (w * h) * 100).toFixed(1)}% classified as background`
        : `segmented bbox ${segArea}px (legacy ${legacyArea}px), filled ${nonBgCount}px — looked like fabric was eaten`;
    } else {
      const featherW = featherEdges(seg.isBg, w, h);
      const painted = Buffer.alloc(w * h * 3);
      for (let p = 0; p < w * h; p++) {
        const i = p * channels, o = p * 3;
        const fw = featherW[p] / 255; // 1 = fully garment, 0 = fully background
        painted[o] = Math.round(data[i] * fw + CANVAS_BG.r * (1 - fw));
        painted[o + 1] = Math.round(data[i + 1] * fw + CANVAS_BG.g * (1 - fw));
        painted[o + 2] = Math.round(data[i + 2] * fw + CANVAS_BG.b * (1 - fw));
      }
      const long = Math.max(cropR - cropL + 1, cropB - cropT + 1);
      const pad = Math.round(long * PAD_RATIO);
      const extractL = Math.max(0, cropL - pad);
      const extractT = Math.max(0, cropT - pad);
      const extractR = Math.min(w - 1, cropR + pad);
      const extractB = Math.min(h - 1, cropB + pad);
      const extractW = extractR - extractL + 1;
      const extractH = extractB - extractT + 1;
      outBuf = await sharp(painted, { raw: { width: w, height: h, channels: 3 } })
        .extract({ left: extractL, top: extractT, width: extractW, height: extractH })
        .png().toBuffer();
      mode = "segmented";
      note = `fg components ${components}, speckle-stripped ${stripped}px islands`;
    }
  } else {
    mode = "fallback";
    note = seg.reason;
  }

  if (mode === "fallback") {
    // No repaint — crop only, exactly like the proven BIL-2455 normalizer,
    // so an image we can't safely segment is still centred/resized but never
    // has real garment pixels deleted or invented.
    outBuf = legacyTrimmed;
  }

  const outMeta = await sharp(outBuf).metadata();
  // Segmented crops already have PAD_RATIO baked into the extract box (grey-
  // painted). The fallback crop is a tight trim, so add the same margin here
  // via the scale denominator instead.
  const longSide = Math.max(outMeta.width, outMeta.height);
  const canvasInner = mode === "fallback" ? Math.round(longSide * (1 + 2 * PAD_RATIO)) : longSide;
  const scale = CANVAS_SIZE / canvasInner;
  const targetW = Math.round(outMeta.width * scale);
  const targetH = Math.round(outMeta.height * scale);
  const resized = await sharp(outBuf).resize({ width: targetW, height: targetH, fit: "inside" }).toBuffer();

  await sharp({
    create: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 3, background: CANVAS_BG },
  }).composite([{ input: resized, gravity: "center" }])
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4" })
    .toFile(outFile);

  console.log(`normalized: ${path.basename(inFile)} -> ${path.basename(outFile)} [${mode}] ${note}`);
}

const inStat = fs.statSync(args.in);
if (inStat.isDirectory()) {
  fs.mkdirSync(args.out, { recursive: true });
  const files = fs.readdirSync(args.in).filter((f) => /\.(jpe?g|png)$/i.test(f));
  for (const f of files) {
    try { await normalizeOne(path.join(args.in, f), path.join(args.out, f.replace(/\.png$/i, ".jpg"))); }
    catch (e) { console.error(`FAIL ${f}: ${e.stack || e.message}`); }
  }
} else {
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  await normalizeOne(args.in, args.out);
}
