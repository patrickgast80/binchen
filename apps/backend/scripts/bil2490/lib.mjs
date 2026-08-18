// BIL-2490 shared helpers: live Medusa v2 Admin API auth + JSON fetch.
// Credentials come from env only (infra/.vault/admin-credentials.env), never from code.
export const BACKEND = process.env.MEDUSA_BACKEND_URL || "https://api.bilulu.de";

export async function jsonFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(`${opts.method || "GET"} ${url} -> ${res.status}: ${JSON.stringify(body).slice(0, 500)}`);
  return body;
}

export async function login() {
  if (process.env.MEDUSA_ADMIN_TOKEN) return process.env.MEDUSA_ADMIN_TOKEN;
  const email = process.env.MEDUSA_ADMIN_EMAIL, password = process.env.MEDUSA_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("MEDUSA_ADMIN_EMAIL/PASSWORD missing in env");
  const body = await jsonFetch(`${BACKEND}/auth/user/emailpass`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!body?.token) throw new Error("login returned no token");
  return body.token;
}

/**
 * BIL-2501: resolve the shipping profile a NEW product must be attached to.
 *
 * Two profiles with type="default" exist in prod ("Default Shipping Profile" from
 * Medusa's own seed, and "Default" from our seed-shipping.ts). Picking by
 * `?limit=1` or by `type === "default"` is a coin flip — and the losing side has
 * zero shipping options, which makes POST /store/carts/{id}/complete fail with
 *   "The cart items require shipping profiles that are not satisfied by the
 *    current shipping methods"
 * only at the very last checkout step. That is how BIL-2490 shipped 16 unsellable
 * products. Resolve by DATA instead: the profile that owns shipping options.
 */
export async function resolveShippingProfileId(token) {
  const headers = { authorization: `Bearer ${token}` };
  const { shipping_profiles: profiles } = await jsonFetch(`${BACKEND}/admin/shipping-profiles?limit=100`, { headers });
  const { shipping_options: options } = await jsonFetch(
    `${BACKEND}/admin/shipping-options?limit=100&fields=id,name,shipping_profile_id`, { headers });

  const counts = new Map();
  for (const o of options) counts.set(o.shipping_profile_id, (counts.get(o.shipping_profile_id) ?? 0) + 1);

  const withOptions = profiles.filter((p) => (counts.get(p.id) ?? 0) > 0);
  if (withOptions.length === 1) return withOptions[0].id;
  if (withOptions.length === 0) {
    throw new Error("No shipping profile owns any shipping option — run seed-shipping before creating products.");
  }
  throw new Error(
    `Ambiguous shipping profile: ${withOptions.length} profiles own options ` +
    `(${withOptions.map((p) => `${p.id} "${p.name}"`).join(", ")}). Pass shipping_profile_id explicitly.`);
}

export async function listProducts(token) {
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const page = await jsonFetch(
      `${BACKEND}/admin/products?limit=100&offset=${offset}&fields=id,title,handle,status,thumbnail,*images,*variants,*variants.prices`,
      { headers: { authorization: `Bearer ${token}` } });
    out.push(...page.products);
    if (out.length >= page.count) return out;
  }
}
