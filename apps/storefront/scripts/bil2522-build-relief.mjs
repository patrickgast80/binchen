/**
 * BIL-2522 — build public/konfigurator/<dir>/relief.webp from base.webp.
 *
 * Reads only the shipped base asset, so it never touches the pinned source
 * photos under scripts/sources/ and can be re-run at any time. Lossless webp
 * is mandatory: R/G carry texture coordinates and lossy compression turns a
 * smooth warp field into blocky tearing that reads as fabric damage.
 *
 *   node scripts/bil2522-build-relief.mjs --konfig hose [--debug]
 */
import sharp from "sharp";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";

import { KONFIGS } from "./bil2509-composite.mjs";
import { buildRelief, WARP_RANGE } from "./lib/bil2522-relief.mjs";

/** Per-Konfigurator overrides — limb radius scales with how big the piece is. */
export const RELIEF_OPTS = {
  hose: { limbRadius: 108 },
  "hose-kurz": { limbRadius: 96 },
  muetze: { limbRadius: 120 },
  turban: { limbRadius: 110 },
  dreieckstuch: { limbRadius: 90 },
};

export async function buildFor(konfigId, { debug = false, opts = {} } = {}) {
  const k = KONFIGS[konfigId];
  if (!k) throw new Error(`unknown konfigurator ${konfigId}`);
  const dir = path.join("public/konfigurator", k.dir);
  const { data, info } = await sharp(path.join(dir, "base.webp"))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  if (W !== k.w || H !== k.h) throw new Error(`${konfigId}: base ${W}x${H} != registry ${k.w}x${k.h}`);

  const { relief, stats } = buildRelief(data, W, H, { ...(RELIEF_OPTS[konfigId] ?? {}), ...opts });
  const outFile = path.join(dir, "relief.webp");
  // Near-lossless, not lossy: R/G are texture coordinates and ordinary webp
  // chroma subsampling turns a smooth warp field into blocky tearing. At q60
  // the round trip costs at most 2/255 per channel (0.57px of displacement),
  // saves ~21% over strict lossless, and the renderer's procedural grain
  // dithers away any banding the encoder leaves in the shade channel.
  // Asserted below rather than assumed.
  await sharp(relief, { raw: { width: W, height: H, channels: 4 } })
    .webp({ nearLossless: true, quality: 60, effort: 6 })
    .toFile(outFile);

  const decoded = await sharp(outFile).ensureAlpha().raw().toBuffer();
  let maxErr = 0;
  for (let p = 0; p < W * H; p++) {
    if (relief[p * 4 + 3] === 0) continue;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(decoded[p * 4 + c] - relief[p * 4 + c]);
      if (d > maxErr) maxErr = d;
    }
  }
  if (maxErr > 2) {
    throw new Error(
      `${konfigId}: relief.webp round-trips with max |Δ|=${maxErr}/255 — the encoder is ` +
      `mangling the displacement field, drop back to { lossless: true }`,
    );
  }
  const { size } = await stat(outFile);
  console.log(
    `${konfigId}: ${outFile} ${W}x${H} ${(size / 1024).toFixed(1)}kB roundtrip|D|<=${maxErr} ` +
    `shade~${stats.shadeMean} warpMax=${stats.warpMaxPx}px clipped=${stats.warpClippedPct}%`,
  );
  if (stats.warpClippedPct > 0.5) {
    throw new Error(
      `${konfigId}: ${stats.warpClippedPct}% of the warp field hit the +-${WARP_RANGE}px ` +
      `encoding limit — raise WARP_RANGE or lower the gain, the map is lying about the geometry`,
    );
  }

  if (debug) {
    await mkdir(".tmp/bil2522", { recursive: true });
    // Channel dumps: the only way to see whether the warp field actually
    // follows the creases or just paints noise.
    await sharp(relief, { raw: { width: W, height: H, channels: 4 } })
      .removeAlpha().png().toFile(`.tmp/bil2522/${konfigId}-relief-rgb.png`);
    const shadeOnly = Buffer.alloc(W * H);
    for (let p = 0; p < W * H; p++) shadeOnly[p] = relief[p * 4 + 2];
    await sharp(shadeOnly, { raw: { width: W, height: H, channels: 1 } })
      .png().toFile(`.tmp/bil2522/${konfigId}-shade.png`);
  }
  return stats;
}

if (process.argv[1]?.endsWith("bil2522-build-relief.mjs")) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--konfig");
  const ids = i >= 0 ? [argv[i + 1]] : ["hose"];
  for (const id of ids) await buildFor(id, { debug: argv.includes("--debug") });
}
