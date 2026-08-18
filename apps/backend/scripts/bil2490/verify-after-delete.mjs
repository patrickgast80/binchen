#!/usr/bin/env node
/**
 * BIL-2490 step 5 — live verification AFTER deleting the 12 remaining legacy articles.
 *
 * Verifies against the real public surfaces, not against the delete script's own log:
 *  - Store API (publishable key) lists exactly the 15 relaunch products + the
 *    Pumphose konfigurator base = 16 published
 *  - every surviving PDP renders 200 and is NOT `variant_unavailable`
 *  - every deleted handle is gone from the store listing (soft-deleted products must not leak)
 *  - catalog / homepage / /fruehchen / the 4 live konfigurators return 200
 *  - the konfigurator title regexes still resolve to exactly ONE product each
 *    (they resolve their variant by title regex — a second match silently breaks add-to-cart)
 *
 * Body konfigurator: BIL-2496 set "Bilulu-Body (Konfigurator)" to `draft` on board
 * order, so it is intentionally absent from the store surface and /konfigurator/body
 * is a known 404 owned by BIL-2496 — NOT a side effect of this deletion. We assert
 * the *expected* shape (present in admin, draft, absent from store) rather than
 * skipping it, so a real regression here would still fail the run.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND = process.env.MEDUSA_BACKEND_URL || "https://api.bilulu.de";
const STORE = process.env.STOREFRONT_URL || "https://bilulu.de";
const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || process.env.MEDUSA_PUBLISHABLE_KEY;

const DELETED_HANDLES = [
  "turban-pastell-aquarell", "pumphose-rosen-rosa", "pumphose-wildblumen-weiss",
  "pumphose-wale-marine", "pumphose-vintage-rosen", "pumphose-anker-sterne",
  "pumphose-pferde-blumen", "pumphose-regenbogen-wolken", "pumphose-dinos-rosa-braun",
  "pumphose-fuechse-waldgeist", "pumphose-dinos-rosa-tuerkis", "pumphose-wale-altrosa",
  "pumphose-erdbeeren",
];
/** Regexes the storefront uses to resolve a konfigurator's backing product, with
 *  the surface each one must be unambiguous on. Body lives in admin only (draft). */
const KONFIGURATOR_REGEXES = [
  { re: /pumphose.*konfigurator/i, surface: "store" },
  { re: /\bbody\b/i, surface: "admin" },
];
const PAGES = [
  "/", "/catalog", "/fruehchen",
  "/konfigurator/hose", "/konfigurator/turban", "/konfigurator/muetze",
  "/konfigurator/dreieckstuch",
];
/** Intentionally 404 since BIL-2496 (Body set to draft on board order). */
const EXPECTED_404_PAGES = ["/konfigurator/body"];

const results = { at: new Date().toISOString(), checks: [], pass: true };
const check = (name, ok, detail) => {
  results.checks.push({ name, ok, detail });
  if (!ok) results.pass = false;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

async function get(url, headers = {}) {
  const res = await fetch(url, { headers, redirect: "follow" });
  const text = await res.text();
  return { status: res.status, text };
}

async function adminList() {
  const { login, listProducts } = await import("./lib.mjs");
  return listProducts(await login());
}

async function storeProducts() {
  if (!PUB_KEY) throw new Error("publishable key missing (NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY)");
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const r = await get(`${BACKEND}/store/products?limit=100&offset=${offset}&fields=id,title,handle`, {
      "x-publishable-api-key": PUB_KEY,
    });
    if (r.status !== 200) throw new Error(`store/products -> ${r.status}: ${r.text.slice(0, 300)}`);
    const body = JSON.parse(r.text);
    out.push(...body.products);
    if (out.length >= body.count) return out;
  }
}

console.log("=== BIL-2490 post-delete live verification ===");
const products = await storeProducts();
const adminProducts = await adminList();
console.log(`store listing: ${products.length} products | admin: ${adminProducts.length}\n`);

check("store listing has 16 published (15 relaunch + Pumphose konfigurator)", products.length === 16, `got ${products.length}`);
check("admin has 17 (the 16 above + draft Body konfigurator)", adminProducts.length === 17, `got ${adminProducts.length}`);

// Body must still EXIST in admin as draft — BIL-2496 hid it, it was not deleted here.
const body = adminProducts.find((p) => /\bbody\b/i.test(p.title));
check("Body konfigurator still exists in admin as draft (BIL-2496 hid it, delete did not remove it)",
  !!body && body.status === "draft", body ? `status=${body.status}` : "MISSING — this delete removed it");

// Deleted articles must be gone from the *store* surface, not just from admin.
const leaked = DELETED_HANDLES.filter((h) => products.some((p) => p.handle === h));
check("all 13 legacy handles absent from store listing", leaked.length === 0, leaked.length ? `leaked: ${leaked.join(", ")}` : "none leak");
const leakedAdmin = DELETED_HANDLES.filter((h) => adminProducts.some((p) => p.handle === h));
check("all 13 legacy handles absent from admin listing", leakedAdmin.length === 0, leakedAdmin.length ? `still there: ${leakedAdmin.join(", ")}` : "none remain");

// Konfigurator title-regex resolution must stay unambiguous on its own surface.
for (const { re, surface } of KONFIGURATOR_REGEXES) {
  const pool = surface === "store" ? products : adminProducts;
  const hits = pool.filter((p) => re.test(p.title));
  check(`konfigurator regex ${re} resolves to exactly 1 product (${surface})`, hits.length === 1,
    hits.length ? hits.map((h) => h.title).join(" | ") : "NO MATCH — add-to-cart broken");
}

// Stock discipline: the 15 relaunch articles are handmade one-offs and must sit
// at stocked_quantity 1. The konfigurator bases are made-to-order and keep >1.
// This must survive a container boot — seed-inventory.js used to reset every
// variant to 50 on each deploy, which made unique items orderable 50 times.
console.log("\n--- stock (handmade one-offs must be 1) ---");
{
  const { jsonFetch } = await import("./lib.mjs");
  const { login } = await import("./lib.mjs");
  const tok = await login();
  const auth = { authorization: `Bearer ${tok}` };
  const inv = await jsonFetch(`${BACKEND}/admin/inventory-items?limit=200&fields=id,*location_levels`, { headers: auth });
  const byId = new Map(inv.inventory_items.map((i) => [i.id, i]));
  const full = await jsonFetch(`${BACKEND}/admin/products?limit=100&fields=id,title,*variants,*variants.inventory_items`, { headers: auth });
  const offenders = [];
  for (const p of full.products) {
    if (/konfigurator/i.test(p.title)) continue;
    for (const v of p.variants ?? []) {
      for (const x of v.inventory_items ?? []) {
        const lvl = byId.get(x.inventory_item_id ?? x.inventory?.id)?.location_levels?.[0];
        if (lvl && lvl.stocked_quantity !== 1) offenders.push(`${p.title}=${lvl.stocked_quantity}`);
      }
    }
  }
  check("all one-off articles at stocked_quantity 1", offenders.length === 0,
    offenders.length ? offenders.join(", ") : "15/15 at 1");
}

// Every surviving PDP must render.
console.log("\n--- PDPs ---");
for (const p of products) {
  const r = await get(`${STORE}/product/${p.id}`);
  const unavailable = /variant_unavailable/i.test(r.text);
  check(`PDP ${p.title.slice(0, 48)}`, r.status === 200 && !unavailable,
    `HTTP ${r.status}${unavailable ? " + variant_unavailable" : ""}`);
}

// Deleted PDPs must be gone (404), not a soft-deleted 200 shell.
console.log("\n--- deleted PDPs must 404 ---");
const snapshot = JSON.parse(readFileSync(join(HERE, "deleted-old-articles-snapshot.json"), "utf8"));
for (const p of snapshot) {
  const r = await get(`${STORE}/product/${p.id}`);
  check(`deleted PDP ${p.handle}`, r.status === 404, `HTTP ${r.status}`);
}

// Public pages.
console.log("\n--- pages ---");
for (const path of PAGES) {
  const r = await get(`${STORE}${path}`);
  check(`page ${path}`, r.status === 200, `HTTP ${r.status}`);
}
for (const path of EXPECTED_404_PAGES) {
  const r = await get(`${STORE}${path}`);
  check(`page ${path} is the known BIL-2496 404 (Body draft)`, r.status === 404, `HTTP ${r.status}`);
}

writeFileSync(join(HERE, "verify-after-delete-results.json"), JSON.stringify(results, null, 2));
console.log(`\n=== ${results.pass ? "ALL PASS" : "FAILURES PRESENT"} — ${results.checks.filter((c) => c.ok).length}/${results.checks.length} ===`);
process.exit(results.pass ? 0 : 1);
