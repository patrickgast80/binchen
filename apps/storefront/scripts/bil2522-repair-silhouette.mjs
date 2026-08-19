/**
 * BIL-2522 — repair chewed silhouettes on the Konfigurator bases.
 *
 * Found while putting the renders next to the pinned source photos (board
 * direction 2026-08-19 11:54Z). The Dreieckstuch preview has white notches
 * bitten out of its hem and white *motif-shaped* bays punched into the cloth
 * near the edge: the asset builder's background flood-fill keys on the studio
 * grey, and wherever a light "Kleiner Zoo" motif touched the garment boundary
 * the fill leaked inwards along it. The Turban has the same defect as a
 * fringed, ragged outline.
 *
 * This is not a relief problem — it is in the SHIPPED preview too — but it is
 * the loudest "this is a cut-out, not a photo" tell that survives on those two,
 * and the ticket asks for exactly that ("Silhouettenkante nicht ausgestanzt").
 *
 * What it does, per Konfigurator:
 *
 *   1. Morphological CLOSING of the garment alpha at `radius` — seals the
 *      inlets bitten INTO the garment. Genuine concavities (the notch between
 *      the Dreieckstuch's wings) are far wider than the radius and are left
 *      alone; the area caps below make a bad radius fail loudly.
 *   1b. BOUNDARY SMOOTHING at `smooth`. A closing cannot touch a step sticking
 *      OUT, and the real defect on both outlines is a ~10px staircase, so the
 *      coverage is blurred and re-thresholded at 0.5 — symmetric, so bumps and
 *      notches go together. This is the step that can remove coverage, hence
 *      its own cap.
 *   2. Inpaints the newly covered pixels by diffusion from the surrounding
 *      garment, so the repaired sliver carries the neighbouring cloth's
 *      luminance instead of a flat patch. The relief map is rebuilt from this,
 *      so the fold band and the contact-shadow rim follow the repaired outline.
 *   3. Applies the same repair to the zone masks, EXCEPT where a hole is
 *      deliberate: the hose-kurz Schildchen and the zone-within-a-zone cut-outs
 *      (Turban schleife, Muetze futter) are interior components and are
 *      re-punched afterwards, so an exclusion can never be closed over.
 *
 * Near-idempotent, not exactly: closing an already-closed alpha is a no-op, but
 * the boundary smoothing is a curvature flow rather than a projection, so a
 * rerun still nudges ~0.07% of the coverage before settling. `--check` prints
 * that number without writing — if it is ever more than a fraction of a percent
 * the radii are oscillating and something is wrong.
 *
 *   node scripts/bil2522-repair-silhouette.mjs --konfig dreieckstuch
 *   node scripts/bil2522-repair-silhouette.mjs --konfig turban --check
 */
import sharp from "sharp";
import path from "node:path";
import { readFile, rename } from "node:fs/promises";

import { KONFIGS } from "./bil2509-composite.mjs";

/**
 * Encoder settings per asset kind — BIL-2523.
 *
 * This used to write `{ lossless: true }` for everything, which is right for a
 * mask and wrong for a photo. `base.webp` is the Konfigurator's LCP element,
 * and repairing it lossless tripled it: turban 64 kB -> 180 kB, dreieckstuch
 * 29 kB -> 69 kB. On a throttled mobile that alone put the turban LCP at 4.5 s
 * against 2.7 s on the untouched hose route.
 *
 * So a base is written with the SAME `quality: 82, alphaQuality: 90` its
 * builder (bil2444/bil2446-build-*-assets.mjs) uses — the repair should change
 * the pixels, not the format. Measured against the lossless render, that costs
 * a mean 0.73/255 per RGB channel and leaves the alpha channel BIT-IDENTICAL,
 * so the silhouette repair this script exists for survives the encode exactly.
 *
 * Masks stay lossless: they are alpha-only, the relief math thresholds them
 * per pixel, and lossless is actually the SMALLER encode for them
 * (mask-turban 23.4 kB lossy -> 20.0 kB lossless).
 *
 * Re-running the repair on an already-repaired base compounds a lossy
 * generation. That is the same deal the builders already make, and the fix is
 * the same: re-run the builder first, then this.
 */
const BASE_WEBP = { quality: 82, alphaQuality: 90 };
const MASK_WEBP = { lossless: true };

/**
 * Write webp back over its own source.
 *
 * sharp keeps the input file open for the lifetime of the pipeline, so writing
 * straight back to the path it was read from fails on Windows with a bare
 * "unable to open for write". Via a sibling temp file plus a rename, which is
 * also atomic — a crash mid-encode cannot leave a half-written asset behind.
 */
async function writeInPlace(rgba, W, H, file, webpOpts) {
  const tmp = `${file}.tmp`;
  await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .webp(webpOpts)
    .toFile(tmp);
  await rename(tmp, file);
}

/**
 * Per-Konfigurator repair. Only pieces with a measured defect are listed.
 *
 * `radius`  closing radius — seals inlets bitten INTO the garment.
 * `smooth`  boundary smoothing radius — a closing cannot touch a step sticking
 *           OUT, and both of these outlines are staircased at ~10px from the
 *           segmentation. Blurring the coverage and re-thresholding at 0.5
 *           removes bumps and notches alike, which is what actually stops the
 *           edge reading as "cut out with scissors".
 */
export const REPAIR = {
  // Hem notches plus motif-shaped bays; the inlets are a few px wide, the real
  // concavity between the wings is ~200px, so 7 separates them cleanly.
  dreieckstuch: { radius: 7, smooth: 4 },
  // Fringed outline from the de-print pass — shallower inlets, but the worst
  // staircase of the five, so most of the work here is the smoothing.
  turban: { radius: 4, smooth: 6 },
};

/**
 * Backstop: a repair may not grow the garment by more than this share of its
 * area. Blunt on purpose.
 *
 * The first version of this guard normalised the added area by the boundary
 * sweep (perimeter * radius) on the theory that it would separate "sealing
 * local inlets" from "inflating the outline". It does not: both the numerator
 * and the sweep scale with r, so the ratio barely moves — at r=40, which visibly
 * rounds the scarf's corners off, it still reported a healthy 15.7%. A guard
 * that cannot fail is decoration, so it was replaced by the plain area cap,
 * which does fire there (8.6% of the garment).
 *
 * What actually justifies each `radius` is looking at the added region: it must
 * be a thin band along the ragged hem and the motif bays, not a filled-in
 * concavity (`--debug` dumps it in red). This number only catches a radius that
 * did something drastic; 3% is deliberately loose, not fitted to the result —
 * the two repairs land at 1.40% and 0.55%.
 */
const MAX_ADD_PCT = 3;

const idx = (x, y, W) => y * W + x;

/** Chebyshev-ish distance transform over `on` pixels, capped at `max`. */
function dilate(on, W, H, r) {
  const out = new Uint8Array(on.length);
  // Separable: horizontal pass then vertical, using a running window maximum.
  const tmp = new Uint8Array(on.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= W) continue;
        if (on[idx(xx, y, W)]) { v = 1; break; }
      }
      tmp[idx(x, y, W)] = v;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= H) continue;
        if (tmp[idx(x, yy, W)]) { v = 1; break; }
      }
      out[idx(x, y, W)] = v;
    }
  }
  return out;
}

const invert = (a) => {
  const o = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) o[i] = a[i] ? 0 : 1;
  return o;
};

/** close = erode(dilate(x)) — implemented as NOT dilate(NOT dilate(x)). */
function close(on, W, H, r) {
  return invert(dilate(invert(dilate(on, W, H, r)), W, H, r));
}

/**
 * Smooth a binary coverage map by box-blurring it and re-thresholding at 0.5.
 *
 * Unlike a closing this is symmetric: it shaves convex staircase steps as well
 * as filling concave ones, which is the actual shape of the defect on these two
 * outlines. At 0.5 the operation preserves straight edges and large features
 * exactly and only rounds curvature tighter than the radius.
 */
function smoothBinary(on, W, H, r) {
  const N = W * H;
  // Row prefix sums, then column prefix sums over those — the mean of any
  // window is then two subtractions, and the window is clipped at the border
  // so edge pixels are averaged over what actually exists.
  const rows = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    let acc = 0;
    for (let x = 0; x < W; x++) {
      acc += on[idx(x, y, W)];
      rows[idx(x, y, W)] = acc;
    }
  }
  const rowMean = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(W - 1, x + r);
      const sum = rows[idx(x1, y, W)] - (x0 > 0 ? rows[idx(x0 - 1, y, W)] : 0);
      rowMean[idx(x, y, W)] = sum / (x1 - x0 + 1);
    }
  }
  const cols = new Float32Array(N);
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = 0; y < H; y++) {
      acc += rowMean[idx(x, y, W)];
      cols[idx(x, y, W)] = acc;
    }
  }
  const out = new Uint8Array(N);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(H - 1, y + r);
      const sum = cols[idx(x, y1, W)] - (y0 > 0 ? cols[idx(x, y0 - 1, W)] : 0);
      out[idx(x, y, W)] = sum / (y1 - y0 + 1) >= 0.5 ? 1 : 0;
    }
  }
  return out;
}

/** Connected components of `on`, returned as a label map plus sizes. */
function components(on, W, H) {
  const N = W * H;
  const label = new Int32Array(N).fill(-1);
  const sizes = [];
  for (let p = 0; p < N; p++) {
    if (!on[p] || label[p] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    const st = [p];
    label[p] = id;
    while (st.length) {
      const q = st.pop();
      size++;
      const x = q % W;
      const y = (q / W) | 0;
      const nb = [x > 0 ? q - 1 : -1, x < W - 1 ? q + 1 : -1, y > 0 ? q - W : -1, y < H - 1 ? q + W : -1];
      for (const r of nb) if (r >= 0 && on[r] && label[r] < 0) { label[r] = id; st.push(r); }
    }
    sizes.push(size);
  }
  return { label, sizes };
}

/**
 * Interior holes of `on` that are big enough to be deliberate (a Schildchen, a
 * zone cut out of another zone) rather than segmentation noise.
 */
function deliberateHoles(on, W, H, minPx = 400) {
  const { label, sizes } = components(invert(on), W, H);
  const touchesBorder = new Set();
  for (let x = 0; x < W; x++) {
    if (label[idx(x, 0, W)] >= 0) touchesBorder.add(label[idx(x, 0, W)]);
    if (label[idx(x, H - 1, W)] >= 0) touchesBorder.add(label[idx(x, H - 1, W)]);
  }
  for (let y = 0; y < H; y++) {
    if (label[idx(0, y, W)] >= 0) touchesBorder.add(label[idx(0, y, W)]);
    if (label[idx(W - 1, y, W)] >= 0) touchesBorder.add(label[idx(W - 1, y, W)]);
  }
  const keep = new Uint8Array(on.length);
  for (let p = 0; p < on.length; p++) {
    const l = label[p];
    if (l >= 0 && !touchesBorder.has(l) && sizes[l] >= minPx) keep[p] = 1;
  }
  return keep;
}

/**
 * Fill `todo` pixels of an RGB buffer by repeated averaging of already-known
 * neighbours. Cheap, and correct for the few-px-wide slivers this repairs:
 * the sliver ends up carrying the cloth it was bitten out of.
 */
function inpaint(rgba, known, todo, W, H) {
  const have = Uint8Array.from(known);
  let remaining = 0;
  for (let p = 0; p < todo.length; p++) if (todo[p]) remaining++;
  let guard = 0;
  while (remaining > 0 && guard++ < 64) {
    const filled = [];
    for (let p = 0; p < todo.length; p++) {
      if (!todo[p] || have[p]) continue;
      const x = p % W;
      const y = (p / W) | 0;
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const q = idx(xx, yy, W);
          if (!have[q]) continue;
          r += rgba[q * 4]; g += rgba[q * 4 + 1]; b += rgba[q * 4 + 2]; n++;
        }
      }
      if (!n) continue;
      rgba[p * 4] = Math.round(r / n);
      rgba[p * 4 + 1] = Math.round(g / n);
      rgba[p * 4 + 2] = Math.round(b / n);
      filled.push(p);
    }
    if (!filled.length) break;
    for (const p of filled) { have[p] = 1; remaining--; }
  }
  return remaining;
}

/**
 * Decode from a Buffer, never from a path. Handing sharp a filename makes it
 * hold that file open for the life of the pipeline, and this script writes its
 * inputs back — on Windows that surfaces as an EPERM on the rename.
 */
async function loadRGBA(file) {
  const { data, info } = await sharp(await readFile(file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height };
}

export async function repair(konfigId, { check = false, debug = false } = {}) {
  const cfg = REPAIR[konfigId];
  if (!cfg) throw new Error(`no repair configured for ${konfigId}`);
  const k = KONFIGS[konfigId];
  const dir = path.join("public/konfigurator", k.dir);

  const base = await loadRGBA(path.join(dir, "base.webp"));
  const { W, H } = base;
  const on = new Uint8Array(W * H);
  for (let p = 0; p < on.length; p++) on[p] = base.data[p * 4 + 3] >= 128 ? 1 : 0;

  // Seal the inlets first, then smooth: smoothing a boundary that still has
  // deep notches in it would just round the notches instead of removing them.
  const closed = close(on, W, H, cfg.radius);
  const repaired = cfg.smooth ? smoothBinary(closed, W, H, cfg.smooth) : closed;

  let before = 0, added = 0, removed = 0, perimeter = 0;
  const todo = new Uint8Array(W * H);
  for (let p = 0; p < on.length; p++) {
    if (on[p]) before++;
    if (repaired[p] && !on[p]) { todo[p] = 1; added++; }
    if (!repaired[p] && on[p]) removed++;
    // Boundary pixel: inside, with at least one 4-neighbour outside.
    if (on[p]) {
      const x = p % W;
      const y = (p / W) | 0;
      if (
        (x === 0 || !on[p - 1]) || (x === W - 1 || !on[p + 1]) ||
        (y === 0 || !on[p - W]) || (y === H - 1 || !on[p + W])
      ) perimeter++;
    }
  }
  const addPct = (added / before) * 100;
  const removePct = (removed / before) * 100;
  const sweptPct = (added / (perimeter * cfg.radius)) * 100;
  if (addPct > MAX_ADD_PCT) {
    throw new Error(
      `${konfigId}: closing r=${cfg.radius} added ${added}px = ${addPct.toFixed(2)}% of the ` +
      `garment (cap ${MAX_ADD_PCT}%) — that radius is filling real shape, not inlets. ` +
      `Rerun with --debug and look at the red region.`,
    );
  }
  // Smoothing is the only step that can TAKE coverage away, and shaving the
  // garment is worse than a staircase: it would trim real hem off the piece.
  if (removePct > MAX_ADD_PCT) {
    throw new Error(
      `${konfigId}: smoothing r=${cfg.smooth} removed ${removed}px = ${removePct.toFixed(2)}% ` +
      `of the garment (cap ${MAX_ADD_PCT}%) — that is trimming the hem, not a staircase.`,
    );
  }

  if (debug) {
    // The only honest way to judge these radii: see what they moved. Red =
    // gained, blue = shaved off.
    const viz = Buffer.alloc(W * H * 3);
    for (let p = 0; p < on.length; p++) {
      const g = base.data[p * 4];
      const px = todo[p]
        ? [255, 0, 0]
        : on[p] && !repaired[p]
          ? [0, 90, 255]
          : on[p]
            ? [g, g, g]
            : [255, 255, 255];
      viz[p * 3] = px[0]; viz[p * 3 + 1] = px[1]; viz[p * 3 + 2] = px[2];
    }
    await sharp(viz, { raw: { width: W, height: H, channels: 3 } })
      .png()
      .toFile(`.tmp/bil2522/${konfigId}-repair-r${cfg.radius}s${cfg.smooth ?? 0}.png`);
  }

  const left = inpaint(base.data, on, todo, W, H);
  if (left > 0) throw new Error(`${konfigId}: ${left} repaired px had no garment neighbour to inpaint from`);
  for (let p = 0; p < on.length; p++) {
    base.data[p * 4 + 3] = repaired[p] ? 255 : on[p] ? 0 : base.data[p * 4 + 3];
  }

  const files = [];
  if (!check) {
    await writeInPlace(base.data, W, H, path.join(dir, "base.webp"), BASE_WEBP);
    files.push("base.webp");
  }

  // Zone masks get the same closing, but any deliberate interior hole (a
  // Schildchen, another zone) is re-punched so the repair can never swallow an
  // exclusion the board signed off on.
  const zoneStats = [];
  for (const z of k.zones) {
    const file = path.join(dir, `mask-${z}.webp`);
    const m = await loadRGBA(file);
    if (m.W !== W || m.H !== H) throw new Error(`${file} is ${m.W}x${m.H}, base is ${W}x${H}`);
    const mon = new Uint8Array(W * H);
    for (let p = 0; p < mon.length; p++) mon[p] = m.data[p * 4 + 3] >= 128 ? 1 : 0;
    const keepHoles = deliberateHoles(mon, W, H);
    const mclosed = close(mon, W, H, cfg.radius);
    const mrepaired = cfg.smooth ? smoothBinary(mclosed, W, H, cfg.smooth) : mclosed;
    let mAdded = 0;
    let mRemoved = 0;
    for (let p = 0; p < mon.length; p++) {
      if (keepHoles[p]) continue;
      const inGarment = base.data[p * 4 + 3] >= 128;
      // Never grow a zone past the (repaired) garment — a mask that spills over
      // the silhouette would paint fabric onto the background.
      if (mrepaired[p] && !mon[p] && inGarment) {
        m.data[p * 4 + 3] = 255;
        mAdded++;
      } else if (mon[p] && (!mrepaired[p] || !inGarment)) {
        // The mask must follow the smoothed outline too. A zone still carrying
        // the old staircase would paint fabric one step outside the silhouette,
        // which is exactly the die-cut edge this repair is removing.
        m.data[p * 4 + 3] = 0;
        mRemoved++;
      }
    }
    zoneStats.push(`${z}+${mAdded}/-${mRemoved}`);
    if (!check && (mAdded > 0 || mRemoved > 0)) {
      await writeInPlace(m.data, W, H, file, MASK_WEBP);
      files.push(`mask-${z}.webp`);
    }
  }

  console.log(
    `${konfigId}: silhouette +${added}px/-${removed}px ` +
    `(+${addPct.toFixed(2)}%/-${removePct.toFixed(2)}% of garment, ` +
    `close r=${cfg.radius} smooth r=${cfg.smooth ?? 0}, ${sweptPct.toFixed(1)}% of sweep), ` +
    `zones ${zoneStats.join(" ")}${check ? " [check only, nothing written]" : ` -> ${files.join(", ")}`}`,
  );
  return { added, sweptPct };
}

/**
 * Proves the area cap can actually fail. A radius of 40 visibly rounds the
 * scarf's corners off, so a guard that passes it is not guarding anything —
 * which is exactly how the first version of this cap was caught.
 */
async function selftest() {
  const original = REPAIR.dreieckstuch.radius;
  REPAIR.dreieckstuch.radius = 40;
  try {
    await repair("dreieckstuch", { check: true });
    console.error("SELFTEST FAILED — the area cap did not fire at r=40");
    process.exitCode = 9;
  } catch (err) {
    if (!/cap \d+%/.test(err.message)) {
      console.error("SELFTEST FAILED — wrong error at r=40:", err.message);
      process.exitCode = 9;
      return;
    }
    console.log("selftest ok — cap fires at r=40:", err.message.split(" — ")[0]);
  } finally {
    REPAIR.dreieckstuch.radius = original;
  }
}

if (process.argv[1]?.endsWith("bil2522-repair-silhouette.mjs")) {
  const argv = process.argv.slice(2);
  if (argv.includes("--selftest")) {
    await selftest();
  } else {
    const i = argv.indexOf("--konfig");
    const ids = i >= 0 ? [argv[i + 1]] : Object.keys(REPAIR);
    for (const id of ids) {
      await repair(id, { check: argv.includes("--check"), debug: argv.includes("--debug") });
    }
  }
}
