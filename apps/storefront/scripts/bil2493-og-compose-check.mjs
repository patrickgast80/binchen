/**
 * BIL-2493 — proves the smaller fabric tile still composes a correct OG card
 * and Merken thumbnail.
 *
 * `next/og` cannot be imported at all on Windows/Node 24 (ERR_INVALID_URL on
 * its bundled font path), so `/api/og/konfig/hose` always 500s locally and a
 * status check proves nothing. The part BIL-2493 actually touches is the
 * *fabric compositing*, which is plain sharp code in compose.ts — so call it
 * directly and look at the pixels.
 *
 * The Merken thumbnail runs the same tile through a canvas in the browser at
 * an even smaller size, so the OG card (900x1006) is the harder of the two
 * server-side consumers; if the print survives here it survives there.
 *
 * Usage:
 *   node --experimental-strip-types scripts/bil2493-og-compose-check.mjs \
 *     <origin> <label>
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { composeKonfigPhoto } from "../src/app/api/og/konfig/[konfigurator]/compose.ts";

const ORIGIN = process.argv[2] ?? "http://127.0.0.1:3399";
const LABEL = process.argv[3] ?? "after";

const here = path.dirname(fileURLToPath(import.meta.url));
const storefront = path.resolve(here, "..");
process.chdir(storefront); // mirror the standalone server's cwd

const OUT = path.resolve(storefront, "../e2e/reports/bil2493");

// Geometry mirrors registry.ts (importing it would drag in the client palette).
const HOSE = {
  id: "hose",
  path: "/konfigurator/hose",
  productLabel: "Hose",
  basePhoto: "/konfigurator/hose-foto/base.webp",
  sheenPhoto: "/konfigurator/hose-foto/highlight.webp",
  width: 900,
  height: 1006,
  regions: [
    { param: "bund", src: "/konfigurator/hose-foto/mask-bund.webp", label: "Bund", defaultColor: "petrol" },
    { param: "hose", src: "/konfigurator/hose-foto/mask-hose.webp", label: "Hose", defaultColor: "cream" },
    { param: "buendchen", src: "/konfigurator/hose-foto/mask-buendchen.webp", label: "Bündchen", defaultColor: "petrol" },
  ],
};

const COLORS = { bund: "#5BA8AE", hose: "#a8c8f8", buendchen: "#5BA8AE" };
const TEXTURES = { bund: null, hose: "/stoffe/stoff-14.webp", buendchen: null };

await mkdir(OUT, { recursive: true });

const seen = new Set();
for (const rot of [0, 90]) {
  const composed = await composeKonfigPhoto(ORIGIN, HOSE, COLORS, TEXTURES, rot);
  if (!composed.dataUri) {
    console.error(`rot=${rot}: FAIL — ${composed.trace}`);
    process.exit(1);
  }
  const buf = Buffer.from(composed.dataUri.split(",")[1], "base64");
  await writeFile(path.join(OUT, `og-${LABEL}-hose-rot${rot}.png`), buf);
  // BIL-2492's guard, kept: byte-identical output across angles would mean the
  // rotation never reached the tile.
  const key = buf.toString("base64").slice(0, 512);
  if (seen.has(key)) {
    console.error(`rot=${rot}: FAIL — identical to an earlier angle`);
    process.exit(1);
  }
  seen.add(key);
  console.log(`${LABEL} rot=${rot}: ${composed.trace} → og-${LABEL}-hose-rot${rot}.png`);
}

// Uni-colour control: no texture must still take the flat-tint path.
const uni = await composeKonfigPhoto(
  ORIGIN,
  HOSE,
  { bund: "#5BA8AE", hose: "#FAF7F2", buendchen: "#5BA8AE" },
  {},
  90,
);
if (!uni.dataUri) {
  console.error(`uni: FAIL — ${uni.trace}`);
  process.exit(1);
}
await writeFile(
  path.join(OUT, `og-${LABEL}-hose-uni.png`),
  Buffer.from(uni.dataUri.split(",")[1], "base64"),
);
console.log(`${LABEL} uni (no texture, rot=90): ${uni.trace}`);
console.log("PASS — distinct composed cards + uni fallback");
