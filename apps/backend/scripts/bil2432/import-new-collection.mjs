#!/usr/bin/env node
// BIL-2432: Import 27 handmade one-off products from photos in
// incoming-assets/neue-kleider-2026-08-01/ into the Live Medusa backend.
//
// Runs OUTSIDE the container (no deploy needed): calls the Admin API against
// https://api.bilulu.de. Requires an admin bearer token — export
// MEDUSA_ADMIN_EMAIL + MEDUSA_ADMIN_PASSWORD or MEDUSA_ADMIN_TOKEN.
//
// Idempotent by handle: skips creation if a product with the same handle
// already exists. Safe to re-run after partial failures.
//
// Usage:
//   MEDUSA_ADMIN_EMAIL=... MEDUSA_ADMIN_PASSWORD=... \
//   node apps/backend/scripts/bil2432/import-new-collection.mjs
//
// Or pass a pre-obtained JWT:
//   MEDUSA_ADMIN_TOKEN=... node apps/backend/scripts/bil2432/import-new-collection.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND = process.env.MEDUSA_BACKEND_URL || "https://api.bilulu.de";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..");
const PHOTOS_DIR = path.resolve(REPO_ROOT, "..", "incoming-assets", "neue-kleider-2026-08-01");
const MANIFEST = path.join(HERE, "products.json");

function log(...a) { console.log("[bil2432]", ...a); }
function die(msg) { console.error("[bil2432] FATAL:", msg); process.exit(1); }

async function jsonFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(`${opts.method || "GET"} ${url} -> ${res.status}: ${JSON.stringify(body).slice(0, 400)}`);
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

async function findExistingByHandle(token, handle) {
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

// Upload a single local file via /admin/uploads (multipart/form-data).
// Returns the uploaded file's public URL (Medusa file-local plugin serves it).
async function uploadFile(token, filePath) {
  const buf = await fs.promises.readFile(filePath);
  const filename = path.basename(filePath).replace(/\s+/g, "_").replace(/[()]/g, "");
  const form = new FormData();
  form.append("files", new Blob([buf], { type: "image/jpeg" }), filename);
  const res = await fetch(`${BACKEND}/admin/uploads`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`upload ${filename} failed: ${res.status}: ${text.slice(0, 300)}`);
  const body = JSON.parse(text);
  const file = body.files?.[0] ?? body.uploads?.[0];
  if (!file?.url) throw new Error(`upload response missing url: ${text.slice(0, 300)}`);
  return file.url.startsWith("http") ? file.url : `${BACKEND}${file.url}`;
}

async function ensureCollection(token, handle, title) {
  const url = new URL(`${BACKEND}/admin/collections`);
  url.searchParams.set("handle", handle);
  const list = await jsonFetch(url.toString(), { headers: { authorization: `Bearer ${token}` } });
  if (list.collections?.[0]) return list.collections[0].id;
  const created = await jsonFetch(`${BACKEND}/admin/collections`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ title, handle }),
  });
  return created.collection.id;
}

// Photo numbers in products.json are 1-based indices into a sorted directory
// listing (same order as `ls`). Resolve to actual filenames.
function buildPhotoIndex() {
  const files = fs.readdirSync(PHOTOS_DIR).sort();
  if (files.length !== 41) log(`WARN: expected 41 photos in ${PHOTOS_DIR}, found ${files.length}`);
  return files;
}

async function createProduct(token, product, imageUrls, ctx) {
  const priceCents = Math.round(product.price_eur * 100);
  const payload = {
    title: product.title,
    handle: product.handle,
    description: product.description,
    status: "published",
    collection_id: ctx.collectionByCategory[product.category],
    sales_channels: [{ id: ctx.salesChannelId }],
    shipping_profile_id: ctx.shippingProfileId,
    thumbnail: imageUrls[0],
    images: imageUrls.map((url) => ({ url })),
    options: [{ title: "Default", values: ["Standard"] }],
    variants: [
      {
        title: "Standard",
        sku: `BIL-2432-${product.handle}`,
        manage_inventory: true,
        options: { Default: "Standard" },
        prices: [{ amount: priceCents, currency_code: "eur" }],
      },
    ],
    metadata: {
      handmade: true,
      material: product.material,
      source_issue: "BIL-2432",
    },
  };
  const created = await jsonFetch(`${BACKEND}/admin/products`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const p = created.product;
  const variant = p.variants[0];

  // Link inventory location + set stock=1
  try {
    const inv = await jsonFetch(`${BACKEND}/admin/inventory-items?sku=${encodeURIComponent(variant.sku)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const item = inv.inventory_items?.[0];
    if (item) {
      await jsonFetch(`${BACKEND}/admin/inventory-items/${item.id}/location-levels`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ location_id: ctx.stockLocationId, stocked_quantity: 1 }),
      }).catch(async (err) => {
        // may already exist -> POST to update
        await jsonFetch(`${BACKEND}/admin/inventory-items/${item.id}/location-levels/${ctx.stockLocationId}`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ stocked_quantity: 1 }),
        }).catch(() => log(`inventory update failed for ${variant.sku}: ${err.message}`));
      });
    }
  } catch (err) {
    log(`inventory link warning for ${product.handle}: ${err.message}`);
  }

  return p;
}

async function main() {
  if (!fs.existsSync(PHOTOS_DIR)) die(`Photos dir not found: ${PHOTOS_DIR}`);
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  log(`Loaded manifest: ${manifest.products.length} products for ${manifest._meta.photo_count} photos.`);

  const token = await getAdminToken();
  log("Admin auth ok.");

  const photoIndex = buildPhotoIndex();
  const salesChannelId = await getDefaultSalesChannelId(token);
  const shippingProfileId = await getShippingProfileId(token);
  const stockLocationId = await getStockLocationId(token);
  log("Sales channel:", salesChannelId, "Shipping profile:", shippingProfileId, "Stock location:", stockLocationId);

  const collectionByCategory = {
    muetzen: await ensureCollection(token, "muetzen", "Mützen"),
    halstuecher: await ensureCollection(token, "halstuecher", "Schals & Halstücher"),
    hosen: await ensureCollection(token, "hosen", "Pumphosen"),
    sets: await ensureCollection(token, "sets", "Sets"),
  };
  log("Collections ready.");

  const ctx = { collectionByCategory, salesChannelId, shippingProfileId, stockLocationId };

  const results = [];
  for (const p of manifest.products) {
    try {
      const existing = await findExistingByHandle(token, p.handle);
      if (existing) {
        log(`SKIP ${p.handle} (exists as ${existing.id})`);
        results.push({ handle: p.handle, status: "skip", id: existing.id });
        continue;
      }
      const localPaths = p.photos.map((n) => path.join(PHOTOS_DIR, photoIndex[n - 1]));
      log(`UPLOAD ${p.handle}: ${localPaths.length} images`);
      const urls = [];
      for (const fp of localPaths) urls.push(await uploadFile(token, fp));
      const created = await createProduct(token, p, urls, ctx);
      log(`OK    ${p.handle} -> ${created.id}`);
      results.push({ handle: p.handle, status: "created", id: created.id, images: urls.length });
    } catch (err) {
      log(`FAIL  ${p.handle}: ${err.message}`);
      results.push({ handle: p.handle, status: "fail", error: err.message });
    }
  }
  console.log(JSON.stringify({ results }, null, 2));
  const failed = results.filter((r) => r.status === "fail").length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => die(err.stack || err.message));
