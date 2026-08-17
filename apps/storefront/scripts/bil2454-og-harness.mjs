/**
 * BIL-2454 — renders the Konfigurator OG card locally so the share image can be
 * *looked at* before a deploy.
 *
 * Two things this proves that `curl -I` cannot:
 *   1. `composeKonfigPhoto` finds its assets on disk (the production failure was
 *      a silent `null` from the HTTP asset fetch, which still returned a valid
 *      but half-empty PNG).
 *   2. satori actually renders the composed garment when handed a PNG data URI.
 *
 * `next/og` normally explodes on Windows because it builds its default font URL
 * with backslashes; passing `fonts` explicitly skips that code path.
 *
 * Usage: node --experimental-strip-types scripts/bil2454-og-harness.mjs [konfigId...]
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadImageResponse } from "./bil2454-og-imageresponse.mjs";

import { composeKonfigPhoto } from "../src/app/api/og/konfig/[konfigurator]/compose.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const storefront = path.resolve(here, "..");
process.chdir(storefront); // mirror the standalone server's cwd

const FONT = path.join(
  storefront,
  "node_modules/next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf",
);
const OUT = path.resolve(storefront, "../e2e/reports/bil2454-og-20260817/local");

// Kept in sync by hand with registry.ts — the harness only needs geometry and
// paths, and importing the registry would drag in the client palette module.
const CASES = {
  hose: {
    productLabel: "Hose",
    basePhoto: "/konfigurator/hose-foto/base.webp",
    sheenPhoto: "/konfigurator/hose-foto/highlight.webp",
    width: 900,
    height: 1006,
    regions: [
      { param: "bund", src: "/konfigurator/hose-foto/mask-bund.webp", label: "Bund" },
      { param: "hose", src: "/konfigurator/hose-foto/mask-hose.webp", label: "Hose" },
      {
        param: "buendchen",
        src: "/konfigurator/hose-foto/mask-buendchen.webp",
        label: "Bündchen",
      },
    ],
    colors: { bund: "#9CBFA7", hose: "#FAF7F2", buendchen: "#C4703F" },
  },
  turban: {
    productLabel: "Turban-Mütze",
    basePhoto: "/konfigurator/turban-foto/base.webp",
    width: 900,
    height: 796,
    regions: [
      { param: "turban", src: "/konfigurator/turban-foto/mask-turban.webp", label: "Turban" },
      { param: "schleife", src: "/konfigurator/turban-foto/mask-schleife.webp", label: "Schleife" },
    ],
    colors: { turban: "#9CBFA7", schleife: "#D8A657" },
  },
};

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CASES);
await mkdir(OUT, { recursive: true });
const fontData = await readFile(FONT);
const ImageResponse = await loadImageResponse();

for (const id of ids) {
  const konfig = CASES[id];
  const composed = await composeKonfigPhoto("http://127.0.0.1:9/unused", konfig, konfig.colors);
  console.log(`${id}: trace=${composed.trace} dataUri=${composed.dataUri ? "yes" : "NULL"}`);
  if (!composed.dataUri) continue;

  const card = {
    type: "div",
    props: {
      style: {
        width: 1200,
        height: 630,
        display: "flex",
        backgroundColor: "#F0EBE1",
      },
      children: {
        type: "div",
        props: {
          style: {
            width: 576,
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 36,
            backgroundColor: "#FAF7F2",
            borderRight: "1px solid #E5DDD4",
          },
          children: {
            type: "img",
            props: {
              src: composed.dataUri,
              width: composed.width,
              height: composed.height,
              style: { objectFit: "contain" },
            },
          },
        },
      },
    },
  };

  const res = new ImageResponse(card, {
    width: 1200,
    height: 630,
    fonts: [{ name: "Inter", data: fontData, weight: 400, style: "normal" }],
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const file = path.join(OUT, `${id}-satori.png`);
  await writeFile(file, buf);
  console.log(`  → ${file} (${Math.round(buf.byteLength / 1024)} kB)`);
}
