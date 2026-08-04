#!/usr/bin/env node
// BIL-2449: For every product created by BIL-2432, upload the normalized versions of its
// photos and PATCH the product so its thumbnail + images point at the new URLs. The old
// files stay on disk (Medusa doesn't garbage-collect uploads) but no product references
// them any longer.
//
// Pre-req: normalized photos already generated at
//   incoming-assets/neue-kleider-2026-08-01-normalized/photo-NN.jpg
// via `apps/storefront/scripts/bil2449-normalize-photos.mjs`.
//
// Usage:
//   MEDUSA_ADMIN_EMAIL=... MEDUSA_ADMIN_PASSWORD=... \
//   node apps/backend/scripts/bil2432/replace-images-with-normalized.mjs [--only=handle1,handle2] [--dry-run]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND = process.env.MEDUSA_BACKEND_URL || "https://api.bilulu.de";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..");
const NORMALIZED_DIR = path.resolve(REPO_ROOT, "..", "incoming-assets", "neue-kleider-2026-08-01-normalized");
const MANIFEST = path.join(HERE, "products.json");

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const onlyArg = argv.find((a) => a.startsWith("--only="));
const onlyHandles = onlyArg ? new Set(onlyArg.slice(7).split(",")) : null;

const log = (...a) => console.log("[bil2449]", ...a);
const die = (m) => { console.error("[bil2449] FATAL:", m); process.exit(1); };

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

async function uploadFile(token, filePath) {
  const buf = await fs.promises.readFile(filePath);
  const filename = path.basename(filePath);
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

async function updateProductImages(token, productId, imageUrls) {
  const payload = {
    thumbnail: imageUrls[0],
    images: imageUrls.map((url) => ({ url })),
  };
  return jsonFetch(`${BACKEND}/admin/products/${productId}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function main() {
  if (!fs.existsSync(NORMALIZED_DIR)) die(`Normalized dir not found: ${NORMALIZED_DIR}`);
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  log(`Loaded manifest: ${manifest.products.length} products.`);

  const token = await getAdminToken();
  log("Admin auth ok.");

  const results = [];
  for (const p of manifest.products) {
    if (onlyHandles && !onlyHandles.has(p.handle)) continue;
    try {
      const existing = await findExistingByHandle(token, p.handle);
      if (!existing) {
        log(`SKIP ${p.handle} (product not found — nothing to update)`);
        results.push({ handle: p.handle, status: "skip-not-found" });
        continue;
      }
      const localPaths = p.photos.map((n) => path.join(NORMALIZED_DIR, `photo-${String(n).padStart(2, "0")}.jpg`));
      for (const fp of localPaths) if (!fs.existsSync(fp)) throw new Error(`missing normalized: ${fp}`);
      log(`REPLACE ${p.handle} (${existing.id}) with ${localPaths.length} new images${dryRun ? " [DRY-RUN]" : ""}`);
      if (dryRun) {
        results.push({ handle: p.handle, status: "dry-run", images: localPaths.length });
        continue;
      }
      const urls = [];
      for (const fp of localPaths) urls.push(await uploadFile(token, fp));
      await updateProductImages(token, existing.id, urls);
      log(`OK    ${p.handle}: ${urls[0]}`);
      results.push({ handle: p.handle, status: "updated", id: existing.id, images: urls.length, thumbnail: urls[0] });
    } catch (err) {
      log(`FAIL  ${p.handle}: ${err.message}`);
      results.push({ handle: p.handle, status: "fail", error: err.message });
    }
  }
  const outFile = path.join(HERE, `bil2449-replace-results-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ results }, null, 2));
  log(`Results -> ${outFile}`);
  const failed = results.filter((r) => r.status === "fail").length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
