#!/usr/bin/env node
/**
 * BIL-2507 — one-shot codemod: point the five identical Konfigurator product
 * reads at the shared retrying `fetchConfiguratorProducts()`.
 *
 * Scripted rather than hand-edited because the five blocks are byte-identical;
 * a manual pass is exactly where you fix four of five and ship the fifth
 * broken. Asserts the expected occurrence count and fails loudly otherwise.
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("../../../storefront/src/lib/medusa.ts", import.meta.url);
const raw = readFileSync(FILE, "utf8");
// medusa.ts is checked out CRLF on this Windows worktree. Normalise for
// matching and restore the original ending on write, so the codemod does not
// smear a whole-file line-ending change across the diff.
const EOL = raw.includes("\r\n") ? "\r\n" : "\n";
let src = raw.split("\r\n").join("\n");

const BLOCK = `  if (!BACKEND_URL) return null;
  const url = new URL(\`\${BACKEND_URL}/store/products\`);
  url.searchParams.set("limit", "50");
  const regionId = await getDefaultRegionId();
  if (regionId) url.searchParams.set("region_id", regionId);
  url.searchParams.set("fields", PRODUCT_PRICE_FIELDS);
  const res = await fetch(url.toString(), { headers: authHeaders(), next: { revalidate: 60 } });
  if (!res.ok) return null;
  const { products } = (await res.json()) as { products: MedusaProduct[] };
`;

// Source order of the five identical resolvers.
const LABELS = [
  "konfigurator-hose-kurz",
  "konfigurator-turban",
  "konfigurator-muetze",
  "konfigurator-dreieckstuch",
  "konfigurator-body",
];

const found = src.split(BLOCK).length - 1;
if (found !== LABELS.length) {
  console.error(`expected ${LABELS.length} identical blocks, found ${found} — aborting`);
  process.exit(1);
}

let i = 0;
src = src.replaceAll(BLOCK, () => {
  const label = LABELS[i++];
  return `  const products = await fetchConfiguratorProducts(50, "${label}");\n  if (!products) return null;\n`;
});

// The long-Hose resolver is the odd one out: limit 20 and an interleaved comment.
const HOSE_BLOCK = `  if (!BACKEND_URL) return null;
  const url = new URL(\`\${BACKEND_URL}/store/products\`);
  url.searchParams.set("limit", "20");
  // BIL-2438: pull calculated_price via pricing context so the konfigurator
  // teaser price is a real number, not the legacy zero-fallback.
  const regionId = await getDefaultRegionId();
  if (regionId) url.searchParams.set("region_id", regionId);
  url.searchParams.set("fields", PRODUCT_PRICE_FIELDS);
  const res = await fetch(url.toString(), { headers: authHeaders(), next: { revalidate: 60 } });
  if (!res.ok) return null;
  const { products } = (await res.json()) as { products: MedusaProduct[] };
`;
if (!src.includes(HOSE_BLOCK)) {
  console.error("long-Hose block not found — aborting");
  process.exit(1);
}
src = src.replace(
  HOSE_BLOCK,
  `  // BIL-2438: pull calculated_price via pricing context so the konfigurator
  // teaser price is a real number, not the legacy zero-fallback.
  const products = await fetchConfiguratorProducts(20, "konfigurator-hose");
  if (!products) return null;
`,
);

writeFileSync(FILE, EOL === "\n" ? src : src.split("\n").join("\r\n"));
console.log(`rewired ${LABELS.length + 1} resolvers (eol=${JSON.stringify(EOL)})`);
