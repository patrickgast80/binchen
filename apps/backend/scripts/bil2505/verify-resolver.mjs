#!/usr/bin/env node
/**
 * BIL-2505 — Beweis, dass das neue kurz-Produkt genau den kurz-Resolver trifft
 * und den langen NICHT stiehlt, BEVOR es published wird.
 *
 * Zwei Läufe gegen dieselbe Resolver-Logik aus
 * apps/storefront/src/lib/medusa.ts (1:1 nachgebaut):
 *   IST   — heutige Store-API (das kurz-Produkt ist draft, also nicht enthalten)
 *   NACH  — dieselbe Liste + das draft-Produkt (simuliert status=published)
 *
 * Kein Storefront-Deploy nötig: der Resolver liest die Titel zur Laufzeit.
 *
 * Aufruf: node apps/backend/scripts/bil2505/verify-resolver.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../..");
const BACKEND = process.env.MEDUSA_URL || "https://api.bilulu.de";
const HANDLE = "bilulu-pumphose-kurz-konfigurator";

// 1:1 aus medusa.ts
const KURZ = /\bkurz(e|er|es)?\b/i;
const resolveLang = (products) =>
  products.find((p) => /pumphose/i.test(p.title) && /konfigurator/i.test(p.title) && !KURZ.test(p.title)) ??
  products.find((p) => /pumphose/i.test(p.title) && !KURZ.test(p.title)) ??
  products.find((p) => /hose/i.test(p.title) && !KURZ.test(p.title)) ??
  products[0];
const resolveKurz = (products) =>
  products.find((p) => KURZ.test(p.title) && /konfigurator/i.test(p.title)) ??
  products.find((p) => /pumphose/i.test(p.title) && /konfigurator/i.test(p.title));

const vaultValue = (file, key) => {
  const m = new RegExp(`^${key}=(.+)$`, "m").exec(fs.readFileSync(path.join(REPO, file), "utf8"));
  return m ? m[1].trim() : null;
};

async function adminHeaders() {
  const f = "infra/.vault/admin-credentials.env";
  const res = await fetch(`${BACKEND}/auth/user/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: vaultValue(f, "MEDUSA_ADMIN_EMAIL"),
      password: vaultValue(f, "MEDUSA_ADMIN_PASSWORD"),
    }),
  });
  const body = await res.json();
  if (!body.token) throw new Error(`Admin-Login ${res.status}`);
  return { authorization: `Bearer ${body.token}` };
}

const label = (p) => (p ? `${p.title} — ${price(p)}` : "(keins)");
const price = (p) => {
  const cp = p?.variants?.[0]?.calculated_price;
  if (cp) return `${cp.calculated_amount} ${cp.currency_code || "eur"}`;
  const pr = p?.variants?.[0]?.prices?.[0];
  return pr ? `${pr.amount} ${pr.currency_code}` : "?";
};

async function main() {
  const pk = vaultValue("infra/.vault/storefront.env", "MEDUSA_PUBLISHABLE_KEY");
  const storeHeaders = { "x-publishable-api-key": pk };
  const { regions } = await (await fetch(`${BACKEND}/store/regions`, { headers: storeHeaders })).json();
  const regionId = regions[0].id;

  const url = new URL(`${BACKEND}/store/products`);
  url.searchParams.set("limit", "50");
  url.searchParams.set("region_id", regionId);
  url.searchParams.set("fields", "*variants.calculated_price");
  const { products } = await (await fetch(url, { headers: storeHeaders })).json();

  const draft = (
    await (
      await fetch(
        `${BACKEND}/admin/products?handle=${HANDLE}&limit=1&fields=id,title,handle,status,*variants,*variants.prices`,
        { headers: await adminHeaders() },
      )
    ).json()
  ).products?.[0];

  const after = draft ? [...products, draft] : products;

  const report = {
    generated_by: "apps/backend/scripts/bil2505/verify-resolver.mjs",
    backend: BACKEND,
    region: regionId,
    store_product_count: products.length,
    draft_product: draft
      ? { id: draft.id, title: draft.title, status: draft.status, price: price(draft) }
      : null,
    ist: {
      lang: label(resolveLang(products)),
      kurz: label(resolveKurz(products)),
    },
    nach_publish: {
      lang: label(resolveLang(after)),
      kurz: label(resolveKurz(after)),
    },
  };

  report.checks = {
    kurz_faellt_heute_auf_lange_basis: report.ist.kurz === report.ist.lang,
    lang_bleibt_nach_publish_unveraendert: report.nach_publish.lang === report.ist.lang,
    kurz_greift_nach_publish_neues_produkt:
      !!draft && report.nach_publish.kurz.startsWith(draft.title),
    draft_ist_nicht_in_store_api: !products.some((p) => KURZ.test(p.title) && /konfigurator/i.test(p.title)),
  };
  report.pass = Object.values(report.checks).every(Boolean);

  const out = path.join(REPO, "apps/backend/scripts/bil2505/verify-resolver-report.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(report.pass ? "\nPASS" : "\nFAIL");
  process.exit(report.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e.stack || String(e));
  process.exit(1);
});
