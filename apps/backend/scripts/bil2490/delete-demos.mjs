#!/usr/bin/env node
/**
 * BIL-2490 / board order 2026-08-17 19:34Z — delete the demo/seed products that
 * still show broken grey SVG placeholders in the live catalog.
 *
 * Safety rails (source of truth: live Medusa is canonical, so a snapshot first):
 *  - Every target is matched by *exact* handle AND expected title. A title
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

/**
 * Board order: 6 articles. #1 "Body" is held back (konfigurator dependency).
 *
 * Targets are matched by *handle*, not by product id: the first delete run was
 * undone by a container restart, and the boot seed re-created all five with
 * fresh ids (prod_01KZN83F* -> prod_01M08M1Q*). Handle and SKU are stable
 * across those re-creations, id is not. The seed entries are gone as of
 * BIL-2490, so this should now be a one-shot; the handle matching just makes
 * a re-run safe if another stale image boots in the meantime.
 */
const TARGETS = [
  { handle: "bio-baumwolle-strampler-waldtiere", title: "Bio-Baumwolle Strampler – Waldtiere" },
  { handle: "jersey-bodysuits-set-regenbogen-2er-pack", title: "Jersey Bodysuits Set – Regenbogen (2er-Pack)" },
  { handle: "musselinhose-salbeigrun", title: "Musselinhose – Salbeigrün" },
  { handle: "wendejacke-punkte-streifen", title: "Wendejacke – Punkte & Streifen" },
  { handle: "spielanzug-mit-fuen-sternchen", title: "Spielanzug mit Füßen – Sternchen" },
];

const token = await login();
const live = await listProducts(token);
const byHandle = new Map(live.map((p) => [p.handle, p]));

// --- guard: verify every target before mutating anything -------------------
const plan = [];
const problems = [];
for (const t of TARGETS) {
  const p = byHandle.get(t.handle);
  if (!p) {
    plan.push({ ...t, id: null, action: "already_deleted" });
    continue;
  }
  if (p.title !== t.title) {
    problems.push(`${t.handle}: expected title ${JSON.stringify(t.title)}, live is ${JSON.stringify(p.title)}`);
    continue;
  }
  plan.push({ ...t, id: p.id, action: "delete", snapshot: p });
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
    console.log(`skip  ${step.handle}  ${step.title} (already gone)`);
    results.push({ handle: step.handle, title: step.title, result: "already_deleted" });
    continue;
  }
  if (DRY) {
    console.log(`DRY   ${step.id}  ${step.title}`);
    results.push({ handle: step.handle, id: step.id, title: step.title, result: "dry_run" });
    continue;
  }
  try {
    const body = await jsonFetch(`${BACKEND}/admin/products/${step.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    console.log(`DEL   ${step.id}  ${step.title}  -> deleted=${body?.deleted}`);
    results.push({ handle: step.handle, id: step.id, title: step.title, result: "deleted", deleted: body?.deleted === true });
  } catch (err) {
    console.error(`FAIL  ${step.id}  ${step.title}  -> ${err.message}`);
    results.push({ handle: step.handle, id: step.id, title: step.title, result: "error", error: err.message });
  }
}

// --- verify: re-list and prove the ids are gone ----------------------------
const after = await listProducts(token);
const stillThere = TARGETS.filter((t) => after.some((p) => p.handle === t.handle));
const out = {
  at: new Date().toISOString(),
  dryRun: DRY,
  countBefore: live.length,
  countAfter: after.length,
  results,
  stillThere: stillThere.map((t) => t.handle),
};
writeFileSync(join(HERE, "delete-demos-results.json"), JSON.stringify(out, null, 2));
console.log(`\nproducts ${live.length} -> ${after.length};  still present: ${stillThere.length}`);
process.exit(stillThere.length && !DRY ? 1 : 0);
