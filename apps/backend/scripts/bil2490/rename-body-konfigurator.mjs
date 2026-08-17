#!/usr/bin/env node
/**
 * BIL-2490 — the catalog article "Body" (prod_01KZ6Q1S10H9S6SG11NRZAVG7M) is the
 * product the /konfigurator/body add-to-cart resolves against: medusa.ts
 * getConfiguratorBodyVariant() does `products.find(p => /\bbody\b/i.test(p.title))`.
 * Deleting it would break that konfigurator exactly like deleting
 * "Bilulu-Pumphose (Konfigurator)" — which the board has ruled untouchable.
 *
 * So instead of deleting it, we make its role visible in the shop by giving it
 * the same naming as the Pumphose konfigurator article. `\bbody\b` still matches
 * "Bilulu-Body (Konfigurator)" (the hyphen is a word boundary), so the resolver
 * is unaffected — this script asserts that before and after.
 *
 * Rollback: PATCH the title back to "Body" (old value recorded in the result file).
 *
 * Usage: node apps/backend/scripts/bil2490/rename-body-konfigurator.mjs [--dry-run]
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BACKEND, jsonFetch, listProducts, login } from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes("--dry-run");

const ID = "prod_01KZ6Q1S10H9S6SG11NRZAVG7M";
const FROM = "Body";
const TO = "Bilulu-Body (Konfigurator)";

/** Mirror of getConfiguratorBodyVariant()'s product lookup. */
const resolves = (products) => products.find((p) => /\bbody\b/i.test(p.title))?.id ?? null;

const token = await login();
const before = await listProducts(token);
const target = before.find((p) => p.id === ID);
if (!target) throw new Error(`${ID} not found — refusing to guess`);
if (target.title !== FROM && target.title !== TO) {
  throw new Error(`unexpected live title ${JSON.stringify(target.title)} — aborting`);
}

const resolvedBefore = resolves(before);
if (resolvedBefore !== ID) {
  throw new Error(`konfigurator resolver points at ${resolvedBefore}, not ${ID} — aborting`);
}
console.log(`resolver before: ${resolvedBefore} (ok)`);

if (target.title === TO) {
  console.log("already renamed — nothing to do");
  process.exit(0);
}
if (DRY) {
  console.log(`DRY  ${ID}: ${JSON.stringify(FROM)} -> ${JSON.stringify(TO)}`);
  process.exit(0);
}

await jsonFetch(`${BACKEND}/admin/products/${ID}`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ title: TO }),
});

const after = await listProducts(token);
const resolvedAfter = resolves(after);
const newTitle = after.find((p) => p.id === ID)?.title;
console.log(`title  -> ${JSON.stringify(newTitle)}`);
console.log(`resolver after: ${resolvedAfter} (${resolvedAfter === ID ? "ok" : "BROKEN"})`);

writeFileSync(
  join(HERE, "rename-body-results.json"),
  JSON.stringify(
    { at: new Date().toISOString(), id: ID, from: FROM, to: newTitle, resolverBefore: resolvedBefore, resolverAfter: resolvedAfter },
    null,
    2,
  ),
);
process.exit(resolvedAfter === ID ? 0 : 1);
