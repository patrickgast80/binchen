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

/**
 * Per-Konfigurator overrides.
 *
 * Two measurements decide these, not taste:
 *
 *   1. How ROUND the piece is — `limbRadius` is the tube/dome radius in px. The
 *      approved hose sits at 108px against a median depth-inside-silhouette of
 *      86px (`.tmp-geo`, ratio 1.25). Pieces that are genuinely volumes (puff
 *      legs, hat dome, knotted turban) keep that ratio against their own median
 *      depth; a Dreieckstuch lying FLAT on the table is not a tube at all and
 *      gets a small radius that only rounds off its hem.
 *   2. How much real cloth structure the base carries — `sigma_fine` from
 *      bil2509-detail-probe. A base with real folds must not have invented ones
 *      painted over them; a base that is a smooth balloon needs them.
 *
 * Median depth / sigma_fine of the main zone, measured 2026-08-19:
 *   hose 86px / 8.35 · hose-kurz 97px / 6.50 · muetze 117px / 7.96
 *   turban 106px / 12.28 · dreieckstuch 49px / 8.03 (residue, not folds)
 */
export const RELIEF_OPTS = {
  // Approved by the board on the proof — do not retune without a new pass.
  hose: { limbRadius: 108 },

  // Same architecture as hose and an even flatter base (the balloon shorts are
  // literally featureless in the body), so the drape amplitude carries over.
  // The legs are short and wide, though: at the long-pants pitch of 210px a
  // 300px leg gets less than one and a half creases, which reads as a stain
  // rather than as drape. Halved along the limb, tightened across it.
  "hose-kurz": { limbRadius: 120, drapeScaleX: 40, drapeScaleY: 118 },

  // A hat is a real dome, so it takes the full roll. Its crown gathers ARE in
  // the photo (the radial creases), so the invented drape only has to cover the
  // smooth flanks — a third of the pants amount, and near-isotropic because a
  // knitted hat creases in no particular direction. The base is washed out to
  // near-white by the de-print, so its own shading needs more gain to survive.
  muetze: {
    limbRadius: 150,
    drapeAmp: 0.02,
    drapeScaleX: 62,
    drapeScaleY: 90,
    foldGain: 2.45,
  },

  // The one base with genuinely strong folds — the bow alone measures
  // sigma_fine 26. Inventing creases on top of real ones is how a render starts
  // looking busy instead of real, so the drape is off entirely and the photo
  // does all the geometry.
  turban: { limbRadius: 135, drapeAmp: 0 },

  // The awkward one. It lies FLAT (no tube), it has NO real folds, and its
  // remaining fine structure is de-print residue — faint "Kleiner Zoo" motifs,
  // clearly visible when the base is dumped as PNG. So:
  //   · small radius, weak limb: round off the hem, do not inflate the scarf
  //   · foldGain down, not up: amplifying that residue would push the old print
  //     back through the chosen fabric — a straight BIL-2512 regress
  //   · foldPhotoWeight 0.12: the displacement must not trace zoo animals
  //   · drapeYieldToPhoto off: otherwise the drape fades out around every ghost
  //     motif, i.e. the print would still be shaping the cloth, just indirectly
  // The geometry then comes from the drape alone: broad, soft, diagonal ripples
  // at the scale a jersey scarf actually falls in.
  dreieckstuch: {
    limbRadius: 46,
    limbStrength: 0.2,
    foldGain: 0.6,
    foldPhotoWeight: 0.12,
    drapeYieldToPhoto: false,
    drapeAmp: 0.05,
    drapeScaleX: 96,
    drapeScaleY: 78,
    rimRadius: 8,
  },
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
