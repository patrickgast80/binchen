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
