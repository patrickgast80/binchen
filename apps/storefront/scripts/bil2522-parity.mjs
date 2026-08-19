/**
 * BIL-2522 — browser/Node parity + jitter control for the relief layer.
 *
 * The board is being asked to sign off "täuschend echt" partly from offline
 * before/after sheets. Those sheets are only evidence if the browser paints
 * the same pixels the Node renderer does. This drives a real Konfigurator page
 * in Chromium, pulls the relief canvas straight out of the DOM, and compares
 * it against the Node render of the same paints.
 *
 * It also runs the jitter control the QA rules demand: the SAME url captured
 * twice must diff to exactly zero, otherwise a before/after diff proves
 * nothing (BIL-2506).
 *
 *   node scripts/bil2522-parity.mjs --base http://127.0.0.1:3522
 */
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { KONFIGS } from "./bil2509-composite.mjs";
import { renderRelief } from "./bil2522-render.mjs";

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const BASE = arg("base", "http://127.0.0.1:3522");
const OUT = arg("out", ".tmp/bil2522/parity");

// Playwright lives in the e2e workspace, not the storefront's — importing it
// by path keeps this script runnable from apps/storefront (where the public/
// relative paths the Node renderer uses actually resolve).
const { chromium } = await import(
  new URL("../../e2e/node_modules/@playwright/test/index.mjs", import.meta.url).href
);

/**
 * One case per Konfigurator per fabric/rotation. The rot=90 cases matter most:
 * the tile is turned by a shared index permutation here and in the browser, and
 * that is exactly the kind of code that silently forks.
 */
const CASES = [
  { konfig: "hose", query: "hose=stoff-04&bund=mustard&buendchen=mustard", paints: { hose: "stoff-04", bund: "mustard", buendchen: "mustard" }, rot: 0 },
  { konfig: "hose", query: "hose=stoff-15&bund=sage&buendchen=sage", paints: { hose: "stoff-15", bund: "sage", buendchen: "sage" }, rot: 0 },
  { konfig: "hose", query: "hose=stoff-20&bund=petrol&buendchen=petrol&rot=90", paints: { hose: "stoff-20", bund: "petrol", buendchen: "petrol" }, rot: 90 },

  { konfig: "hose-kurz", query: "hose=stoff-04&bund=mustard&buendchen=mustard", paints: { hose: "stoff-04", bund: "mustard", buendchen: "mustard" }, rot: 0 },
  { konfig: "hose-kurz", query: "hose=stoff-20&bund=petrol&buendchen=petrol&rot=90", paints: { hose: "stoff-20", bund: "petrol", buendchen: "petrol" }, rot: 90 },

  { konfig: "muetze", query: "muetze=stoff-04&futter=mustard", paints: { muetze: "stoff-04", futter: "mustard" }, rot: 0 },
  { konfig: "muetze", query: "muetze=stoff-20&futter=petrol&rot=90", paints: { muetze: "stoff-20", futter: "petrol" }, rot: 90 },

  { konfig: "turban", query: "turban=stoff-15&schleife=sage", paints: { turban: "stoff-15", schleife: "sage" }, rot: 0 },
  { konfig: "turban", query: "turban=stoff-20&schleife=petrol&rot=90", paints: { turban: "stoff-20", schleife: "petrol" }, rot: 90 },

  { konfig: "dreieckstuch", query: "tuch=stoff-04", paints: { tuch: "stoff-04" }, rot: 0 },
  { konfig: "dreieckstuch", query: "tuch=stoff-20&rot=90", paints: { tuch: "stoff-20" }, rot: 90 },
];

/** Pull the relief canvas's raw pixels out of the live page. */
async function grabCanvas(page, url) {
  await page.goto(url, { waitUntil: "networkidle" });
  const handle = await page.waitForFunction(
    () => {
      const c = document.querySelector("canvas");
      // opacity flips to 1 only after putImageData, so this waits for a real
      // paint rather than for the element to merely exist.
      if (!c || getComputedStyle(c).opacity !== "1") return null;
      const ctx = c.getContext("2d");
      const d = ctx.getImageData(0, 0, c.width, c.height);
      return { w: c.width, h: c.height, data: Array.from(d.data) };
    },
    null,
    { timeout: 20000, polling: 250 },
  );
  const got = await handle.jsonValue();
  return { w: got.w, h: got.h, data: Uint8ClampedArray.from(got.data) };
}

const pct = (n, d) => `${((n / d) * 100).toFixed(4)}%`;

/** Alpha of the Konfigurator's label overlay, or null if it has none. */
const labelCache = new Map();
async function labelAlpha(konfigId) {
  if (labelCache.has(konfigId)) return labelCache.get(konfigId);
  let out = null;
  if (KONFIGS[konfigId]?.label) {
    const file = `public/konfigurator/${KONFIGS[konfigId].dir}/label.webp`;
    const { data, info } = await sharp(await readFile(file))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    out = new Uint8Array(info.width * info.height);
    for (let p = 0; p < out.length; p++) out[p] = data[p * 4 + 3];
  }
  labelCache.set(konfigId, out);
  return out;
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const report = [];
let failures = 0;

for (const c of CASES) {
  const url = `${BASE}/konfigurator/${c.konfig}?${c.query}`;

  // --- jitter control: same URL twice must be byte-identical -------------
  const a = await grabCanvas(page, url);
  const b = await grabCanvas(page, url);
  let jitter = 0;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) jitter++;

  // --- parity against the Node renderer ----------------------------------
  // Compare the fabric layer alone: the Node renderer composites it over the
  // base, so recompose the browser layer the same way is unnecessary — instead
  // compare the shaded fabric where the layer is fully opaque, which is the
  // part this ticket actually changes.
  const node = await renderRelief(c.konfig, c.paints, c.rot);

  // The Schildchen is drawn into the SAME buffer by the Node renderer, but is a
  // sibling DOM layer above the canvas in the browser, so where the two overlap
  // they legitimately hold different content (label vs. the fabric behind it).
  // That is 14 px per hose-kurz case — the label mostly sits on the Bündchen,
  // which the zone masks exclude anyway — and it was the only thing standing
  // between this run and 11/11: max|Δ| 192 there, 4 everywhere else.
  //
  // Excluded rather than tolerated. Raising the threshold to swallow it would
  // have hidden a real fork of the same size; skipping a region where the two
  // sides are known to render different things does not.
  const label = await labelAlpha(c.konfig);

  let n = 0;
  let skippedLabel = 0;
  let diffSum = 0;
  let maxDiff = 0;
  const diffImg = Buffer.alloc(a.w * a.h * 3, 255);
  for (let p = 0; p < a.w * a.h; p++) {
    if (a.data[p * 4 + 3] < 250) continue;
    if (label && label[p] > 0) { skippedLabel++; continue; }
    n++;
    let worst = 0;
    for (let ch = 0; ch < 3; ch++) {
      const d = Math.abs(a.data[p * 4 + ch] - node.buf[p * 3 + ch]);
      if (d > worst) worst = d;
    }
    diffSum += worst;
    if (worst > maxDiff) maxDiff = worst;
    const v = Math.max(0, 255 - worst * 16);
    diffImg[p * 3] = 255;
    diffImg[p * 3 + 1] = v;
    diffImg[p * 3 + 2] = v;
  }
  const meanDiff = n ? diffSum / n : 0;
  await sharp(diffImg, { raw: { width: a.w, height: a.h, channels: 3 } })
    .png()
    .toFile(path.join(OUT, `${c.konfig}-${c.paints[Object.keys(c.paints)[0]]}-rot${c.rot}-diff.png`));

  // webp decode and canvas' un/premultiply round trip cost a step or two per
  // channel; anything beyond that means the two renderers really disagree.
  const ok = jitter === 0 && meanDiff <= 1.0 && maxDiff <= 6;
  if (!ok) failures++;
  report.push({
    url,
    jitterBytes: jitter,
    comparedPixels: n,
    skippedLabelPixels: skippedLabel,
    meanChannelDiff: +meanDiff.toFixed(3),
    maxChannelDiff: maxDiff,
    verdict: ok ? "PASS" : "FAIL",
  });
  console.log(
    `${ok ? "PASS" : "FAIL"} ${url}\n` +
    `      jitter=${jitter} bytes  compared=${n} px (${pct(n, a.w * a.h)} of canvas)  ` +
    (skippedLabel ? `skippedLabel=${skippedLabel} px  ` : "") +
    `mean|Δ|=${meanDiff.toFixed(3)}  max|Δ|=${maxDiff}`,
  );
}

await browser.close();
await writeFile(path.join(OUT, "parity.json"), JSON.stringify(report, null, 2));
console.log(`\n${report.length - failures}/${report.length} passed -> ${path.join(OUT, "parity.json")}`);
if (failures) process.exitCode = 1;
