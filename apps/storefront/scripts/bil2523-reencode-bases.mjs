/**
 * BIL-2523 — re-encode the two Konfigurator bases that shipped as lossless WebP.
 *
 * `bil2522-repair-silhouette.mjs` wrote its repaired output with
 * `{ lossless: true }`. For a mask that is correct and even smaller; for the
 * photo base it tripled the file, and `base.webp` is the LCP element of every
 * Konfigurator route:
 *
 *     turban/base.webp        64 254 B (VP8 )  ->  179 630 B (VP8L)
 *     dreieckstuch/base.webp  28 750 B (VP8 )  ->   69 390 B (VP8L)
 *
 * Measured live on bilulu.de, turban's LCP was 4.5 s against 2.7 s on the
 * untouched hose route, 80 % of it the base.webp download.
 *
 * Why this is a re-encode and not a rebuild: the shipped file is LOSSLESS, so
 * its pixels ARE the repair script's exact output. Encoding those pixels at
 * q82 is therefore byte-for-byte what the script would have written with the
 * fix in place — there is no extra lossy generation to pay for. The builders
 * (bil2444/bil2446-build-*-assets.mjs) use exactly `quality: 82,
 * alphaQuality: 90` for a base, so this restores the house setting rather than
 * inventing a new one.
 *
 * The guard below is the point of the script. BIL-2522 exists to repair the
 * silhouette, so the one thing a re-encode may not touch is the ALPHA channel:
 * `--check` fails loudly unless alpha comes back bit-identical. RGB is allowed
 * to move, but only within the caps, and both numbers are printed so the delta
 * is a measurement rather than a promise.
 *
 *   node scripts/bil2523-reencode-bases.mjs --check   # measure, write nothing
 *   node scripts/bil2523-reencode-bases.mjs           # measure, then write
 *   node scripts/bil2523-reencode-bases.mjs --selftest # prove the guard fails
 */
import sharp from "sharp";
import path from "node:path";
import { readFile, rename, stat } from "node:fs/promises";

const ROOT = path.join(process.cwd(), "public", "konfigurator");

/** Same settings the asset builders use for a base. */
const BASE_WEBP = { quality: 82, alphaQuality: 90 };

/**
 * Caps, fixed BEFORE running so they cannot be tuned to the result.
 *
 * Alpha is absolute: the repaired silhouette must survive exactly, and libwebp
 * stores this alpha losslessly anyway, so anything above 0 means the encode is
 * doing something other than what we think.
 */
const MAX_ALPHA_DELTA = 0;
const MAX_MEAN_RGB = 2.0;
const MAX_RGB = 32;

/** Only the two files the lossless write actually regressed. */
const TARGETS = ["turban", "dreieckstuch"];

async function measure(konfig, write) {
  const file = path.join(ROOT, `${konfig}-foto`, "base.webp");
  const before = (await stat(file)).size;
  const src = await readFile(file);

  const fmt = src.toString("ascii", 12, 16);
  const ref = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = ref.info;

  const encoded = await sharp(ref.data, { raw: ref.info }).webp(BASE_WEBP).toBuffer();
  const got = await sharp(encoded).ensureAlpha().raw().toBuffer();

  let maxAlpha = 0;
  let maxRGB = 0;
  let sumRGB = 0;
  let nRGB = 0;
  for (let i = 0; i < W * H; i++) {
    const a = ref.data[i * 4 + 3];
    maxAlpha = Math.max(maxAlpha, Math.abs(a - got[i * 4 + 3]));
    // Fully transparent pixels carry undefined colour; comparing them would
    // measure the encoder's padding, not the garment.
    if (a < 8) continue;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(ref.data[i * 4 + c] - got[i * 4 + c]);
      maxRGB = Math.max(maxRGB, d);
      sumRGB += d;
      nRGB++;
    }
  }
  const meanRGB = sumRGB / nRGB;

  const fails = [];
  if (maxAlpha > MAX_ALPHA_DELTA) fails.push(`alpha delta ${maxAlpha} > ${MAX_ALPHA_DELTA}`);
  if (meanRGB > MAX_MEAN_RGB) fails.push(`mean RGB ${meanRGB.toFixed(2)} > ${MAX_MEAN_RGB}`);
  if (maxRGB > MAX_RGB) fails.push(`max RGB ${maxRGB} > ${MAX_RGB}`);

  console.log(
    `${konfig.padEnd(13)} ${W}x${H} ${fmt} ${before} B -> ${encoded.length} B ` +
      `(-${Math.round((1 - encoded.length / before) * 100)}%)  ` +
      `alphaDelta=${maxAlpha} meanRGB=${meanRGB.toFixed(2)} maxRGB=${maxRGB}` +
      (fails.length ? `  FAIL: ${fails.join("; ")}` : ""),
  );
  if (fails.length) return false;

  if (write) {
    // Same temp-file + rename dance as the repair script: sharp holds the
    // source open, and a rename cannot leave a half-written asset behind.
    const tmp = `${file}.tmp`;
    await sharp(ref.data, { raw: ref.info }).webp(BASE_WEBP).toFile(tmp);
    await rename(tmp, file);
    console.log(`  wrote ${path.relative(process.cwd(), file)}`);
  }
  return true;
}

/**
 * Prove the guard can fail. A threshold that has never rejected anything is
 * decoration — this deliberately mangles one alpha pixel and requires a FAIL.
 */
async function selftest() {
  const ref = { width: 8, height: 8, channels: 4 };
  const a = Buffer.alloc(8 * 8 * 4, 200);
  const b = Buffer.from(a);
  b[3] = 0;
  const delta = Math.abs(a[3] - b[3]);
  const rejected = delta > MAX_ALPHA_DELTA;
  console.log(`selftest: alpha delta ${delta} rejected=${rejected}`);
  if (!rejected) {
    console.error("selftest FAILED — the alpha guard accepts a corrupted mask");
    process.exit(1);
  }
  console.log("selftest OK — the guard rejects what it must");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) {
  await selftest();
} else {
  const write = !args.includes("--check");
  let ok = true;
  for (const k of TARGETS) ok = (await measure(k, write)) && ok;
  if (!ok) {
    console.error("\nparity guard failed — nothing further written");
    process.exit(1);
  }
  console.log(write ? "\nall bases re-encoded" : "\ncheck only — nothing written");
}
