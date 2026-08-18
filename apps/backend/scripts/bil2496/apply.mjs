#!/usr/bin/env node
/**
 * BIL-2496 — Patrick's two-part board order (Telegram, 2026-08-18):
 *
 *   1. Pumphose "Wale" altrosa  -> DELETE (out of the shop for good)
 *   2. Bilulu-Body (Konfigurator) -> status=draft ("im Hintergrund für später
 *      aufheben"): gone from the catalog, one PATCH away from coming back.
 *
 * Why a script and not two clicks in Admin: the catalog has two load-bearing
 * title-regex lookups (`/pumphose/i` for the Hose-Konfigurator, `/\bbody\b/i`
 * for the Body-Konfigurator). Both resolve against the *store* endpoint's
 * result order, so a delete or an unpublish can silently repoint add-to-cart at
 * the wrong article. The post-checks below reproduce those exact lookups
 * against the live store API instead of trusting the admin list.
 *
 * Safety rails (same contract as bil2490/delete-old-articles.mjs):
 *  - Targets are matched by exact handle AND expected title; any mismatch
 *    aborts before a single mutation.
 *  - A full pre-change snapshot (product + variants + prices + images) is
 *    written next to this script, so both articles can be restored verbatim.
 *  - DELETE /admin/products/:id is a soft delete in Medusa v2 and order line
 *    items keep their denormalised product_title/variant_title, so historical
 *    orders stay readable.
 *  - Idempotent: a target already deleted / already draft is reported as
 *    `already_*`, not an error, so a retry is always safe.
 *
 * Seed-resurrection check: apps/backend/src/scripts/seed.ts runs on every
 * container boot and re-creates any product whose SKU is missing. It currently
 * seeds exactly one SKU (HOSE-KONF-BASE). Neither target is in it, so neither
 * comes back on redeploy — asserted explicitly in `assertSeedCannotResurrect`.
 *
 * Usage:
 *   node apps/backend/scripts/bil2496/apply.mjs --dry-run
 *   node apps/backend/scripts/bil2496/apply.mjs --apply
 *   env: MEDUSA_ADMIN_EMAIL / MEDUSA_ADMIN_PASSWORD (infra/.vault)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BACKEND, jsonFetch, listProducts, login } from "../bil2490/lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes("--dry-run");
const APPLY = process.argv.includes("--apply");

const DELETE_TARGET = { handle: "pumphose-wale-altrosa", title: 'Pumphose "Wale" altrosa' };
// Handle is the bare "body" (BIL-2458 created it, BIL-2490 renamed only the title).
const DRAFT_TARGET = { handle: "body", title: "Bilulu-Body (Konfigurator)" };

/** The store-side lookups we must not break. Mirrors apps/storefront/src/lib/medusa.ts. */
const HOSE_RE = /pumphose/i;
const BODY_RE = /\bbody\b/i;

/** The SKU seed.ts is allowed to create. Anything else in the seed is a resurrection risk. */
const EXPECTED_SEED_SKUS = ["HOSE-KONF-BASE"];

/**
 * Read the seed source and assert it cannot re-create either target. This is a
 * source-level check on purpose: the compiled .medusa bundle is gitignored and
 * rebuilt from this file on every deploy, so the .ts is the real source of truth.
 */
function assertSeedCannotResurrect() {
  const seed = readFileSync(join(HERE, "../../src/scripts/seed.ts"), "utf8");
  const skus = [...seed.matchAll(/sku:\s*"([A-Z0-9-]+)"/g)].map((m) => m[1]);
  const unexpected = skus.filter((s) => !EXPECTED_SEED_SKUS.includes(s));
  if (unexpected.length) {
    throw new Error(
      `seed.ts creates unexpected SKUs ${unexpected.join(", ")} — review before deleting products.`
    );
  }
  for (const bad of [/Wale/i, /Body \(Konfigurator\)/i]) {
    if (bad.test(seed)) throw new Error(`seed.ts still references ${bad} — it would resurrect the product.`);
  }
  console.log(`  seed check ok    seed.ts seeds only [${skus.join(", ")}], neither target present`);
  return skus;
}

/** Reproduce the storefront's own resolution against the public store API. */
async function storeProducts() {
  const key = process.env.MEDUSA_PUBLISHABLE_KEY;
  if (!key) throw new Error("MEDUSA_PUBLISHABLE_KEY missing in env (infra/.vault/storefront.env)");
  // limit=50 covers both storefront call sites (Hose uses 20, Body uses 50);
  // the Hose check below re-slices to 20 so it matches that caller exactly.
  const url = `${BACKEND}/store/products?limit=50`;
  const body = await jsonFetch(url, { headers: { "x-publishable-api-key": key } });
  return body.products;
}

async function main() {
  if (!DRY && !APPLY) {
    console.error("Pass --dry-run to preview or --apply to execute.");
    process.exit(2);
  }

  assertSeedCannotResurrect();

  const token = await login();
  const products = await listProducts(token);
  console.log(`live catalog: ${products.length} products`);

  const plan = [];
  const problems = [];

  const resolve = (target, action) => {
    const hit = products.find((p) => p.handle === target.handle);
    if (!hit) {
      // A missing DELETE target is the happy idempotent path. A missing DRAFT
      // target is the opposite: the product we were told to *keep* is gone, so
      // reporting "already_draft" here would rubber-stamp the one outcome
      // Patrick ruled out. Fail loudly instead.
      if (action === "delete") return { ...target, action: "already_deleted", id: null };
      problems.push(
        `handle ${target.handle} (${target.title}) not found — it must be retained as a draft, not deleted.`
      );
      return null;
    }
    if (hit.title !== target.title) {
      problems.push(
        `handle ${target.handle}: expected title ${JSON.stringify(target.title)}, live is ${JSON.stringify(hit.title)}`
      );
      return null;
    }
    if (action === "draft" && hit.status === "draft") {
      return { ...target, action: "already_draft", id: hit.id, product: hit };
    }
    return { ...target, action, id: hit.id, product: hit, previous_status: hit.status };
  };

  const del = resolve(DELETE_TARGET, "delete");
  const draft = resolve(DRAFT_TARGET, "draft");
  if (del) plan.push(del);
  if (draft) plan.push(draft);

  // Guard: never delete the product that backs the Hose-Konfigurator.
  if (del?.product && HOSE_RE.test(del.product.title)) {
    const store = await storeProducts();
    const resolvesTo = store.slice(0, 20).find((p) => HOSE_RE.test(p.title));
    if (!resolvesTo) {
      problems.push("Hose-Konfigurator resolves to nothing today — refusing to touch any Pumphose.");
    } else if (resolvesTo.id === del.product.id) {
      problems.push(
        `REFUSED: the Hose-Konfigurator currently resolves to ${JSON.stringify(resolvesTo.title)} ` +
          `(${resolvesTo.id}), which is exactly the delete target. Repoint the konfigurator first.`
      );
    } else {
      console.log(`  hose guard ok    /pumphose/i -> ${JSON.stringify(resolvesTo.title)} (not the delete target)`);
    }
  }

  if (problems.length) {
    console.error("ABORT — catalog does not match expectations:\n  " + problems.join("\n  "));
    process.exit(1);
  }

  const snapshot = plan.filter((p) => p.product).map((p) => p.product);
  writeFileSync(join(HERE, "pre-change-snapshot.json"), JSON.stringify(snapshot, null, 2));
  console.log(`snapshot written: ${snapshot.length} products -> pre-change-snapshot.json`);

  for (const p of plan) {
    if (p.action.startsWith("already_")) {
      console.log(`  ${p.action.padEnd(16)} ${p.handle}`);
      continue;
    }
    if (DRY) {
      console.log(`  would ${p.action.padEnd(10)} ${p.handle}  (${p.id})  ${p.title}`);
      continue;
    }
    if (p.action === "delete") {
      await jsonFetch(`${BACKEND}/admin/products/${p.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      console.log(`  deleted          ${p.handle}  (${p.id})`);
    } else {
      await jsonFetch(`${BACKEND}/admin/products/${p.id}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
      console.log(`  drafted          ${p.handle}  (${p.id})  was: ${p.previous_status}`);
    }
  }

  // ---- Post-conditions, all against the LIVE store API (what the shop sees) ----
  const results = { dry_run: DRY, plan: plan.map(({ product, ...r }) => r), checks: {} };
  if (!DRY) {
    const store = await storeProducts();
    const admin = await listProducts(token);

    const waleGone = !store.some((p) => p.handle === DELETE_TARGET.handle);
    const waleGoneAdmin = !admin.some((p) => p.handle === DELETE_TARGET.handle);
    const bodyOutOfCatalog = !store.some((p) => p.handle === DRAFT_TARGET.handle);
    const bodyStillExists = admin.find((p) => p.handle === DRAFT_TARGET.handle);
    const hoseResolves = store.slice(0, 20).find((p) => HOSE_RE.test(p.title));
    const bodyResolves = store.find((p) => BODY_RE.test(p.title));

    results.checks = {
      wale_absent_from_store: waleGone,
      wale_absent_from_admin: waleGoneAdmin,
      body_absent_from_store: bodyOutOfCatalog,
      body_still_exists_as_draft: bodyStillExists?.status === "draft",
      body_product_id: bodyStillExists?.id ?? null,
      hose_konfigurator_resolves_to: hoseResolves?.title ?? null,
      hose_konfigurator_variant: hoseResolves?.variants?.[0]?.id ?? null,
      body_konfigurator_resolves_to: bodyResolves?.title ?? null,
      store_product_count: store.length,
    };

    const fails = [];
    if (!waleGone || !waleGoneAdmin) fails.push("Wale altrosa is still in the catalog");
    if (!bodyOutOfCatalog) fails.push("Body-Konfigurator is still in the store listing");
    if (bodyStillExists?.status !== "draft") fails.push("Body-Konfigurator is not a retained draft — it must be kept, not deleted");
    if (!hoseResolves) fails.push("Hose-Konfigurator resolves to nothing — add-to-cart is broken");
    if (bodyResolves) fails.push(`Body regex still resolves to ${bodyResolves.title} — expected nothing`);

    for (const [k, v] of Object.entries(results.checks)) console.log(`  check ${k} = ${v}`);
    if (fails.length) {
      console.error("POST-CHECK FAILED:\n  " + fails.join("\n  "));
      writeFileSync(join(HERE, "apply-results.json"), JSON.stringify({ ...results, failed: fails }, null, 2));
      process.exit(1);
    }
    console.log("all post-checks green");
  }

  writeFileSync(join(HERE, "apply-results.json"), JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
