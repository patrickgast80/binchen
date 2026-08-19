/**
 * BIL-2522 — how small may relief.webp get before the customer sees it?
 *
 * BIL-2523 found the Konfigurator's LCP driver was an encoder leak in
 * `base.webp` and handed the remaining payload back here: on `turban` the
 * relief map is 255kB and the fabric tile 105kB — together more than the whole
 * 35-chip palette. This sweep answers the only question that decides whether
 * that payload may shrink: does a cheaper encode change what the shop RENDERS?
 *
 * Measuring the map is not enough. R/G are texture coordinates and B is shade,
 * so a given |Δ| means something different per channel: 1/255 on R is 0.28px of
 * displacement (invisible on a smooth field), 1/255 on B is a shading step. So
 * every candidate is scored by running the SHIPPED relief-math over it with a
 * real fabric and diffing the painted pixels against the reference render.
 *
 * The reference is the in-memory buffer straight out of buildRelief — not the
 * file on disk — so no candidate is credited or charged for the generation loss
 * of the encode that already shipped.
 *
 *   node scripts/bil2522-relief-encode-sweep.mjs [--konfig turban] [--json out]
 */
import sharp from "sharp";
import path from "node:path";

import { KONFIGS } from "./bil2509-composite.mjs";
import { RELIEF_OPTS } from "./bil2522-build-relief.mjs";
import { buildRelief } from "./lib/bil2522-relief.mjs";
import { loadTile } from "./bil2522-render.mjs";
import {
  grainFor,
  paintReliefZone,
  tilePx,
  WARP_RANGE,
} from "../src/app/konfigurator/_shared/relief-math.mjs";

const MASK_FILE = { buendchen: "buendchen" };

/**
 * Candidate encoders.
 *
 * Lossy webp is in here to be REJECTED with a number rather than with the
 * comment that currently asserts it: ordinary webp subsamples chroma 4:2:0, and
 * R/G are coordinates, so half of the warp field is averaged away. If the sweep
 * ever shows otherwise, that comment is what has to change.
 */
const CANDIDATES = [
  { id: "lossless", opts: { lossless: true, effort: 6 } },
  { id: "nl-q60", opts: { nearLossless: true, quality: 60, effort: 6 } }, // ships today
  { id: "nl-q40", opts: { nearLossless: true, quality: 40, effort: 6 } },
  { id: "nl-q20", opts: { nearLossless: true, quality: 20, effort: 6 } },
  { id: "nl-q10", opts: { nearLossless: true, quality: 10, effort: 6 } },
  { id: "lossy-q95", opts: { quality: 95, effort: 6 } },
  { id: "lossy-q90", opts: { quality: 90, effort: 6 } },
];

/** Densest prints in the palette — the hardest case for a warped resample. */
const PROBE_FABRIC = "stoff-15";

async function loadRGBA(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height };
}

/** Paint every fabric-capable zone exactly as relief-layer.tsx accumulates it. */
async function renderLayer(konfigId, reliefData, W, H, tiles, masks) {
  const layer = new Uint8ClampedArray(W * H * 4);
  for (const zone of KONFIGS[konfigId].zones) {
    const mask = masks.get(zone);
    if (!mask) continue;
    paintReliefZone(layer, reliefData, mask, tiles.get(zone), W, H, grainFor(zone));
  }
  return layer;
}

function diff(a, b) {
  let n = 0, sum = 0, max = 0, over1 = 0;
  for (let p = 0; p < a.length / 4; p++) {
    if (a[p * 4 + 3] === 0 && b[p * 4 + 3] === 0) continue;
    n++;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(a[p * 4 + c] - b[p * 4 + c]);
      sum += d;
      if (d > max) max = d;
      if (d > 1) over1++;
    }
  }
  return { painted: n, mean: sum / (n * 3), max, over1Pct: (100 * over1) / (n * 3) };
}

export async function sweep(konfigId) {
  const k = KONFIGS[konfigId];
  const dir = path.join("public/konfigurator", k.dir);
  const base = await loadRGBA(path.join(dir, "base.webp"));
  const { W, H } = base;
  const { relief } = buildRelief(base.data, W, H, RELIEF_OPTS[konfigId] ?? {});

  // Every zone that CAN carry a print, painted at once: the sweep must not pass
  // because the one zone it happened to probe was the flat one.
  const masks = new Map();
  const tiles = new Map();
  for (const zone of k.zones) {
    const file = path.join(dir, `mask-${MASK_FILE[zone] ?? zone}.webp`);
    let m;
    try {
      m = await loadRGBA(file);
    } catch {
      continue;
    }
    const alpha = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p++) alpha[p] = m.data[p * 4 + 3];
    masks.set(zone, alpha);
    const grain = grainFor(zone);
    tiles.set(zone, await loadTile(PROBE_FABRIC, 0, tilePx(W, grain)));
  }

  const ref = await renderLayer(konfigId, relief, W, H, tiles, masks);
  const rows = [];
  for (const cand of CANDIDATES) {
    const buf = await sharp(relief, { raw: { width: W, height: H, channels: 4 } })
      .webp(cand.opts)
      .toBuffer();
    const dec = await sharp(buf).ensureAlpha().raw().toBuffer();
    const got = await renderLayer(konfigId, dec, W, H, tiles, masks);
    const d = diff(ref, got);
    // Displacement error in source pixels, the unit the warp is actually in.
    let warpMax = 0;
    for (let p = 0; p < W * H; p++) {
      if (relief[p * 4 + 3] === 0) continue;
      for (const c of [0, 1]) {
        const e = (Math.abs(dec[p * 4 + c] - relief[p * 4 + c]) / 127) * WARP_RANGE;
        if (e > warpMax) warpMax = e;
      }
    }
    rows.push({ konfig: konfigId, id: cand.id, bytes: buf.length, warpMaxPx: +warpMax.toFixed(2), ...d });
  }
  return rows;
}

if (process.argv[1]?.endsWith("bil2522-relief-encode-sweep.mjs")) {
  const argv = process.argv.slice(2);
  const only = argv.includes("--konfig") ? argv[argv.indexOf("--konfig") + 1] : null;
  const parts = only ? [only] : ["hose", "hose-kurz", "muetze", "turban", "dreieckstuch"];
  const all = [];
  for (const p of parts) {
    const rows = await sweep(p);
    const shipped = rows.find((r) => r.id === "nl-q60");
    console.log(`\n${p} — ${rows[0].painted.toLocaleString("de-DE")} painted px, probe fabric ${PROBE_FABRIC}`);
    console.log("  encoder      bytes    vs q60   warp|Δ|max   render mean|Δ|  max  >1/255");
    for (const r of rows) {
      const rel = ((100 * (r.bytes - shipped.bytes)) / shipped.bytes).toFixed(0);
      console.log(
        `  ${r.id.padEnd(11)} ${String(r.bytes).padStart(7)}  ${(rel + "%").padStart(7)}` +
        `   ${String(r.warpMaxPx).padStart(6)}px    ${r.mean.toFixed(3).padStart(9)}` +
        `  ${String(r.max).padStart(4)}  ${r.over1Pct.toFixed(2)}%`,
      );
    }
    all.push(...rows);
  }
  if (argv.includes("--json")) {
    const out = argv[argv.indexOf("--json") + 1];
    await sharp; // keep import used in all paths
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, JSON.stringify(all, null, 2));
    console.log(`\nwrote ${out}`);
  }
}
