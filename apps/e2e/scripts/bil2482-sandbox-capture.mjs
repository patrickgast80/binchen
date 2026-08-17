#!/usr/bin/env node
/**
 * BIL-2482 — first end-to-end execution of the PayPal capture path, in sandbox.
 *
 * Why this exists: PayPal's event log for this shop shows 0 events over its
 * entire lifetime. Every part of the chain after "buyer clicks approve" —
 * capture, the signed webhook, correlation to a Medusa session, the order
 * flipping to paid, refund — has never executed. The live cutover would have
 * been the first execution, with a real customer's money. This runs it first
 * with sandbox money instead.
 *
 * Full chain, no shortcuts:
 *   1. prod cart -> address -> shipping                 (real Medusa store API)
 *   2. pp_paypal session                                (prod provider code)
 *   3. buyer approves (sandbox test card via confirm-payment-source)
 *   4. /api/checkout/complete -> Medusa completes cart -> capturePayment
 *   5. PayPal confirms COMPLETED + a capture id
 *   6. PayPal delivers a SIGNED webhook to prod -> event log + delivery status
 *   7. refund the capture -> REFUNDED webhook           (the third live path)
 *
 * Steps 6/7 are the ones that prove the deployed webhook handler verifies a
 * real PayPal signature and correlates via custom_id (BIL-2482's fix).
 *
 * Sandbox only; refuses to run if the vault says live. Secrets never printed.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const VAULT = path.join(ROOT, "infra/.vault/paypal-sandbox.env");
const OUT = path.join(ROOT, "apps/e2e/reports");
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
if ((env.PAYPAL_MODE || "sandbox") !== "sandbox") {
  console.error("refusing to run: vault is not in sandbox mode");
  process.exit(2);
}
const PP = "https://api-m.sandbox.paypal.com";

const h = { "content-type": "application/json", "x-publishable-api-key": PK };
const j = async (url, opts) => {
  const res = await fetch(url, opts);
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
};

const tokenRes = await fetch(`${PP}/v1/oauth2/token`, {
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
const ppAuth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const ppOrder = (id) => j(`${PP}/v2/checkout/orders/${id}`, { headers: ppAuth });

console.log("# BIL-2482 — full sandbox capture chain\n");

// ------------------------------------------------------------- 1. prod cart
const regions = await j(`${BACKEND}/store/regions`, { headers: h });
const region = regions.body.regions.find((r) => r.currency_code === "eur");
const cart = await j(`${BACKEND}/store/carts`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ region_id: region.id, email: "bil2482-capture@bilulu.de" }),
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
    email: "bil2482-capture@bilulu.de",
    shipping_address: {
      first_name: "Backend",
      last_name: "CaptureProof",
      address_1: "Teststraße 1",
      city: "Haßloch",
      postal_code: "67454",
      country_code: "de",
    },
  }),
});
const shipOpts = await j(`${BACKEND}/store/shipping-options?cart_id=${cartId}`, { headers: h });
await j(`${BACKEND}/store/carts/${cartId}/shipping-methods`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ option_id: shipOpts.body.shipping_options[0].id }),
});
const cartNow = await j(`${BACKEND}/store/carts/${cartId}`, { headers: h });
check("prod cart ready", Boolean(cartId), `cart=${cartId} total=${cartNow.body.cart.total} EUR`);

// ---------------------------------------------------------- 2. paypal session
const collection = await j(`${BACKEND}/store/payment-collections`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ cart_id: cartId }),
});
const collectionId = collection.body.payment_collection.id;
const sessionRes = await j(
  `${BACKEND}/store/payment-collections/${collectionId}/payment-sessions`,
  { method: "POST", headers: h, body: JSON.stringify({ provider_id: "pp_paypal" }) },
);
const session = sessionRes.body.payment_collection.payment_sessions.find(
  (s) => s.provider_id === "pp_paypal",
);
const sessionId = session.id;
const orderId = session.data.id;
check("pp_paypal session created in prod", Boolean(orderId), `session=${sessionId} order=${orderId}`);

const created = await ppOrder(orderId);
check(
  "custom_id carries the session id (BIL-2482 fix, live in prod)",
  created.body?.purchase_units?.[0]?.custom_id === sessionId,
  `custom_id=${created.body?.purchase_units?.[0]?.custom_id ?? "-"}`,
);

// ------------------------------------------------------- 3. buyer approves
// Driving the hosted approval UI in a browser needs a sandbox *buyer* account,
// and the two vault slots for one are empty — which is exactly why every
// earlier attempt stopped at the approve link. confirm-payment-source does the
// same thing the buyer's click does (it moves the order to APPROVED) with a
// sandbox test card, so the rest of the chain becomes reproducible instead of
// depending on PayPal's login markup.
const confirm = await j(`${PP}/v2/checkout/orders/${orderId}/confirm-payment-source`, {
  method: "POST",
  headers: ppAuth,
  body: JSON.stringify({
    payment_source: {
      card: { number: "4111111111111111", expiry: "2030-01", name: "Test Buyer", security_code: "123" },
    },
  }),
});
const approved = confirm.body?.status === "APPROVED" || confirm.body?.status === "COMPLETED";
check(
  "order approved by a sandbox buyer (test card, no real money)",
  approved,
  approved
    ? `status=${confirm.body.status} card=…${confirm.body?.payment_source?.card?.last_digits ?? "?"}`
    : `${confirm.status} ${JSON.stringify(confirm.body).slice(0, 200)}`,
);

if (!approved) {
  console.log("\napprove step did not complete — stopping before capture.");
  writeReport();
  process.exit(1);
}

// ------------------------------------------ 4. complete the cart (real capture)
const complete = await j(`${BASE}/api/checkout/complete`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ cartId }),
});
check(
  "storefront /api/checkout/complete -> Medusa order",
  complete.ok && Boolean(complete.body?.orderId),
  complete.ok ? `order=${complete.body.orderId}` : `${complete.status} ${JSON.stringify(complete.body)}`,
);
const medusaOrderId = complete.body?.orderId ?? null;

// --------------------------------------------------- 5. PayPal says CAPTURED
const captured = await ppOrder(orderId);
const capture = captured.body?.purchase_units?.[0]?.payments?.captures?.[0] ?? null;
check(
  "PayPal order COMPLETED with a capture id (money moved, sandbox)",
  captured.body?.status === "COMPLETED" && Boolean(capture?.id),
  `status=${captured.body?.status} capture=${capture?.id ?? "-"} amount=${capture?.amount?.value ?? "-"} ${capture?.amount?.currency_code ?? ""}`,
);
check(
  "capture resource still carries custom_id (webhook can correlate)",
  capture?.custom_id === sessionId,
  `capture.custom_id=${capture?.custom_id ?? "-"} vs session=${sessionId}`,
);

// ------------------------------------- 6. signed webhook actually delivered
let events = [];
for (let i = 0; i < 10; i++) {
  await sleep(6000);
  const ev = await j(`${PP}/v1/notifications/webhooks-events?page_size=20`, { headers: ppAuth });
  events = (ev.body?.events ?? []).filter(
    (e) => e.resource?.custom_id === sessionId || e.resource?.id === capture?.id,
  );
  console.log(`  poll webhook events: ${events.length} for this session`);
  if (events.some((e) => e.event_type === "PAYMENT.CAPTURE.COMPLETED")) break;
}
const captureEvent = events.find((e) => e.event_type === "PAYMENT.CAPTURE.COMPLETED");
check(
  "PayPal delivered a signed PAYMENT.CAPTURE.COMPLETED webhook",
  Boolean(captureEvent),
  captureEvent ? `event=${captureEvent.id} status=${captureEvent.status}` : "no capture event in PayPal's log",
);
check(
  "deployed handler ACCEPTED the signed webhook (signature verified in prod)",
  captureEvent?.status === "SUCCESS",
  `delivery status=${captureEvent?.status ?? "-"}${
    captureEvent?.status === "SUCCESS"
      ? " -> PAYPAL_WEBHOOK_ID in prod matches; verifyWebhookSignature passed"
      : " -> a non-SUCCESS here means our endpoint rejected or errored"
  }`,
);

// ------------------------------------------------------------- 7. refund path
const refundRes = await j(`${PP}/v2/payments/captures/${capture?.id}/refund`, {
  method: "POST",
  headers: { ...ppAuth, "PayPal-Request-Id": `bil2482-refund-${capture?.id}` },
  body: JSON.stringify({}),
});
check(
  "capture refunded at PayPal (third live path)",
  refundRes.ok && refundRes.body?.status === "COMPLETED",
  refundRes.ok ? `refund=${refundRes.body.id} status=${refundRes.body.status}` : `${refundRes.status} ${JSON.stringify(refundRes.body).slice(0, 200)}`,
);

let refundEvent = null;
for (let i = 0; i < 10; i++) {
  await sleep(6000);
  const ev = await j(`${PP}/v1/notifications/webhooks-events?page_size=20`, { headers: ppAuth });
  refundEvent = (ev.body?.events ?? []).find(
    (e) => e.event_type === "PAYMENT.CAPTURE.REFUNDED" && e.resource?.custom_id === sessionId,
  );
  console.log(`  poll refund event: ${refundEvent ? refundEvent.status : "none yet"}`);
  if (refundEvent) break;
}
check(
  "refund webhook delivered and accepted by the deployed handler",
  refundEvent?.status === "SUCCESS",
  refundEvent ? `event=${refundEvent.id} status=${refundEvent.status}` : "no refund event yet (PayPal can lag)",
);

writeReport();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`medusa order: ${medusaOrderId ?? "-"}  paypal order: ${orderId}`);
process.exit(failed.length ? 1 : 0);

function writeReport() {
  const failed = results.filter((r) => !r.pass);
  const report = [
    `# BIL-2482 — sandbox capture chain — ${results.length - failed.length}/${results.length}`,
    "",
    `PayPal order: \`${orderId}\`  ·  Medusa session: \`${sessionId}\`  ·  cart: \`${cartId}\``,
    "",
    ...results.map((r) => `- ${r.pass ? "PASS" : "FAIL"} **${r.name}** — ${r.detail}`),
    "",
      "",
  ].join("\n");
  fs.writeFileSync(path.join(OUT, "bil2482-sandbox-capture.md"), report);
}
