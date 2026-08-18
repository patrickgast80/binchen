/**
 * BIL-2509 diagnostic — how much fold structure does each base actually carry?
 *
 * The realism complaint ("wirkt ausgemalt") has a measurable form: the base's
 * luminance inside a zone is nearly constant, because the de-print pass smooths
 * at radius 40-70 and the cloth drawing is then re-synthesised as regular
 * creases. Two numbers per zone:
 *
 *   sigma       std-dev of the base luminance over the zone — total structure
 *   sigma_fine  std-dev after subtracting a 24px local mean — the FOLD-scale
 *               structure only, with the broad lobe/gradient term removed.
 *               This is the number that tracks "reads as cloth"; a smooth
 *               balloon can have a healthy `sigma` and a near-zero `sigma_fine`.
 *
 * Compares the working tree against a saved copy of the shipped assets, so the
 * before/after in the ticket is a measurement and not an impression.
 *
 * Run: NODE_PATH=../../.pc-tmp/sharp-env/node_modules \
 *        node scripts/bil2509-detail-probe.mjs [shippedDir]
 */
import sharp from "sharp";
import path from "node:path";
import { existsSync } from "node:fs";

import { boxBlurMasked } from "./lib/konfigurator-shading.mjs";
import { spread } from "./lib/konfigurator-folds.mjs";

const SHIPPED = process.argv[2] ?? ".tmp/bil2509/shipped";

const TARGETS = [
  { id: "hose-kurz", dir: "hose-kurz-foto", zones: ["bund", "hose", "buendchen"] },
  { id: "hose", dir: "hose-foto", zones: ["bund", "hose", "buendchen"] },
  { id: "muetze", dir: "muetze-foto", zones: ["muetze", "futter"] },
  { id: "turban", dir: "turban-foto", zones: ["turban", "schleife"] },
  { id: "dreieckstuch", dir: "dreieckstuch-foto", zones: ["tuch"] },
  { id: "body", dir: "body-foto", zones: ["hauptteil", "halsbund", "aermelbund"] },
];

/** @returns {Promise<Record<string,{sigma:number,fine:number}>>} */
async function measure(dir, zones) {
  const { data: base, info } = await sharp(path.join(dir, "base.webp"))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;

  const isBg = new Uint8Array(N);
  const lum = new Float32Array(N);
  for (let p = 0; p < N; p++) {
    isBg[p] = base[p * 4 + 3] < 200 ? 1 : 0;
    lum[p] = base[p * 4];
  }
  // Subtract a local mean to isolate fold-scale structure from the broad lobes.
  const broad = boxBlurMasked(lum, W, H, isBg, 24, 2);
  const fine = new Float32Array(N);
  for (let p = 0; p < N; p++) if (!isBg[p]) fine[p] = lum[p] - broad[p];

  const out = {};
  for (const z of zones) {
    const mp = path.join(dir, `mask-${z}.webp`);
    if (!existsSync(mp)) continue;
    const m = await sharp(mp).ensureAlpha().resize({ width: W, height: H }).raw().toBuffer();
    const mask = new Uint8Array(N);
    for (let p = 0; p < N; p++) mask[p] = m[p * 4 + 3] >= 200 ? 1 : 0;
    out[z] = { sigma: spread(lum, mask, isBg, N), fine: spread(fine, mask, isBg, N) };
  }
  return out;
}

console.log("zone                        sigma            sigma_fine (fold scale)");
console.log("                        shipped ->  new     shipped ->  new");
for (const t of TARGETS) {
  const liveDir = path.join("public/konfigurator", t.dir);
  const oldDir = path.join(SHIPPED, t.id);
  if (!existsSync(path.join(oldDir, "base.webp"))) continue;
  const [a, b] = [await measure(oldDir, t.zones), await measure(liveDir, t.zones)];
  for (const z of t.zones) {
    if (!a[z] || !b[z]) continue;
    const df = b[z].fine - a[z].fine;
    const flag = df > 0.4 ? "  <= more cloth" : df < -0.4 ? "  <= FLATTER" : "";
    console.log(
      `${(t.id + "/" + z).padEnd(24)}${a[z].sigma.toFixed(1).padStart(6)} -> ${b[z].sigma.toFixed(1).padStart(5)}  ` +
        `${a[z].fine.toFixed(2).padStart(6)} -> ${b[z].fine.toFixed(2).padStart(5)}${flag}`,
    );
  }
}
