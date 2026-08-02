#!/usr/bin/env node
// BIL-2432 helper — the initial import defaulted variants to stocked_quantity=50.
// DoD requires stock=1/variant for handmade unikate. This script walks every
// product tagged metadata.source_issue=BIL-2432, then PATCHes every
// location_level of every variant's inventory_item down to stocked_quantity=1.
//
// Idempotent: skips levels already at target quantity.
// Runs OUTSIDE the container against the Live Admin API.
//
// Usage:
//   MEDUSA_ADMIN_EMAIL=... MEDUSA_ADMIN_PASSWORD=... \
//   node apps/backend/scripts/bil2432/reset-stock-to-1.mjs
//
// Optional env:
//   TARGET_QTY=1 (defaults to 1)
//   MEDUSA_BACKEND_URL=https://api.bilulu.de
//   DRY_RUN=true

const BACKEND = process.env.MEDUSA_BACKEND_URL || "https://api.bilulu.de";
const TARGET = Number(process.env.TARGET_QTY || 1);
const DRY_RUN = process.env.DRY_RUN === "true";

function log(...a) { console.log("[bil2432-stock]", ...a); }
function die(m) { console.error("[bil2432-stock] FATAL:", m); process.exit(1); }

async function jsonFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(`${opts.method || "GET"} ${url} -> ${res.status}: ${typeof body === "string" ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300)}`);
  return body;
}

async function getAdminToken() {
  if (process.env.MEDUSA_ADMIN_TOKEN) return process.env.MEDUSA_ADMIN_TOKEN;
  const email = process.env.MEDUSA_ADMIN_EMAIL;
  const password = process.env.MEDUSA_ADMIN_PASSWORD;
  if (!email || !password) die("Set MEDUSA_ADMIN_EMAIL + MEDUSA_ADMIN_PASSWORD.");
  const body = await jsonFetch(`${BACKEND}/auth/user/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!body?.token) die(`Auth response missing token: ${JSON.stringify(body)}`);
  return body.token;
}

async function listBil2432Products(token) {
  const all = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const body = await jsonFetch(
      `${BACKEND}/admin/products?limit=${limit}&offset=${offset}&fields=id,handle,title,metadata.source_issue,variants.id,variants.inventory_items.inventory_item_id,variants.inventory_items.inventory.location_levels.id,variants.inventory_items.inventory.location_levels.location_id,variants.inventory_items.inventory.location_levels.stocked_quantity`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    const batch = body.products || [];
    all.push(...batch);
    if (batch.length < limit) break;
    offset += batch.length;
  }
  return all.filter((p) => p.metadata?.source_issue === "BIL-2432");
}

async function patchLevel(token, itemId, locationId, qty) {
  return jsonFetch(
    `${BACKEND}/admin/inventory-items/${itemId}/location-levels/${locationId}`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ stocked_quantity: qty }),
    },
  );
}

async function main() {
  const token = await getAdminToken();
  log(`Auth ok. TARGET=${TARGET} DRY_RUN=${DRY_RUN}`);
  const products = await listBil2432Products(token);
  log(`BIL-2432 products: ${products.length}`);

  const results = [];
  for (const p of products) {
    for (const v of p.variants || []) {
      for (const ii of v.inventory_items || []) {
        for (const lvl of ii.inventory?.location_levels || []) {
          const current = lvl.stocked_quantity ?? 0;
          if (current === TARGET) {
            results.push({ handle: p.handle, variant: v.id, level: lvl.id, from: current, to: current, status: "skip" });
            continue;
          }
          if (DRY_RUN) {
            results.push({ handle: p.handle, variant: v.id, level: lvl.id, from: current, to: TARGET, status: "would-patch" });
            continue;
          }
          try {
            await patchLevel(token, ii.inventory_item_id, lvl.location_id, TARGET);
            results.push({ handle: p.handle, variant: v.id, level: lvl.id, from: current, to: TARGET, status: "patched" });
          } catch (err) {
            results.push({ handle: p.handle, variant: v.id, level: lvl.id, from: current, status: "fail", error: err.message });
          }
        }
      }
    }
  }
  const patched = results.filter((r) => r.status === "patched").length;
  const skipped = results.filter((r) => r.status === "skip").length;
  const failed = results.filter((r) => r.status === "fail").length;
  log(`Summary: patched=${patched} skipped=${skipped} failed=${failed} total=${results.length}`);
  if (failed) console.log(JSON.stringify(results.filter((r) => r.status === "fail"), null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => die(err.stack || err.message));
