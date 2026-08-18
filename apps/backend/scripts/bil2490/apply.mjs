#!/usr/bin/env node
// BIL-2490 — Shop-Relaunch: Sabines freigestellte Fotos auf die Live-Produkte anwenden.
//
// Board-Freigabe: BIL-1 Kommentar 0ca66cb0 (2026-08-17, CEO).
//   - 14 bestehende Produkte: Bilder ERSETZEN (Preise/Handles/SEO bleiben)
//   - Gruppen 3 und 8 werden vom Einzelteil zum Set (Titel + Preis)
//   - Gruppe 15 neu anlegen (Bestand 1, Unikat)
//   - Löschen alter Produkte ist NICHT Teil dieses Skripts (kommt zuletzt, eigener Schritt)
//
// Idempotenz: die Uploads werden in uploads.json protokolliert (sha256 der Datei -> URL).
// Ein zweiter Lauf lädt nichts erneut hoch und schreibt dieselben URLs -- der PATCH ist
// damit ein No-Op statt einer Dublettenspur im Bind-Mount.
//
// Usage:
//   set -a; . infra/.vault/admin-credentials.env; set +a
//   node apps/backend/scripts/bil2490/apply.mjs            # dry run (default)
//   APPLY=true node apps/backend/scripts/bil2490/apply.mjs # schreibt wirklich

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { BACKEND, jsonFetch, login, resolveShippingProfileId } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../..");
const PHOTOS_DIR = path.join(REPO, "assets/bil2490/normalized");
const MAPPING = path.join(HERE, "mapping.json");
const UPLOADS_LOG = path.join(HERE, "uploads.json");
const RESULTS_LOG = path.join(HERE, "apply-results.json");
const APPLY = process.env.APPLY === "true";

const log = (...a) => console.log("[bil2490]", ...a);

function photoFiles() {
  const files = fs.readdirSync(PHOTOS_DIR).filter((f) => f.endsWith(".jpg")).sort();
  if (files.length !== 21) throw new Error(`expected 21 photos in ${PHOTOS_DIR}, found ${files.length}`);
  return files;
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

// Upload once per file content. The hash is the idempotency key: same bytes -> same URL.
async function uploadPhoto(token, file, uploads) {
  const abs = path.join(PHOTOS_DIR, file);
  const hash = sha256(abs);
  if (uploads[hash]?.url) return uploads[hash].url;
  if (!APPLY) return `<dry-run-upload:${file}>`;

  const form = new FormData();
  form.append("files", new Blob([fs.readFileSync(abs)], { type: "image/jpeg" }), `bil2490-${file}`);
  const res = await fetch(`${BACKEND}/admin/uploads`, {
    method: "POST", headers: { authorization: `Bearer ${token}` }, body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`upload ${file} -> ${res.status}: ${text.slice(0, 300)}`);
  const entry = (JSON.parse(text).files ?? JSON.parse(text).uploads)?.[0];
  const url = entry.url.startsWith("http") ? entry.url : `${BACKEND}${entry.url}`;
  uploads[hash] = { file, url, uploaded_at: new Date().toISOString() };
  fs.writeFileSync(UPLOADS_LOG, JSON.stringify(uploads, null, 2));
  log(`uploaded ${file} -> ${url}`);
  return url;
}

async function updateProduct(token, id, payload) {
  if (!APPLY) return { dry_run: true, id, payload };
  return jsonFetch(`${BACKEND}/admin/products/${id}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// Medusa v2 prices are MAJOR units. 24.9 == 24,90 EUR. Never *100.
async function updatePrice(token, productId, variantId, priceEur) {
  if (!APPLY) return { dry_run: true, variantId, priceEur };
  return jsonFetch(`${BACKEND}/admin/products/${productId}/variants/${variantId}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ prices: [{ amount: priceEur, currency_code: "eur" }] }),
  });
}

async function ensureStockOne(token, sku, locationId) {
  const inv = await jsonFetch(`${BACKEND}/admin/inventory-items?sku=${encodeURIComponent(sku)}`,
    { headers: { authorization: `Bearer ${token}` } });
  const item = inv.inventory_items?.[0];
  if (!item) { log(`WARN no inventory item for sku ${sku}`); return; }
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  try {
    await jsonFetch(`${BACKEND}/admin/inventory-items/${item.id}/location-levels`, {
      method: "POST", headers, body: JSON.stringify({ location_id: locationId, stocked_quantity: 1 }),
    });
  } catch {
    // level already exists -> update it instead
    await jsonFetch(`${BACKEND}/admin/inventory-items/${item.id}/location-levels/${locationId}`, {
      method: "POST", headers, body: JSON.stringify({ stocked_quantity: 1 }),
    });
  }
}

async function createProduct(token, group, imageUrls, ctx) {
  const c = group.create;
  const payload = {
    title: c.title, handle: c.handle, description: c.description, status: "published",
    collection_id: c.collection_id,
    sales_channels: [{ id: ctx.salesChannelId }],
    shipping_profile_id: ctx.shippingProfileId,
    thumbnail: imageUrls[0],
    images: imageUrls.map((url) => ({ url })),
    options: [{ title: "Default", values: ["Standard"] }],
    variants: [{
      title: "Standard", sku: c.sku, manage_inventory: true,
      options: { Default: "Standard" },
      prices: [{ amount: c.price_eur, currency_code: "eur" }],
    }],
    metadata: c.metadata,
  };
  if (!APPLY) return { dry_run: true, payload };
  const created = await jsonFetch(`${BACKEND}/admin/products`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  await ensureStockOne(token, c.sku, ctx.stockLocationId);
  return created.product;
}

async function main() {
  const mapping = JSON.parse(fs.readFileSync(MAPPING, "utf8"));
  const files = photoFiles();
  const uploads = readJson(UPLOADS_LOG, {});
  const token = await login();
  log(`admin auth ok -> ${BACKEND}${APPLY ? "" : "  (DRY RUN -- set APPLY=true to write)"}`);

  const headers = { authorization: `Bearer ${token}` };
  const ctx = {
    salesChannelId: (await jsonFetch(`${BACKEND}/admin/sales-channels?limit=1`, { headers })).sales_channels[0].id,
    // BIL-2501: was `shipping-profiles?limit=1` — that picked the option-less
    // "Default Shipping Profile" and left all 15 new products uncheckoutable.
    shippingProfileId: await resolveShippingProfileId(token),
    stockLocationId: (await jsonFetch(`${BACKEND}/admin/stock-locations?limit=1`, { headers })).stock_locations[0].id,
  };

  const results = [];
  for (const g of mapping.groups) {
    const groupFiles = g.photos.map((n) => files[n - 1]);
    const urls = [];
    for (const f of groupFiles) urls.push(await uploadPhoto(token, f, uploads));

    if (!g.product_id) {
      const created = await createProduct(token, g, urls, ctx);
      results.push({ n: g.n, action: "create", label: g.label, id: created?.id ?? null, urls });
      log(`#${g.n} CREATE ${g.label} -> ${created?.id ?? "(dry run)"}`);
      continue;
    }

    const payload = { thumbnail: urls[0], images: urls.map((url) => ({ url })) };
    if (g.title) payload.title = g.title;
    if (g.description) payload.description = g.description;
    await updateProduct(token, g.product_id, payload);

    let priceNote = null;
    if (g.price_eur != null) {
      const p = (await jsonFetch(
        `${BACKEND}/admin/products/${g.product_id}?fields=*variants,*variants.prices`, { headers })).product;
      const v = p.variants[0];
      await updatePrice(token, g.product_id, v.id, g.price_eur);
      priceNote = `${v.prices.find((x) => x.currency_code === "eur")?.amount} -> ${g.price_eur}`;
    }
    results.push({ n: g.n, action: "replace", label: g.label, id: g.product_id, urls, title: g.title ?? null, price: priceNote });
    log(`#${g.n} REPLACE ${g.label} (${urls.length} Bild(er))${priceNote ? ` price ${priceNote}` : ""}`);
  }

  fs.writeFileSync(RESULTS_LOG, JSON.stringify({ applied: APPLY, at: new Date().toISOString(), results }, null, 2));
  log(`done -- ${results.length} Gruppen, Protokoll in ${path.relative(REPO, RESULTS_LOG)}`);
}

main().catch((err) => { console.error("[bil2490] FATAL:", err.message); process.exit(1); });
