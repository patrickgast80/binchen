// BIL-2501 — Repair: move every product hanging on a shipping profile with ZERO
// shipping options onto the profile that actually owns the live options.
//
// Root cause (BIL-2490): two "type=default" profiles exist —
//   sp_01KVFA9F9H00CR770SBKXAEM61 "Default Shipping Profile"  (Medusa's own seed, 0 options)
//   sp_01KVFAA1580RJBGMV8QMWWZVRV "Default"                   (our seed-shipping.ts, 3 options)
// apply.mjs picked `shipping-profiles?limit=1` -> the wrong one -> every new product
// dead-ends at POST /store/carts/{id}/complete with
//   "The cart items require shipping profiles that are not satisfied by the current shipping methods"
//
// The target profile is resolved by DATA, not by id/name: the profile that owns
// shipping options wins. Hardcoding an id would rot the next time a profile is reseeded.
//
// Idempotent: products already on the target profile are skipped, so a re-run is a no-op.
// Rollback: `node fix-shipping-profile.mjs --rollback` replays rollback-plan.json
// (written on every applying run) and puts each product back on its previous profile.
//
// Run:
//   set -a; . infra/.vault/admin-credentials.env; set +a
//   node apps/backend/scripts/bil2501/fix-shipping-profile.mjs --dry-run
//   node apps/backend/scripts/bil2501/fix-shipping-profile.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { BACKEND, jsonFetch, login } from "../bil2490/lib.mjs";
import { collect } from "./audit.mjs";

const RESULTS = new URL("./fix-results.json", import.meta.url);
const ROLLBACK = new URL("./rollback-plan.json", import.meta.url);

const DRY_RUN = process.argv.includes("--dry-run");
const ROLLBACK_MODE = process.argv.includes("--rollback");

/** The profile that owns live shipping options is the only one a cart can satisfy. */
export function resolveTargetProfile(profiles, optionsByProfile) {
  const withOptions = profiles.filter((p) => (optionsByProfile.get(p.id) ?? []).length > 0);
  if (withOptions.length === 0) {
    throw new Error("No shipping profile has any shipping option — run seed-shipping first.");
  }
  if (withOptions.length > 1) {
    // Multiple option-owning profiles is a legitimate setup (e.g. oversized goods).
    // Refuse to guess rather than silently re-home products.
    throw new Error(
      `Ambiguous: ${withOptions.length} profiles own shipping options ` +
      `(${withOptions.map((p) => `${p.id} "${p.name}"`).join(", ")}). ` +
      `Re-home products manually.`);
  }
  return withOptions[0];
}

async function setProfile(token, productId, profileId) {
  return jsonFetch(`${BACKEND}/admin/products/${productId}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ shipping_profile_id: profileId }),
  });
}

async function rollback(token) {
  const plan = JSON.parse(readFileSync(ROLLBACK, "utf8"));
  console.log(`Rolling back ${plan.moves.length} product(s) recorded ${plan.generated_at}`);
  for (const m of plan.moves) {
    if (!m.from_profile_id) { console.log(`  SKIP  ${m.id} — had no previous profile`); continue; }
    await setProfile(token, m.id, m.from_profile_id);
    console.log(`  BACK  ${m.id}  -> ${m.from_profile_id}  (${m.title})`);
  }
  console.log("Rollback complete.");
}

async function main() {
  const token = await login();
  if (ROLLBACK_MODE) return rollback(token);

  const { profiles, optionsByProfile, products, normalizeProfile } = await collect(token);
  const target = resolveTargetProfile(profiles, optionsByProfile);
  const targetOptions = optionsByProfile.get(target.id) ?? [];

  console.log(`Target profile: ${target.id} "${target.name}" ` +
    `(${targetOptions.length} options: ${targetOptions.map((o) => o.name).join(", ")})`);

  const moves = products
    .map((p) => ({ product: p, sp: normalizeProfile(p) }))
    .filter(({ sp }) => sp?.id !== target.id)
    .map(({ product, sp }) => ({
      id: product.id, title: product.title, status: product.status,
      from_profile_id: sp?.id ?? null, from_profile_name: sp?.name ?? null,
      to_profile_id: target.id,
    }));

  console.log(`\n${moves.length} product(s) to move, ${products.length - moves.length} already correct.`);
  if (moves.length === 0) { console.log("Nothing to do — already idempotent-clean."); return; }

  if (DRY_RUN) {
    for (const m of moves) console.log(`  WOULD MOVE ${m.id}  ${m.from_profile_name} -> ${target.name}  (${m.title})`);
    console.log("\n--dry-run: nothing written.");
    return;
  }

  // Write the rollback plan BEFORE mutating, so a crash mid-run is still reversible.
  writeFileSync(ROLLBACK, JSON.stringify({ generated_at: new Date().toISOString(), moves }, null, 2));

  const results = [];
  for (const m of moves) {
    try {
      await setProfile(token, m.id, target.id);
      results.push({ ...m, ok: true });
      console.log(`  MOVED ${m.id}  ${m.from_profile_name} -> ${target.name}  (${m.title})`);
    } catch (err) {
      results.push({ ...m, ok: false, error: String(err).slice(0, 400) });
      console.error(`  FAIL  ${m.id}  ${m.title}: ${err}`);
    }
  }

  writeFileSync(RESULTS, JSON.stringify({
    generated_at: new Date().toISOString(),
    target_profile: { id: target.id, name: target.name },
    results,
  }, null, 2));

  const failed = results.filter((r) => !r.ok);
  console.log(`\nMoved ${results.length - failed.length}/${results.length}. Failures: ${failed.length}`);
  if (failed.length > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
