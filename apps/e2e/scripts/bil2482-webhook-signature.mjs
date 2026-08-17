#!/usr/bin/env node
/**
 * BIL-2482 scope item 2 — "prove the webhook signature check works".
 *
 * The cutover doc says this can only be proven with live credentials. Half of
 * that is true: the LIVE webhook id can only be tested after the live app
 * exists. But the *mechanism* — PayPal signs, our deployed handler verifies
 * against PAYPAL_WEBHOOK_ID from env, and answers 200 — is identical in both
 * environments and IS testable today, because PayPal's simulate-event API
 * delivers a genuinely signed event to the registered listener.
 *
 * That is worth doing before the cutover rather than after: if the webhook id
 * baked into prod env did not match the registered webhook, verifyWebhookSignature
 * would silently reject every event (`return false`) and a paid order would
 * never be marked paid. We would only notice with real money in flight.
 *
 * What this checks:
 *   1. the webhook registered at PayPal points at our prod URL + right events
 *   2. the registered webhook id == the id prod is configured with (vault)
 *   3. a signed simulated CAPTURE event is accepted by the deployed endpoint
 *      (PayPal reports the delivery response code)
 *
 * Sandbox only; refuses to run against live. No real money can move.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const VAULT = path.join(ROOT, "infra/.vault/paypal-sandbox.env");
const HOOK_URL = "https://api.bilulu.de/hooks/payment/paypal";

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

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
};
const tail = (s) => (s ? `…${String(s).slice(-6)}` : "-");

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
const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

console.log("# BIL-2482 webhook signature verification (sandbox mechanism proof)\n");

// ------------------------------------------------- 1./2. registration + id
const hooks = await (await fetch(`${PP}/v1/notifications/webhooks`, { headers: auth })).json();
const hook = (hooks.webhooks ?? []).find((w) => w.url === HOOK_URL);
const events = (hook?.event_types ?? []).map((e) => e.name);
const wanted = [
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.DENIED",
  "PAYMENT.CAPTURE.REFUNDED",
];
check(
  "webhook registered at PayPal for our prod hook URL",
  Boolean(hook),
  hook ? `${hook.url} id=${tail(hook.id)}` : `no webhook with url ${HOOK_URL}`,
);
check(
  "all three capture/refund events subscribed",
  wanted.every((w) => events.includes(w)),
  events.join(", ") || "none",
);
check(
  "registered webhook id == the id the backend verifies against (vault)",
  Boolean(hook) && hook.id === env.PAYPAL_WEBHOOK_ID,
  hook?.id === env.PAYPAL_WEBHOOK_ID
    ? `both ${tail(hook.id)} -> signatures will verify`
    : `registered ${tail(hook?.id)} vs configured ${tail(env.PAYPAL_WEBHOOK_ID)} -> ALL events would be dropped`,
);

// ------------------------------------------- 3. signed delivery to prod
const simRes = await fetch(`${PP}/v1/notifications/simulate-event`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({
    webhook_id: hook?.id,
    event_type: "PAYMENT.CAPTURE.COMPLETED",
  }),
});
const sim = await simRes.json();
check(
  "PayPal accepted the simulate-event request",
  simRes.ok && Boolean(sim.id),
  simRes.ok ? `event=${sim.id} type=${sim.event_type}` : `${simRes.status} ${sim.name ?? ""} ${sim.message ?? ""}`,
);

// PayPal delivers asynchronously; poll the event's transmission status.
let status = null;
let response = null;
for (let i = 0; i < 12 && sim.id; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const det = await (
    await fetch(`${PP}/v1/notifications/webhooks-events/${sim.id}`, { headers: auth })
  ).json();
  status = det.status ?? null;
  response = det;
  console.log(`  poll ${i + 1}: status=${status ?? "?"}`);
  if (status && status !== "PENDING") break;
}
check(
  "signed simulated CAPTURE event delivered to the deployed endpoint",
  status === "SUCCESS",
  `delivery status=${status ?? "unknown"}${status === "SUCCESS" ? " (our handler answered 2xx to a PayPal-signed event)" : ""}`,
);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
const report = [
  `# BIL-2482 webhook signature verification — ${results.length - failed.length}/${results.length}`,
  "",
  ...results.map((r) => `- ${r.pass ? "PASS" : "FAIL"} **${r.name}** — ${r.detail}`),
  "",
  "Sandbox mechanism proof. The live cutover must repeat check 3 against the LIVE",
  "webhook id — that is the one value this cannot pre-verify.",
  "",
].join("\n");
fs.writeFileSync(path.join(ROOT, "apps/e2e/reports/bil2482-webhook-signature.md"), report);
process.exit(failed.length ? 1 : 0);
