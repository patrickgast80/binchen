// BIL-2501 — End-to-end proof against LIVE bilulu.de: a Unikat (stock=1) can now
// complete checkout. Replays exactly QA's repro from the ticket:
//   cart -> line-item -> address -> shipping-option -> payment-collection/session -> complete
// Before the fix step 6 returned 400 "The cart items require shipping profiles that
// are not satisfied by the current shipping methods".
//
// Cleanup: the resulting order is CANCELLED at the end (same as QA did on their
// control test) and the variant's inventory is re-checked, so the Unikat stays
// sellable and BIL-2500's race test still has stock to work with.
//
// Vorkasse only (pp_system_default) — no card/PayPal call, nothing charged.
//
// Run:
//   set -a; . infra/.vault/admin-credentials.env; set +a
//   node apps/backend/scripts/bil2501/verify-checkout.mjs
import { writeFileSync } from "node:fs";
import { BACKEND, jsonFetch, login } from "../bil2490/lib.mjs";

// Publishable key — designed for browser exposure (NEXT_PUBLIC_*), not a secret.
const PK = process.env.MEDUSA_PUBLISHABLE_KEY
  || "pk_5f4df48ccb4a5a3843410089661e694c74f1db2458ed07e1d94bfd449b14c50f";
const STORE_HEADERS = { "content-type": "application/json", "x-publishable-api-key": PK };

// Pumphose "Eukalyptus" creme — the exact variant QA could NOT check out (ticket step 1).
const VARIANT = process.env.BIL2501_VARIANT || "variant_01KZ0VZSX50NT8TGWTQ1Y2P48M";

const OUT = new URL("./verify-checkout-results.json", import.meta.url);
const log = [];
const step = (name, detail) => {
  console.log(`\n=== ${name} ===`);
  console.log(JSON.stringify(detail, null, 2).slice(0, 900));
  log.push({ name, detail });
};

async function store(path, opts = {}) {
  const res = await fetch(`${BACKEND}${path}`, { ...opts, headers: { ...STORE_HEADERS, ...opts.headers } });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

// Stock is read from the ADMIN inventory levels, never from the Store API:
// /store/products reports a stale/derived inventory_quantity and is not authoritative.
async function inventoryOf(token, variantId) {
  const headers = { authorization: `Bearer ${token}` };
  // The admin product list has no variant_id filter — page it and match locally.
  let variant = null;
  for (let offset = 0; !variant; offset += 100) {
    const page = await jsonFetch(
      `${BACKEND}/admin/products?limit=100&offset=${offset}&fields=id,*variants,*variants.inventory_items`,
      { headers });
    variant = page.products.flatMap((p) => p.variants ?? []).find((v) => v.id === variantId) ?? null;
    if (!variant && offset + 100 >= page.count) break;
  }
  const invItemId = variant?.inventory_items?.[0]?.inventory_item_id;
  if (!invItemId) return { variantId, note: "no inventory item resolved" };
  // NOTE: the endpoint is /location-levels but the payload key is `inventory_levels`.
  const lvl = await jsonFetch(`${BACKEND}/admin/inventory-items/${invItemId}/location-levels`, { headers });
  const l = lvl?.inventory_levels?.[0];
  return {
    variantId, sku: variant?.sku, inventory_item_id: invItemId,
    stocked_quantity: l?.stocked_quantity, reserved_quantity: l?.reserved_quantity,
    available_quantity: l?.available_quantity,
  };
}

async function main() {
  const token = await login();

  step("0. inventory BEFORE", await inventoryOf(token, VARIANT));

  // 1. cart + line item
  const regions = await store("/store/regions");
  const region = regions.body.regions.find((r) => r.name === "DE") ?? regions.body.regions[0];
  const cartRes = await store("/store/carts", {
    method: "POST",
    body: JSON.stringify({ region_id: region.id, email: "bil2501-backend-verify@bilulu.de" }),
  });
  const cartId = cartRes.body.cart.id;
  const add = await store(`/store/carts/${cartId}/line-items`, {
    method: "POST", body: JSON.stringify({ variant_id: VARIANT, quantity: 1 }),
  });
  step("1. cart + line-item", {
    region: region.name, cartId, status: add.status,
    item: add.body?.cart?.items?.[0]?.title, qty: add.body?.cart?.items?.[0]?.quantity,
  });
  if (!add.ok) throw new Error(`line-item add failed: ${JSON.stringify(add.body)}`);

  // 2. address
  const addr = {
    first_name: "BIL2501", last_name: "Verify", address_1: "Teststr. 1",
    city: "Haßloch", postal_code: "67454", country_code: "de",
  };
  const withAddr = await store(`/store/carts/${cartId}`, {
    method: "POST", body: JSON.stringify({ shipping_address: addr, billing_address: addr }),
  });
  step("2. addresses set", { status: withAddr.status, ok: withAddr.ok });

  // 3. shipping option + method
  const opts = await store(`/store/shipping-options?cart_id=${cartId}`);
  const chosen = opts.body?.shipping_options?.find((o) => o.name === "Standard DE")
    ?? opts.body?.shipping_options?.[0];
  step("3. shipping options offered", {
    status: opts.status,
    offered: opts.body?.shipping_options?.map((o) => ({ id: o.id, name: o.name })),
    chosen: chosen && { id: chosen.id, name: chosen.name },
  });
  const method = await store(`/store/carts/${cartId}/shipping-methods`, {
    method: "POST", body: JSON.stringify({ option_id: chosen.id }),
  });
  step("4. shipping method attached", { status: method.status, ok: method.ok });

  // 4. payment collection + Vorkasse session
  const pc = await store("/store/payment-collections", {
    method: "POST", body: JSON.stringify({ cart_id: cartId }),
  });
  const sess = await store(`/store/payment-collections/${pc.body.payment_collection.id}/payment-sessions`, {
    method: "POST", body: JSON.stringify({ provider_id: "pp_system_default" }),
  });
  step("5. payment session (Vorkasse)", {
    pcStatus: pc.status, sessStatus: sess.status,
    provider: sess.body?.payment_collection?.payment_sessions?.[0]?.provider_id,
  });

  // 5. THE assertion — this is what returned 400 before the fix.
  const complete = await store(`/store/carts/${cartId}/complete`, { method: "POST" });
  const order = complete.body?.order;
  step("6. POST /store/carts/{id}/complete  <-- was 400 before fix", {
    status: complete.status,
    type: complete.body?.type ?? null,
    message: complete.body?.message ?? null,
    order_id: order?.id ?? null,
    order_total: order?.total ?? null,
    shipping_total: order?.shipping_total ?? null,
  });

  const passed = complete.status === 200 && !!order?.id;

  // 6. cleanup — cancel the order so the Unikat stays sellable for BIL-2500.
  let cancel = null;
  if (order?.id) {
    cancel = await jsonFetch(`${BACKEND}/admin/orders/${order.id}/cancel`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    }).catch((e) => ({ error: String(e).slice(0, 300) }));
    step("7. cleanup: order cancelled", { order_id: order.id, status: cancel?.order?.status ?? cancel });
  }

  step("8. inventory AFTER cleanup", await inventoryOf(token, VARIANT));

  writeFileSync(OUT, JSON.stringify({
    generated_at: new Date().toISOString(), variant: VARIANT, cart_id: cartId,
    passed, order_id: order?.id ?? null, log,
  }, null, 2));

  console.log(`\n\n${passed ? "PASS" : "FAIL"} — complete returned ${complete.status}`);
  console.log(`wrote ${OUT.pathname}`);
  if (!passed) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
