/**
 * BIL-2533 — Faltenstärke auf hose-kurz einstellen, ohne dafür zu deployen.
 *
 * Baut die Relief-Map für einen Satz Parameter IM SPEICHER, rendert damit
 * Patricks Konfiguration durch dieselbe Mathematik, die der Browser fährt
 * (relief-math.mjs), misst die lokale Versatz-Streuung in der Hosen-Zone und
 * schreibt einen beschrifteten Ausschnitt. Streifen (stoff-25) sind der
 * Härtetest: jede fehlende Verzerrung fällt dort sofort auf.
 *
 * Warum lokale Streuung und nicht mean|D|: ein konstanter Versatz verschiebt
 * das ganze Muster und fällt niemandem auf. Erst die Variation über eine
 * Faltenbreite verbiegt einen Streifen — das ist die Größe, die Patrick sieht.
 *
 *   node scripts/bil2533-fold-sweep.mjs [--konfig hose-kurz] [--stoff stoff-25]
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { KONFIGS } from "./bil2509-composite.mjs";
import { buildRelief } from "./lib/bil2522-relief.mjs";
import { RELIEF_OPTS } from "./bil2522-build-relief.mjs";
import { loadTile } from "./bil2522-render.mjs";
import {
  grainFor,
  paintReliefZone,
  tilePx,
} from "../src/app/konfigurator/_shared/relief-math.mjs";
import { WARP_RANGE } from "../src/app/konfigurator/_shared/relief-math.mjs";

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const KONFIG = arg("konfig", "hose-kurz");
const STOFF = arg("stoff", "stoff-25");
const OUT = arg("out", ".tmp/bil2533/sweep");
const UNI = { terracotta: "#C4704A", mustard: "#D4A24C", sage: "#A8C5AB", navy: "#2D3E50" };
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/**
 * Die Varianten. `null` = der ausgelieferte Stand, damit jede Messung eine
 * unveränderte Kontrolle neben sich hat statt nur eine Erinnerung daran.
 */
const VARIANTS = [
  { name: "00-shipped", opts: {} },
];
for (const spec of (arg("grid", "") || "").split(";").filter(Boolean)) {
  const opts = {};
  for (const kv of spec.split(",")) {
    const [k, v] = kv.split("=");
    opts[k] = Number(v);
  }
  VARIANTS.push({ name: spec.replace(/[=,]/g, "_"), opts });
}

const dir = path.join("public/konfigurator", KONFIGS[KONFIG].dir);
const load = async (file) => {
  const { data, info } = await sharp(path.join(dir, file))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height };
};

const base = await load("base.webp");
const { W, H } = base;
const N = W * H;
const k = KONFIGS[KONFIG];
const masks = {};
for (const z of k.zones) masks[z] = await load(`mask-${z}.webp`);
const highlight = k.sheen ? await load("highlight.webp") : null;
const label = k.label ? await load("label.webp") : null;

/** Lokale Streuung des Versatzes über ein Fenster von 2*WIN px. */
const WIN = 40;
function localSd(relief, alpha) {
  let sum = 0;
  let n = 0;
  let max = 0;
  const D = (p, c) => ((relief[p * 4 + c] - 128) / 127) * WARP_RANGE;
  for (let y = WIN; y < H - WIN; y += 12) {
    for (let x = WIN; x < W - WIN; x += 12) {
      if (alpha[(y * W + x) * 4 + 3] < 200) continue;
      let mx = 0;
      let my = 0;
      let c = 0;
      const pts = [];
      for (let j = -WIN; j <= WIN; j += 8) {
        for (let i = -WIN; i <= WIN; i += 8) {
          const q = (y + j) * W + (x + i);
          if (alpha[q * 4 + 3] < 200) continue;
          pts.push(q);
          mx += D(q, 0);
          my += D(q, 1);
          c++;
        }
      }
      if (c < 12) continue;
      mx /= c;
      my /= c;
      let v = 0;
      for (const q of pts) v += (D(q, 0) - mx) ** 2 + (D(q, 1) - my) ** 2;
      const sd = Math.sqrt(v / c);
      sum += sd;
      n++;
      if (sd > max) max = sd;
    }
  }
  return { mean: sum / Math.max(1, n), max };
}

async function render(relief, paints) {
  const out = Buffer.alloc(N * 3, 255);
  for (let p = 0; p < N; p++) {
    const a = base.data[p * 4 + 3] / 255;
    for (let ch = 0; ch < 3; ch++) {
      out[p * 3 + ch] = Math.round(255 * (1 - a) + base.data[p * 4 + ch] * a);
    }
  }
  const fabricZones = [];
  for (const zone of k.zones) {
    const id = paints[zone];
    if (!id) continue;
    if (id.startsWith("stoff-")) {
      fabricZones.push(zone);
      continue;
    }
    const flat = hexToRgb(UNI[id] ?? "#FAF7F2");
    const m = masks[zone];
    for (let p = 0; p < N; p++) {
      const a = m.data[p * 4 + 3] / 255;
      if (a <= 0) continue;
      for (let ch = 0; ch < 3; ch++) {
        const mul = (out[p * 3 + ch] * flat[ch]) / 255;
        out[p * 3 + ch] = Math.round(out[p * 3 + ch] * (1 - a) + mul * a);
      }
    }
  }
  if (highlight) {
    for (let p = 0; p < N; p++) {
      const a = highlight.data[p * 4 + 3] / 255;
      if (a <= 0) continue;
      for (let ch = 0; ch < 3; ch++) {
        const scr = 255 - ((255 - out[p * 3 + ch]) * (255 - highlight.data[p * 4 + ch])) / 255;
        out[p * 3 + ch] = Math.round(out[p * 3 + ch] * (1 - a) + scr * a);
      }
    }
  }
  if (fabricZones.length) {
    const layer = new Uint8ClampedArray(N * 4);
    const maskAlpha = new Uint8Array(N);
    for (const zone of fabricZones) {
      const m = masks[zone];
      for (let p = 0; p < N; p++) maskAlpha[p] = m.data[p * 4 + 3];
      const grain = grainFor(zone);
      const tile = await loadTile(paints[zone], 0, tilePx(W, grain));
      paintReliefZone(layer, relief, maskAlpha, tile, W, H, grain);
    }
    for (let p = 0; p < N; p++) {
      const a = layer[p * 4 + 3] / 255;
      if (a <= 0) continue;
      for (let ch = 0; ch < 3; ch++) {
        out[p * 3 + ch] = Math.round(out[p * 3 + ch] * (1 - a) + layer[p * 4 + ch] * a);
      }
    }
  }
  if (label) {
    for (let p = 0; p < N; p++) {
      const a = label.data[p * 4 + 3] / 255;
      if (a <= 0) continue;
      for (let ch = 0; ch < 3; ch++) {
        out[p * 3 + ch] = Math.round(out[p * 3 + ch] * (1 - a) + label.data[p * 4 + ch] * a);
      }
    }
  }
  return out;
}

await mkdir(OUT, { recursive: true });
const paints = { hose: STOFF, bund: "terracotta", buendchen: "terracotta" };
const rows = [];
for (const v of VARIANTS) {
  const { relief, stats } = buildRelief(base.data, W, H, {
    ...(RELIEF_OPTS[KONFIG] ?? {}),
    ...v.opts,
  });
  // Die Alpha-Abflachung des Builders nachziehen — sonst misst die Kontrolle
  // etwas anderes als das, was ausgeliefert würde.
  for (let p = 0; p < N; p++) relief[p * 4 + 3] = 255;
  const sd = localSd(relief, masks.hose.data);
  const buf = await render(relief, paints);
  const file = path.join(OUT, `${v.name}.png`);
  await sharp(buf, { raw: { width: W, height: H, channels: 3 } }).png().toFile(file);
  rows.push({ name: v.name, sd, stats });
  console.log(
    `${v.name.padEnd(46)} lokal-SD=${sd.mean.toFixed(2)}px max=${sd.max.toFixed(2)}px  ` +
    `warpMax=${stats.warpMaxPx}px clipped=${stats.warpClippedPct}% shade=${stats.shadeMean}`,
  );
}
console.log(`\n-> ${OUT}`);
