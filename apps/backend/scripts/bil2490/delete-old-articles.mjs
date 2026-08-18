#!/usr/bin/env node
/**
 * BIL-2490 step 4 — delete the 13 legacy articles that have no reworked photo.
 *
 * These are NOT the seed demos (that was delete-demos.mjs, already executed).
 * They are real, sellable handmade articles whose only defect is that they still
 * carry the old un-cut-out photos. Deleting them is therefore a *commercial*
 * decision, not a cleanup — it is gated on an explicit board A/B answer and this
 * script refuses to run without it.
 *
 * Safety rails (same contract as delete-demos.mjs):
 *  - Every target is matched by exact handle AND expected title. Any mismatch
 *    aborts the whole run before a single delete — no fuzzy deletes on a live
 *    catalog, and no partial run that leaves the shop half-migrated.
 *  - A full pre-delete snapshot (product + variants + prices + images) is
 *    written next to this script, so every article can be re-created verbatim
 *    if the board reverses. This is the cheap rollback; the pg_dump on the
 *    Hetzner host is the backstop.
 *  - DELETE /admin/products/:id is a soft delete in Medusa v2 and order line
 *    items keep their denormalised product_title/variant_title, so historical
 *    orders referencing these articles stay readable.
 *  - Idempotency: a target already gone (404 / absent from the list) is
 *    reported as `already_deleted`, not an error, so a retry is always safe.
 *  - The two konfigurator products are asserted present *after* the run —
 *    /konfigurator/* resolves its variant by title regex, so losing one of
 *    them silently breaks add-to-cart.
 *
 * Usage:
 *   node apps/backend/scripts/bil2490/delete-old-articles.mjs --dry-run
 *   node apps/backend/scripts/bil2490/delete-old-articles.mjs --confirm-board-decision-a
 *   env: MEDUSA_ADMIN_EMAIL / MEDUSA_ADMIN_PASSWORD (infra/.vault)
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BACKEND, jsonFetch, listProducts, login } from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes("--dry-run");
const CONFIRMED = process.argv.includes("--confirm-board-decision-a");

/** The 13 legacy articles, verified against the live catalog on 2026-08-18. */
const TARGETS = [
  { handle: "turban-pastell-aquarell", title: 'Turban-Mütze "Pastell-Aquarell" mit rosa Schleife' },
  { handle: "pumphose-rosen-rosa", title: 'Pumphose "Rosen" rosa mit türkiser Schleife' },
  { handle: "pumphose-wildblumen-weiss", title: 'Pumphose "Wildblumen" creme mit Paperbag-Bund' },
  { handle: "pumphose-wale-marine", title: 'Pumphose "Wale" marineblau' },
  { handle: "pumphose-vintage-rosen", title: 'Pumphose "Vintage-Rosen" cream mit bordeaux Bund' },
  { handle: "pumphose-anker-sterne", title: 'Pumphose "Anker & Sterne" marine-türkis' },
  { handle: "pumphose-pferde-blumen", title: 'Pumphose "Pferde & Blumen" navy mit roten Bündchen' },
  { handle: "pumphose-regenbogen-wolken", title: 'Pumphose "Regenbogen & Wolken" navy-rosa' },
  { handle: "pumphose-dinos-rosa-braun", title: 'Pumphose "Dinos" rosa mit braunem Bund' },
  { handle: "pumphose-fuechse-waldgeist", title: 'Pumphose "Füchse im Wald" creme-oliv' },
  { handle: "pumphose-dinos-rosa-tuerkis", title: 'Pumphose "Dinos" rosa mit türkisem Bund' },
  { handle: "pumphose-wale-altrosa", title: 'Pumphose "Wale" altrosa' },
  { handle: "pumphose-erdbeeren", title: 'Pumphose "Erdbeeren" beere-türkis' },
];

/** Must survive the run — the konfigurators resolve these by title regex. */
const PROTECTED = [/\bbody\b/i, /pumphose.*konfigurator/i];

async function main() {
  if (!DRY && !CONFIRMED) {
    console.error(
      "REFUSED: deleting 13 sellable articles needs the board's A/B answer.\n" +
        "Re-run with --dry-run to preview, or --confirm-board-decision-a once\n" +
        "the board has explicitly chosen option A on BIL-2490."
    );
    process.exit(2);
  }

  const token = await login();
  const products = await listProducts(token);
  console.log(`live catalog: ${products.length} products`);

  // Resolve + assert before mutating anything.
  const plan = [];
  const problems = [];
  for (const t of TARGETS) {
    const hit = products.find((p) => p.handle === t.handle);
    if (!hit) {
      plan.push({ ...t, action: "already_deleted", id: null });
      continue;
    }
    if (hit.title !== t.title) {
      problems.push(`handle ${t.handle}: expected title ${JSON.stringify(t.title)}, live is ${JSON.stringify(hit.title)}`);
      continue;
    }
    if (PROTECTED.some((re) => re.test(hit.title))) {
      problems.push(`handle ${t.handle}: title matches a konfigurator guard, refusing`);
      continue;
    }
    plan.push({ ...t, action: "delete", id: hit.id, product: hit });
  }

  if (problems.length) {
    console.error("ABORT — catalog does not match expectations:\n  " + problems.join("\n  "));
    process.exit(1);
  }

  const snapshot = plan.filter((p) => p.product).map((p) => p.product);
  writeFileSync(join(HERE, "deleted-old-articles-snapshot.json"), JSON.stringify(snapshot, null, 2));
  console.log(`snapshot written: ${snapshot.length} products`);

  for (const p of plan) {
    if (p.action === "already_deleted") {
      console.log(`  already_deleted  ${p.handle}`);
      continue;
    }
    if (DRY) {
      console.log(`  would delete     ${p.handle}  (${p.id})  ${p.title}`);
      continue;
    }
    await jsonFetch(`${BACKEND}/admin/products/${p.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    console.log(`  deleted          ${p.handle}  (${p.id})`);
  }

  // Post-condition: konfigurator backing products must still resolve.
  const after = DRY ? products : await listProducts(token);
  for (const re of PROTECTED) {
    const hit = after.find((p) => re.test(p.title));
    if (!hit) {
      console.error(`POST-CHECK FAILED: no product matches ${re} — konfigurator add-to-cart is broken.`);
      process.exit(1);
    }
    console.log(`  konfigurator ok  ${re} -> ${hit.title}`);
  }

  const remaining = DRY ? products.length - plan.filter((p) => p.action === "delete").length : after.length;
  console.log(`${DRY ? "[dry-run] " : ""}catalog after: ${remaining} products`);
  writeFileSync(
    join(HERE, "delete-old-articles-results.json"),
    JSON.stringify({ dry_run: DRY, at: new Date().toISOString(), plan: plan.map(({ product, ...r }) => r), remaining }, null, 2)
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
