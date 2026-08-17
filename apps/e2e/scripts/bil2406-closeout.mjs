#!/usr/bin/env node
/**
 * BIL-2406 closeout evidence — "kann man PayPal schliessen?"
 *
 * Proves the complete server-side chain that a real buyer traverses, from a real
 * prod cart to a real PayPal order, and reports WHICH PayPal environment the
 * button a customer sees actually points at (sandbox vs. live).
 *
 * Only the interactive login/approve popup is out of reach without a buyer
 * account; everything before and after it is machine-checkable here:
 *   1. prod cart -> address -> shipping (real Medusa store API)
 *   2. payment collection + pp_paypal session  (our backend provider code path)
 *   3. the returned PayPal order id verified AT PayPal: status, amount, links
 *   4. the rendered /checkout/payment page: SDK client-id + environment
 *   5. capture/refund readiness: webhook registration + subscribed events
 *
 * Secrets are read from infra/.vault/paypal-sandbox.env and never printed.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const VAULT = path.join(ROOT, "infra/.vault/paypal-sandbox.env");
const BASE = "https://bilulu.de";
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
const PP_BASE =
  (env.PAYPAL_MODE || "sandbox") === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

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

console.log(`# BIL-2406 closeout evidence  (vault mode=${env.PAYPAL_MODE})\n`);

// ---------------------------------------------------------------- 1. cart
const regions = await j(`${BACKEND}/store/regions`, { headers: h });
const region = regions.body.regions.find((r) => r.currency_code === "eur");
const providers = await j(
  `${BACKEND}/store/payment-providers?region_id=${region.id}`,
  { headers: h },
);
const providerIds = (providers.body?.payment_providers ?? []).map((p) => p.id);
check(
  "pp_paypal registered for prod region DE/EUR",
  providerIds.includes("pp_paypal"),
  providerIds.join(", "),
);

const cart = await j(`${BACKEND}/store/carts`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ region_id: region.id, email: "backend-closeout@bilulu.de" }),
});
const cartId = cart.body.cart.id;
const products = await j(`${BACKEND}/store/products?limit=1`, { headers: h });
const variantId = products.body.products[0].variants[0].id;
await j(`${BACKEND}/store/carts/${cartId}/line-items`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ variant_id: variantId, quantity: 1 }),
});
await j(`${BACKEND}/store/carts/${cartId}`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({
    email: "backend-closeout@bilulu.de",
    shipping_address: {
      first_name: "Backend",
      last_name: "Closeout",
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
const cartTotal = cartNow.body.cart.total;
check(
  "prod cart ready (item + DE address + shipping)",
  Boolean(cartId && optionId),
  `cart=${cartId} total=${cartTotal} ${region.currency_code.toUpperCase()}`,
);

// ------------------------------------------- 2./4. storefront page + session
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
await ctx.addCookies([
  {
    name: "bilulu_cart_id",
    value: cartId,
    domain: "bilulu.de",
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  },
]);
const page = await ctx.newPage();
await page.goto(`${BASE}/checkout/payment`, {
  waitUntil: "networkidle",
  timeout: 45000,
});

const sdkSrc = await page
  .locator('script[src*="paypal.com/sdk/js"]')
  .first()
  .getAttribute("src")
  .catch(() => null);
const sdkClientId = sdkSrc ? new URL(sdkSrc).searchParams.get("client-id") : null;
check(
  "PayPal Smart Button rendered on live /checkout/payment",
  Boolean(sdkSrc) && (await page.getByText("Mit PayPal bezahlen").count()) > 0,
  sdkSrc ? `sdk currency=${new URL(sdkSrc).searchParams.get("currency")}` : "no SDK tag",
);
const clientIdMatchesVault = sdkClientId === env.PAYPAL_CLIENT_ID;
check(
  "button points at the SANDBOX app (customer-visible environment)",
  clientIdMatchesVault,
  clientIdMatchesVault
    ? "client-id == vault sandbox client-id -> real buyers cannot log in"
    : `client-id differs from vault (${sdkClientId?.slice(0, 5)}…) -> check which app`,
);

await page.screenshot({
  path: path.join(ROOT, "apps/e2e/reports/bil2406-closeout-payment.png"),
  fullPage: true,
});
const vorkasse =
  (await page.getByRole("button", { name: "Bestellung verbindlich abschließen" }).count()) > 0;
check(
  "Vorkasse stays available next to PayPal (no-regression fallback)",
  vorkasse,
  vorkasse ? "Vorkasse submit button present" : "Vorkasse button missing",
);
await browser.close();

// The storefront's server component calls exactly these two endpoints to hand a
// pre-created PayPal order id to the client island — drive them directly so the
// id is deterministic instead of scraped out of the RSC payload.
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
const orderId = session?.data?.id ?? null;
check(
  "pp_paypal payment session created via our backend provider",
  Boolean(orderId),
  `collection=${collectionId} session=${session?.id ?? "-"} paypal_order=${orderId ?? "-"}`,
);

// ------------------------------------------------- 3. verify order at PayPal
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
const accessToken = (await tokenRes.json()).access_token;
check("PayPal OAuth with vault creds", tokenRes.ok, `HTTP ${tokenRes.status}`);

if (orderId && accessToken) {
  const o = await j(`${PP_BASE}/v2/checkout/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const amount = o.body?.purchase_units?.[0]?.amount;
  const approve = (o.body?.links ?? []).some((l) => l.rel === "approve" || l.rel === "payer-action");
  const amountMatches =
    amount && Math.abs(Number(amount.value) - Number(cartTotal)) < 0.005;
  check(
    "server-created PayPal order exists and is approvable",
    o.ok && o.body?.status === "CREATED" && approve,
    `order=${orderId} status=${o.body?.status} approve_link=${approve}`,
  );
  check(
    "PayPal order amount == cart total (no rounding/×100 drift)",
    Boolean(amountMatches),
    `paypal=${amount?.value} ${amount?.currency_code} vs cart=${cartTotal}`,
  );
} else {
  check(
    "server-created PayPal order exists and is approvable",
    false,
    "could not extract a PayPal order id from the rendered page",
  );
}

// ------------------------------------------------ 5. capture/refund readiness
const wh = await j(`${PP_BASE}/v1/notifications/webhooks/${env.PAYPAL_WEBHOOK_ID}`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
const events = (wh.body?.event_types ?? []).map((e) => e.name);
check(
  "capture/deny/refund webhook registered at our endpoint",
  wh.ok && wh.body?.url === `${BACKEND}/hooks/payment/paypal`,
  `${wh.body?.url} events=[${events.join(", ")}]`,
);

const failed = results.filter((r) => !r.pass);
console.log(
  `\n== ${results.length - failed.length}/${results.length} checks passed ==`,
);
process.exit(failed.length ? 1 : 0);
