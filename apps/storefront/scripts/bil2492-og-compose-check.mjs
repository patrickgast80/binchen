/**
 * BIL-2492 — proves the OG compositor renders the fabric print AND its rotation.
 *
 * `next/og` cannot even be imported on Windows/Node 24 (ERR_INVALID_URL on its
 * bundled font path), so hitting `/api/og/konfig/hose` locally always 500s and
 * says nothing. This calls the real `composeKonfigPhoto` directly and writes
 * the composed garment PNG — the part rotation actually changes — so it can be
 * looked at instead of trusted.
 *
 * Usage: node --experimental-strip-types scripts/bil2492-og-compose-check.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { composeKonfigPhoto } from "../src/app/api/og/konfig/[konfigurator]/compose.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const storefront = path.resolve(here, "..");
process.chdir(storefront); // mirror the standalone server's cwd

const OUT = path.resolve(storefront, "../e2e/reports/bil2492");

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
for (const rot of [0, 90, 180, 270]) {
  const composed = await composeKonfigPhoto("http://127.0.0.1:3311", HOSE, COLORS, TEXTURES, rot);
  if (!composed.dataUri) {
    console.error(`rot=${rot}: FAIL — ${composed.trace}`);
    process.exit(1);
  }
  const buf = Buffer.from(composed.dataUri.split(",")[1], "base64");
  const file = path.join(OUT, `og-compose-hose-rot${rot}.png`);
  await writeFile(file, buf);
  // Byte-identical output across angles would mean the rotation never reached
  // the tile — the exact failure a green content-type check would hide.
  const key = buf.toString("base64").slice(0, 512);
  if (seen.has(key)) {
    console.error(`rot=${rot}: FAIL — identical to an earlier angle, rotation not applied`);
    process.exit(1);
  }
  seen.add(key);
  console.log(`rot=${rot}: ${composed.trace} → ${path.basename(file)}`);
}

// And a uni-colour control: no texture must still take the flat-tint path.
const uni = await composeKonfigPhoto(
  "http://127.0.0.1:3311",
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
  path.join(OUT, "og-compose-hose-uni.png"),
  Buffer.from(uni.dataUri.split(",")[1], "base64"),
);
console.log(`uni (no texture, rot=90): ${uni.trace}`);
console.log("PASS — four distinct composed cards + uni fallback");
