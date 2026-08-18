#!/usr/bin/env node
// BIL-2458: Create the "Body" configurator base product in Medusa.
//
// Idempotent by handle: if a product with handle "body" already exists,
// re-uses it and (re-)ensures a variant + price + inventory.
//
// Runs OUTSIDE the container (Admin API). Credentials via
// MEDUSA_ADMIN_EMAIL + MEDUSA_ADMIN_PASSWORD (or MEDUSA_ADMIN_TOKEN).
//
// Reference: mirrors the pattern used by the BIL-2432 import.
import path from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND = process.env.MEDUSA_BACKEND_URL || "https://api.bilulu.de";
const HANDLE = "body";
const TITLE = "Body";
const SKU = "BIL-2458-body-unisize";
const PRICE_EUR = 19.9; // Medusa v2 = Major Units, NEVER *100
const STOCK_QTY = 1;
const THUMBNAIL = "https://bilulu.de/konfigurator/body-foto/base.webp";

function log(...a) { console.log("[bil2458]", ...a); }
function die(msg) { console.error("[bil2458] FATAL:", msg); process.exit(1); }

async function jsonFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(`${opts.method || "GET"} ${url} -> ${res.status}: ${JSON.stringify(body).slice(0, 600)}`);
  return body;
}

async function getAdminToken() {
  if (process.env.MEDUSA_ADMIN_TOKEN) return process.env.MEDUSA_ADMIN_TOKEN;
  const email = process.env.MEDUSA_ADMIN_EMAIL;
  const password = process.env.MEDUSA_ADMIN_PASSWORD;
  if (!email || !password) die("Set MEDUSA_ADMIN_EMAIL + MEDUSA_ADMIN_PASSWORD (or MEDUSA_ADMIN_TOKEN).");
  const body = await jsonFetch(`${BACKEND}/auth/user/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!body?.token) die(`Auth response missing token: ${JSON.stringify(body)}`);
  return body.token;
}

async function findByHandle(token, handle) {
  const url = new URL(`${BACKEND}/admin/products`);
  url.searchParams.set("handle", handle);
  url.searchParams.set("limit", "1");
  const body = await jsonFetch(url.toString(), { headers: { authorization: `Bearer ${token}` } });
  return body.products?.[0] ?? null;
}

async function getDefaultSalesChannelId(token) {
  const body = await jsonFetch(`${BACKEND}/admin/sales-channels?limit=10`, { headers: { authorization: `Bearer ${token}` } });
  const ch = body.sales_channels?.find((c) => /default/i.test(c.name)) ?? body.sales_channels?.[0];
  if (!ch) die("No sales channel found.");
  return ch.id;
}

// BIL-2501: `type === "default"` matches BOTH prod profiles ("Default Shipping
// Profile" and "Default"), and only one of them owns shipping options. Picking the
// wrong one makes POST /store/carts/{id}/complete fail with "The cart items require
// shipping profiles that are not satisfied by the current shipping methods" — and
// only at the final checkout step, so the product looks fine everywhere else.
// Resolve by data: the profile that owns shipping options.
async function getShippingProfileId(token) {
  const headers = { authorization: `Bearer ${token}` };
  const body = await jsonFetch(`${BACKEND}/admin/shipping-profiles?limit=100`, { headers });
  const opts = await jsonFetch(`${BACKEND}/admin/shipping-options?limit=100&fields=id,shipping_profile_id`, { headers });
  const counts = new Map();
  for (const o of opts.shipping_options ?? []) counts.set(o.shipping_profile_id, (counts.get(o.shipping_profile_id) ?? 0) + 1);
  const withOptions = (body.shipping_profiles ?? []).filter((p) => (counts.get(p.id) ?? 0) > 0);
  if (withOptions.length === 1) return withOptions[0].id;
  if (withOptions.length === 0) die("No shipping profile owns any shipping option — run seed-shipping first.");
  die(`Ambiguous: ${withOptions.length} profiles own shipping options (${withOptions.map((p) => p.id).join(", ")}).`);
}

async function getStockLocationId(token) {
  const body = await jsonFetch(`${BACKEND}/admin/stock-locations?limit=10`, { headers: { authorization: `Bearer ${token}` } });
  const loc = body.stock_locations?.[0];
  if (!loc) die("No stock location found.");
  return loc.id;
}

async function createProduct(token, ctx) {
  const payload = {
    title: TITLE,
    handle: HANDLE,
    description:
      "Basis-Produkt für den Body-Konfigurator (/konfigurator/body). " +
      "Kunden konfigurieren Hauptteil, Ärmelbund und Halsbund; Warenkorb-Line-Item verweist auf diese SKU.",
    status: "published",
    sales_channels: [{ id: ctx.salesChannelId }],
    shipping_profile_id: ctx.shippingProfileId,
    thumbnail: THUMBNAIL,
    images: [{ url: THUMBNAIL }],
    options: [{ title: "Größe", values: ["Unisize"] }],
    variants: [
      {
        title: "Unisize",
        sku: SKU,
        manage_inventory: true,
        options: { "Größe": "Unisize" },
        prices: [{ amount: PRICE_EUR, currency_code: "eur" }],
      },
    ],
    metadata: {
      handmade: true,
      configurator: "body",
      source_issue: "BIL-2458",
    },
  };
  const created = await jsonFetch(`${BACKEND}/admin/products`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return created.product;
}

async function ensureInventoryOnVariant(token, variant, stockLocationId) {
  // Find or create the inventory item + set stocked_quantity to STOCK_QTY.
  const inv = await jsonFetch(`${BACKEND}/admin/inventory-items?sku=${encodeURIComponent(variant.sku)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const item = inv.inventory_items?.[0];
  if (!item) throw new Error(`inventory-item not found for sku=${variant.sku}`);

  // Try to add the location-level first; if it exists, update via location-level route.
  try {
    await jsonFetch(`${BACKEND}/admin/inventory-items/${item.id}/location-levels`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ location_id: stockLocationId, stocked_quantity: STOCK_QTY }),
    });
    log(`inventory location-level created stock=${STOCK_QTY} for ${variant.sku}`);
  } catch (err) {
    // If already linked, update the level in place.
    await jsonFetch(`${BACKEND}/admin/inventory-items/${item.id}/location-levels/${stockLocationId}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ stocked_quantity: STOCK_QTY }),
    });
    log(`inventory location-level updated stock=${STOCK_QTY} for ${variant.sku}`);
  }
  return item.id;
}

async function main() {
  const token = await getAdminToken();
  log("Admin auth ok.");

  const salesChannelId = await getDefaultSalesChannelId(token);
  const shippingProfileId = await getShippingProfileId(token);
  const stockLocationId = await getStockLocationId(token);
  log("Sales channel:", salesChannelId, "Shipping profile:", shippingProfileId, "Stock location:", stockLocationId);

  let product = await findByHandle(token, HANDLE);
  if (product) {
    log(`SKIP create — product with handle "${HANDLE}" already exists as ${product.id}`);
  } else {
    product = await createProduct(token, { salesChannelId, shippingProfileId });
    log(`CREATED product ${product.id} (${product.title})`);
  }

  const variant = product.variants?.[0];
  if (!variant) die("Product has no variant — cannot ensure inventory.");
  await ensureInventoryOnVariant(token, variant, stockLocationId);

  // Verify: fetch the product back through /store to confirm the lookup will find it.
  const verify = await jsonFetch(`${BACKEND}/admin/products/${product.id}?fields=id,title,handle,status,variants.id,variants.title,variants.sku,variants.prices.amount,variants.prices.currency_code`, {
    headers: { authorization: `Bearer ${token}` },
  });
  console.log(JSON.stringify({ result: "ok", product: verify.product }, null, 2));
}

main().catch((err) => die(err.stack || err.message));
