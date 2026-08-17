#!/usr/bin/env node
/**
 * BIL-2490 / board order 2026-08-17 19:34Z — delete the demo/seed products that
 * still show broken grey SVG placeholders in the live catalog.
 *
 * Safety rails (source of truth: live Medusa is canonical, so a snapshot first):
 *  - Every target is matched by *exact* product id AND expected title. A title
 *    mismatch aborts the whole run — no fuzzy deletes on a live catalog.
 *  - Full pre-delete snapshot (product + variants + prices + images) is written
 *    next to this script so the article can be re-seeded if the board reverses.
 *  - DELETE /admin/products/:id is a soft delete in Medusa v2; order line items
 *    keep their denormalised product_title/variant_title, so the 6 historical
 *    test orders that reference these articles stay readable.
 *  - Idempotency: a target that is already gone (404 / not in the list) is
 *    reported as `already_deleted`, not an error, so a retry is safe.
 *
 * The catalog "Body" article is deliberately NOT in this list — it is the
 * product the /konfigurator/body add-to-cart resolves against
 * (getConfiguratorBodyVariant matches /\bbody\b/i on the title). See the
 * BIL-2490 comment for the escalation.
 *
 * Usage:  node apps/backend/scripts/bil2490/delete-demos.mjs [--dry-run]
 *   env:  MEDUSA_ADMIN_EMAIL / MEDUSA_ADMIN_PASSWORD (infra/.vault)
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BACKEND, jsonFetch, listProducts, login } from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes("--dry-run");

/** Board order: 6 articles. #1 "Body" is held back (konfigurator dependency). */
const TARGETS = [
  { id: "prod_01KZN83FK70K2EWR3PX9Z0KVF8", title: "Bio-Baumwolle Strampler – Waldtiere" },
  { id: "prod_01KZN83FQPX92VFVRN95WA8A6Y", title: "Jersey Bodysuits Set – Regenbogen (2er-Pack)" },
  { id: "prod_01KZN83FTBD5F874C66RSRDB5K", title: "Musselinhose – Salbeigrün" },
  { id: "prod_01KZN83FW3BHYXMJBKS9BASND0", title: "Wendejacke – Punkte & Streifen" },
  { id: "prod_01KZN83FY1J19YHD40SE1T5Q14", title: "Spielanzug mit Füßen – Sternchen" },
];

const token = await login();
const live = await listProducts(token);
const byId = new Map(live.map((p) => [p.id, p]));

// --- guard: verify every target before mutating anything -------------------
const plan = [];
const problems = [];
for (const t of TARGETS) {
  const p = byId.get(t.id);
  if (!p) {
    plan.push({ ...t, action: "already_deleted" });
    continue;
  }
  if (p.title !== t.title) {
    problems.push(`${t.id}: expected title ${JSON.stringify(t.title)}, live is ${JSON.stringify(p.title)}`);
    continue;
  }
  plan.push({ ...t, action: "delete", snapshot: p });
}
if (problems.length) {
  console.error("ABORT — live titles do not match the board order:\n  " + problems.join("\n  "));
  process.exit(1);
}

const snapshotPath = join(HERE, "deleted-demos-snapshot.json");
writeFileSync(
  snapshotPath,
  JSON.stringify(
    { at: new Date().toISOString(), backend: BACKEND, products: plan.filter((p) => p.snapshot).map((p) => p.snapshot) },
    null,
    2,
  ),
);
console.log(`snapshot -> ${snapshotPath}`);

const results = [];
for (const step of plan) {
  if (step.action === "already_deleted") {
    console.log(`skip  ${step.id}  ${step.title} (already gone)`);
    results.push({ id: step.id, title: step.title, result: "already_deleted" });
    continue;
  }
  if (DRY) {
    console.log(`DRY   ${step.id}  ${step.title}`);
    results.push({ id: step.id, title: step.title, result: "dry_run" });
    continue;
  }
  try {
    const body = await jsonFetch(`${BACKEND}/admin/products/${step.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    console.log(`DEL   ${step.id}  ${step.title}  -> deleted=${body?.deleted}`);
    results.push({ id: step.id, title: step.title, result: "deleted", deleted: body?.deleted === true });
  } catch (err) {
    console.error(`FAIL  ${step.id}  ${step.title}  -> ${err.message}`);
    results.push({ id: step.id, title: step.title, result: "error", error: err.message });
  }
}

// --- verify: re-list and prove the ids are gone ----------------------------
const after = await listProducts(token);
const stillThere = TARGETS.filter((t) => after.some((p) => p.id === t.id));
const out = {
  at: new Date().toISOString(),
  dryRun: DRY,
  countBefore: live.length,
  countAfter: after.length,
  results,
  stillThere: stillThere.map((t) => t.id),
};
writeFileSync(join(HERE, "delete-demos-results.json"), JSON.stringify(out, null, 2));
console.log(`\nproducts ${live.length} -> ${after.length};  still present: ${stillThere.length}`);
process.exit(stillThere.length && !DRY ? 1 : 0);
