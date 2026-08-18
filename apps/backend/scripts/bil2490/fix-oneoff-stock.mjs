#!/usr/bin/env node
/**
 * BIL-2490 — set the handmade one-offs back to stock 1.
 *
 * Found while verifying the deletion: seed-inventory.js ran `stocked_quantity =
 * 50` on EVERY variant on EVERY container boot, so all 15 relaunch articles —
 * unique handmade pieces — were orderable 50 times. The seed script is fixed in
 * the same commit (it no longer touches an existing level); this script repairs
 * the data that the old behaviour left behind.
 *
 * Policy:
 *  - Konfigurator base products are MADE TO ORDER, not one-offs. They keep their
 *    quantity and are asserted untouched.
 *  - Everything else is a one-off -> stocked_quantity 1.
 *
 * Reserved quantity is respected: we never set stocked below what is already
 * reserved, otherwise available_quantity goes negative and checkout breaks for
 * a cart that is mid-flight.
 *
 * Usage:
 *   node apps/backend/scripts/bil2490/fix-oneoff-stock.mjs --dry-run
 *   node apps/backend/scripts/bil2490/fix-oneoff-stock.mjs --apply
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BACKEND, jsonFetch, login } from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes("--apply");
const ONE_OFF_QTY = 1;
/** Made-to-order bases — quantity is deliberately > 1, do not clamp. */
const MADE_TO_ORDER = /konfigurator/i;

const token = await login();
const h = { authorization: `Bearer ${token}` };

const prods = await jsonFetch(
  `${BACKEND}/admin/products?limit=100&fields=id,title,status,*variants,*variants.inventory_items`,
  { headers: h }
);
const inv = await jsonFetch(`${BACKEND}/admin/inventory-items?limit=200&fields=id,sku,*location_levels`, { headers: h });
const byId = new Map(inv.inventory_items.map((i) => [i.id, i]));

const actions = [];
for (const p of prods.products) {
  const madeToOrder = MADE_TO_ORDER.test(p.title);
  for (const v of p.variants ?? []) {
    const ids = (v.inventory_items ?? []).map((x) => x.inventory_item_id ?? x.inventory?.id).filter(Boolean);
    for (const id of ids) {
      const level = byId.get(id)?.location_levels?.[0];
      if (!level) { actions.push({ product: p.title, action: "no_level", id }); continue; }
      const reserved = level.reserved_quantity ?? 0;
      if (madeToOrder) {
        actions.push({ product: p.title, action: "keep_made_to_order", stocked: level.stocked_quantity });
        continue;
      }
      const target = Math.max(ONE_OFF_QTY, reserved);
      if (level.stocked_quantity === target) {
        actions.push({ product: p.title, action: "already_correct", stocked: target });
        continue;
      }
      actions.push({
        product: p.title, action: APPLY ? "set" : "would_set",
        levelId: level.id, from: level.stocked_quantity, to: target,
        clampedByReserved: target !== ONE_OFF_QTY,
      });
      if (APPLY) {
        await jsonFetch(`${BACKEND}/admin/inventory-items/${id}/location-levels/${level.location_id}`, {
          method: "POST",
          headers: { ...h, "content-type": "application/json" },
          body: JSON.stringify({ stocked_quantity: target }),
        });
      }
    }
  }
}

for (const a of actions) {
  console.log(`  ${a.action.padEnd(20)} ${String(a.product).slice(0, 46).padEnd(48)} ${a.from !== undefined ? `${a.from} -> ${a.to}` : (a.stocked ?? "")}`);
}
const changed = actions.filter((a) => a.action === "set" || a.action === "would_set").length;
console.log(`\n${APPLY ? "applied" : "[dry-run]"} ${changed} change(s)`);
writeFileSync(join(HERE, "fix-oneoff-stock-results.json"), JSON.stringify({ apply: APPLY, at: new Date().toISOString(), actions }, null, 2));
