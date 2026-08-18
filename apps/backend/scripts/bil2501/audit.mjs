// BIL-2501 — Audit: which shipping profile does every product hang on, and which
// profile actually owns shipping options?
//
// Read-only. Prints a table + writes audit-results.json next to this script.
//
// Run:
//   set -a; . infra/.vault/admin-credentials.env; set +a
//   node apps/backend/scripts/bil2501/audit.mjs
import { writeFileSync } from "node:fs";
import { BACKEND, jsonFetch, login } from "../bil2490/lib.mjs";

const OUT = new URL("./audit-results.json", import.meta.url);

export async function collect(token) {
  const headers = { authorization: `Bearer ${token}` };

  const { shipping_profiles: profiles } = await jsonFetch(
    `${BACKEND}/admin/shipping-profiles?limit=100`, { headers });

  const { shipping_options: options } = await jsonFetch(
    `${BACKEND}/admin/shipping-options?limit=100&fields=id,name,shipping_profile_id`, { headers });

  const optionsByProfile = new Map();
  for (const o of options) {
    if (!optionsByProfile.has(o.shipping_profile_id)) optionsByProfile.set(o.shipping_profile_id, []);
    optionsByProfile.get(o.shipping_profile_id).push({ id: o.id, name: o.name });
  }

  const products = [];
  for (let offset = 0; ; offset += 100) {
    const page = await jsonFetch(
      `${BACKEND}/admin/products?limit=100&offset=${offset}&fields=id,title,handle,status,shipping_profile.id,shipping_profile.name`,
      { headers });
    products.push(...page.products);
    if (products.length >= page.count) break;
  }

  const normalizeProfile = (p) => {
    const sp = p?.shipping_profile;
    if (!sp) return null;
    if (Array.isArray(sp)) return sp[0] ?? null;
    return sp;
  };

  return { profiles, options, optionsByProfile, products, normalizeProfile };
}

async function main() {
  const token = await login();
  const { profiles, options, optionsByProfile, products, normalizeProfile } = await collect(token);

  console.log(`\n=== Shipping profiles (${profiles.length}) ===`);
  for (const p of profiles) {
    const opts = optionsByProfile.get(p.id) ?? [];
    console.log(`  ${p.id}  type=${p.type.padEnd(8)} name="${p.name}"  options=${opts.length} [${opts.map((o) => o.name).join(", ")}]`);
  }

  const rows = products.map((p) => {
    const sp = normalizeProfile(p);
    return {
      id: p.id, title: p.title, handle: p.handle, status: p.status,
      profile_id: sp?.id ?? null, profile_name: sp?.name ?? null,
      option_count: sp ? (optionsByProfile.get(sp.id) ?? []).length : 0,
    };
  });

  console.log(`\n=== Products (${rows.length}) ===`);
  for (const r of rows) {
    const flag = r.option_count > 0 ? "OK    " : "BROKEN";
    console.log(`  ${flag} ${r.id}  ${r.status.padEnd(9)} ${String(r.profile_name).padEnd(24)} ${r.title}`);
  }

  const broken = rows.filter((r) => r.option_count === 0);
  console.log(`\n=== Summary ===`);
  console.log(`  products total          : ${rows.length}`);
  console.log(`  checkout-capable        : ${rows.length - broken.length}`);
  console.log(`  BROKEN (no option)      : ${broken.length}`);

  writeFileSync(OUT, JSON.stringify({
    generated_at: new Date().toISOString(),
    profiles: profiles.map((p) => ({
      id: p.id, name: p.name, type: p.type,
      options: optionsByProfile.get(p.id) ?? [],
    })),
    shipping_options: options.map((o) => ({ id: o.id, name: o.name, shipping_profile_id: o.shipping_profile_id })),
    products: rows,
    broken_product_ids: broken.map((r) => r.id),
  }, null, 2));
  console.log(`\n  wrote ${OUT.pathname}`);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1].includes("audit.mjs")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
