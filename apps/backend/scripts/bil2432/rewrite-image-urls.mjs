#!/usr/bin/env node
// BIL-2434 helper — after the /static route + backend_url fix is deployed,
// rewrite existing BIL-2432 product image URLs from
//   https://api-staging.bilulu.de/<file>
// to
//   https://api.bilulu.de/static/<file>
//
// Idempotent: skips products whose URLs already point at the target host+prefix.
// Runs OUTSIDE the container against the Live Admin API. Requires either
// MEDUSA_ADMIN_TOKEN or MEDUSA_ADMIN_EMAIL + MEDUSA_ADMIN_PASSWORD in env.
//
// Usage:
//   MEDUSA_ADMIN_EMAIL=... MEDUSA_ADMIN_PASSWORD=... \
//   node apps/backend/scripts/bil2432/rewrite-image-urls.mjs
//
// Optional env:
//   FROM_HOST=api-staging.bilulu.de   (source host to rewrite; default value)
//   TO_HOST=api.bilulu.de              (target host; default value)
//   TO_PREFIX=/static                  (prefix appended after host; default "/static")
//   MEDUSA_BACKEND_URL=https://api.bilulu.de (admin API base)
//   DRY_RUN=true                       (list rewrites without PATCHing)

const BACKEND = process.env.MEDUSA_BACKEND_URL || "https://api.bilulu.de";
const FROM_HOST = process.env.FROM_HOST || "api-staging.bilulu.de";
const TO_HOST = process.env.TO_HOST || "api.bilulu.de";
const TO_PREFIX = process.env.TO_PREFIX || "/static";
const DRY_RUN = process.env.DRY_RUN === "true";

function log(...a) { console.log("[bil2434-rewrite]", ...a); }
function die(msg) { console.error("[bil2434-rewrite] FATAL:", msg); process.exit(1); }

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

// Rewrite one URL. Returns the (possibly unchanged) string.
// Handles both `https://<FROM_HOST>/<file>` and `https://<FROM_HOST>/static/<file>` inputs;
// output is always `https://<TO_HOST><TO_PREFIX>/<file>`.
function rewriteUrl(u) {
  if (typeof u !== "string" || !u) return u;
  try {
    const parsed = new URL(u);
    if (parsed.hostname !== FROM_HOST) return u;
    // Strip any leading /static (or configured prefix) so we don't end up with /static/static.
    let filePath = parsed.pathname;
    if (filePath.startsWith(`${TO_PREFIX}/`)) filePath = filePath.slice(TO_PREFIX.length);
    if (!filePath.startsWith("/")) filePath = `/${filePath}`;
    return `https://${TO_HOST}${TO_PREFIX}${filePath}`;
  } catch {
    return u;
  }
}

async function listAllBil2432Products(token) {
  // Prefer metadata filter; fall back to full scan if the backend doesn't support it.
  const all = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const body = await jsonFetch(`${BACKEND}/admin/products?limit=${limit}&offset=${offset}&fields=id,handle,thumbnail,metadata,images.id,images.url`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const batch = body.products || [];
    all.push(...batch);
    if (batch.length < limit) break;
    offset += batch.length;
  }
  return all.filter((p) => {
    const src = p.metadata?.source_issue;
    if (src === "BIL-2432") return true;
    const thumbHit = typeof p.thumbnail === "string" && p.thumbnail.includes(FROM_HOST);
    const imgHit = (p.images || []).some((i) => typeof i.url === "string" && i.url.includes(FROM_HOST));
    return thumbHit || imgHit;
  });
}

async function rewriteProduct(token, product) {
  const oldThumb = product.thumbnail || null;
  const newThumb = rewriteUrl(oldThumb);
  const oldImages = (product.images || []).map((i) => i.url);
  const newImages = oldImages.map(rewriteUrl);
  const changed = newThumb !== oldThumb || newImages.some((u, i) => u !== oldImages[i]);
  if (!changed) return { handle: product.handle, status: "skip" };

  if (DRY_RUN) {
    return {
      handle: product.handle,
      status: "would-rewrite",
      thumbnail: { from: oldThumb, to: newThumb },
      images: oldImages.map((u, i) => ({ from: u, to: newImages[i] })),
    };
  }

  const payload = {
    thumbnail: newThumb,
    images: newImages.map((url) => ({ url })),
  };
  await jsonFetch(`${BACKEND}/admin/products/${product.id}`, {
    method: "POST", // Medusa v2 admin uses POST /admin/products/:id for updates
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return {
    handle: product.handle,
    status: "rewritten",
    thumbnail: { from: oldThumb, to: newThumb },
    imageCount: newImages.length,
  };
}

async function main() {
  const token = await getAdminToken();
  log(`Auth ok. FROM_HOST=${FROM_HOST} TO_HOST=${TO_HOST} TO_PREFIX=${TO_PREFIX} DRY_RUN=${DRY_RUN}`);

  const products = await listAllBil2432Products(token);
  log(`Candidates to consider: ${products.length}`);

  const results = [];
  for (const p of products) {
    try {
      const r = await rewriteProduct(token, p);
      results.push(r);
      log(`${r.status.padEnd(14)} ${p.handle}`);
    } catch (err) {
      log(`FAIL ${p.handle}: ${err.message}`);
      results.push({ handle: p.handle, status: "fail", error: err.message });
    }
  }
  console.log(JSON.stringify({ backend: BACKEND, from: FROM_HOST, to: `${TO_HOST}${TO_PREFIX}`, dryRun: DRY_RUN, results }, null, 2));
  const failed = results.filter((r) => r.status === "fail").length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => die(err.stack || err.message));
