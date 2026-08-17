#!/usr/bin/env node
/**
 * BIL-2482 — is the custom_id correlation fix (main@0735254) actually LIVE?
 *
 * The unit tests and the sandbox integration test both prove the *code* is
 * right. Neither proves the running production backend is serving that code.
 * That distinction matters here: if prod still runs the pre-fix build at the
 * moment of the live cutover, the first real payment produces a capture webhook
 * we cannot correlate to a session — money moves, the order stays unpaid.
 *
 * So this drives the real prod chain end to end and then asks PayPal what our
 * production service actually sent:
 *   1. prod cart -> address -> shipping   (real Medusa store API)
 *   2. payment collection -> pp_paypal session  (our provider, in prod)
 *   3. GET the resulting order AT PayPal -> is custom_id == the session id?
 *
 * Prod is still in sandbox mode, so this creates a sandbox order only; no real
 * money can move. The script refuses to run if the vault says live.
 *
 * Secrets come from infra/.vault/paypal-sandbox.env and are never printed.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const VAULT = path.join(ROOT, "infra/.vault/paypal-sandbox.env");
const BACKEND = "https://api.bilulu.de";
const PK = "pk_5f4df48ccb4a5a3843410089661e694c74f1db2458ed07e1d94bfd449b14c50f";

function loadEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = loadEnv(VAULT);
if ((env.PAYPAL_MODE || "sandbox") !== "sandbox") {
  console.error("refusing to run: vault is not in sandbox mode");
  process.exit(2);
}
const PP_BASE = "https://api-m.sandbox.paypal.com";

const h = { "content-type": "application/json", "x-publishable-api-key": PK };
const j = async (url, opts) => {
  const res = await fetch(url, opts);
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
};

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
};

console.log("# BIL-2482 deploy verification — custom_id correlation in prod\n");

// ------------------------------------------------------------------ 1. cart
const regions = await j(`${BACKEND}/store/regions`, { headers: h });
const region = regions.body.regions.find((r) => r.currency_code === "eur");
const cart = await j(`${BACKEND}/store/carts`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ region_id: region.id, email: "bil2482-deploy@bilulu.de" }),
});
const cartId = cart.body?.cart?.id;
const products = await j(`${BACKEND}/store/products?limit=1`, { headers: h });
const variantId = products.body?.products?.[0]?.variants?.[0]?.id;
await j(`${BACKEND}/store/carts/${cartId}/line-items`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ variant_id: variantId, quantity: 1 }),
});
await j(`${BACKEND}/store/carts/${cartId}`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({
    email: "bil2482-deploy@bilulu.de",
    shipping_address: {
      first_name: "Backend",
      last_name: "DeployCheck",
      address_1: "Teststraße 1",
      city: "Haßloch",
      postal_code: "67454",
      country_code: "de",
    },
  }),
});
const shipOpts = await j(`${BACKEND}/store/shipping-options?cart_id=${cartId}`, {
  headers: h,
});
const optionId = shipOpts.body?.shipping_options?.[0]?.id;
await j(`${BACKEND}/store/carts/${cartId}/shipping-methods`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ option_id: optionId }),
});
const cartNow = await j(`${BACKEND}/store/carts/${cartId}`, { headers: h });
check(
  "prod cart ready (item + DE address + shipping)",
  Boolean(cartId && optionId),
  `cart=${cartId} total=${cartNow.body?.cart?.total} EUR`,
);

// --------------------------------------------------------------- 2. session
const collection = await j(`${BACKEND}/store/payment-collections`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ cart_id: cartId }),
});
const collectionId = collection.body?.payment_collection?.id;
const sessionRes = await j(
  `${BACKEND}/store/payment-collections/${collectionId}/payment-sessions`,
  { method: "POST", headers: h, body: JSON.stringify({ provider_id: "pp_paypal" }) },
);
const session = (sessionRes.body?.payment_collection?.payment_sessions ?? []).find(
  (s) => s.provider_id === "pp_paypal",
);
const sessionId = session?.id ?? null;
const orderId = session?.data?.id ?? null;
check(
  "pp_paypal session created by the PRODUCTION backend",
  Boolean(orderId && sessionId),
  `session=${sessionId ?? "-"} paypal_order=${orderId ?? "-"}`,
);

// ------------------------------------------------------- 3. ask PayPal itself
const tokenRes = await fetch(`${PP_BASE}/v1/oauth2/token`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${Buffer.from(
      `${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`,
    ).toString("base64")}`,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: "grant_type=client_credentials",
});
const token = (await tokenRes.json()).access_token;
const ppOrder = await j(`${PP_BASE}/v2/checkout/orders/${orderId}`, {
  headers: { Authorization: `Bearer ${token}` },
});
const unit = ppOrder.body?.purchase_units?.[0];
const customId = unit?.custom_id ?? null;

check(
  "deployed backend stamps custom_id on the purchase unit",
  Boolean(customId),
  customId ? `custom_id=${customId}` : "custom_id ABSENT -> prod is running the pre-fix build",
);
check(
  "custom_id equals the Medusa payment session id (webhook can correlate)",
  Boolean(customId) && customId === sessionId,
  `paypal.custom_id=${customId ?? "-"} vs medusa.session=${sessionId ?? "-"}`,
);
check(
  "order is approvable at PayPal (chain intact)",
  ppOrder.body?.status === "CREATED" &&
    Boolean((ppOrder.body?.links ?? []).find((l) => l.rel === "payer-action" || l.rel === "approve")),
  `status=${ppOrder.body?.status} amount=${unit?.amount?.value} ${unit?.amount?.currency_code}`,
);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
const report = [
  `# BIL-2482 deploy verification — ${results.length - failed.length}/${results.length}`,
  "",
  ...results.map((r) => `- ${r.pass ? "PASS" : "FAIL"} **${r.name}** — ${r.detail}`),
  "",
].join("\n");
fs.writeFileSync(path.join(ROOT, "apps/e2e/reports/bil2482-deploy-verify.md"), report);
process.exit(failed.length ? 1 : 0);
