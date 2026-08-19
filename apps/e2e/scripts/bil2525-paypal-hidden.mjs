#!/usr/bin/env node
/**
 * BIL-2525 — PayPal-Button ausgeblendet (Board-Entscheidung B).
 *
 * Proves on live bilulu.de, WITH a real filled cart (without one the page
 * redirects to /cart and any "no PayPal" check is a false green):
 *   1. /checkout/payment renders (no redirect) — cart really counted
 *   2. NO PayPal SDK script tag and NO "Mit PayPal bezahlen" block in the DOM
 *   3. Vorkasse / Überweisung stays visible with its submit button
 *
 * Run with --expect-present to use as a pre-change control: then the script
 * demands that PayPal IS there (proves the probe can see the button at all).
 */
import { chromium } from "@playwright/test";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const BASE = "https://bilulu.de";
const BACKEND = "https://api.bilulu.de";
const PK = "pk_5f4df48ccb4a5a3843410089661e694c74f1db2458ed07e1d94bfd449b14c50f";
const EXPECT_PRESENT = process.argv.includes("--expect-present");

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

console.log(
  `# BIL-2525 PayPal hidden check (${EXPECT_PRESENT ? "CONTROL: expect PayPal PRESENT" : "expect PayPal ABSENT"})\n`,
);

// ------------------------------------------------------------- real cart
const regions = await j(`${BACKEND}/store/regions`, { headers: h });
const region = regions.body.regions.find((r) => r.currency_code === "eur");
const cart = await j(`${BACKEND}/store/carts`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ region_id: region.id, email: "bil2525-check@bilulu.de" }),
});
const cartId = cart.body.cart.id;
const products = await j(`${BACKEND}/store/products?limit=1`, { headers: h });
const product = products.body.products[0];
const variantId = product.variants[0].id;
await j(`${BACKEND}/store/carts/${cartId}/line-items`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ variant_id: variantId, quantity: 1 }),
});
await j(`${BACKEND}/store/carts/${cartId}`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({
    email: "bil2525-check@bilulu.de",
    shipping_address: {
      first_name: "Bil",
      last_name: "Check",
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
check(
  "real prod cart ready (item + DE address + shipping)",
  Boolean(cartId && optionId),
  `cart=${cartId} item="${product.title}"`,
);

// ------------------------------------------------------- rendered page
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

const finalUrl = page.url();
const onPayment = new URL(finalUrl).pathname === "/checkout/payment";
check(
  "no redirect: cart counted, page is /checkout/payment",
  onPayment,
  finalUrl,
);

const sdkCount = await page.locator('script[src*="paypal.com/sdk/js"]').count();
const paypalTextCount = await page.getByText("Mit PayPal bezahlen").count();
const htmlHasPaypalSdk = (await page.content()).includes("paypal.com/sdk/js");
const paypalPresent = sdkCount > 0 || paypalTextCount > 0 || htmlHasPaypalSdk;
check(
  EXPECT_PRESENT
    ? "CONTROL: PayPal SDK/button present in DOM"
    : "PayPal SDK script + button ABSENT from DOM",
  EXPECT_PRESENT ? paypalPresent : !paypalPresent,
  `sdk_tags=${sdkCount} "Mit PayPal bezahlen"=${paypalTextCount} html_sdk_ref=${htmlHasPaypalSdk}`,
);

const vorkasseHeading = await page.getByText("Vorkasse / Überweisung").count();
const vorkasseSubmit = await page
  .getByRole("button", { name: "Bestellung verbindlich abschließen" })
  .count();
check(
  "Vorkasse visible and selectable",
  vorkasseHeading > 0 && vorkasseSubmit > 0,
  `heading=${vorkasseHeading} submit_button=${vorkasseSubmit}`,
);

const shot = path.join(
  ROOT,
  `apps/e2e/reports/bil2525-payment-${EXPECT_PRESENT ? "before" : "after"}.png`,
);
await page.screenshot({ path: shot, fullPage: true });
console.log(`screenshot: ${shot}`);
await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n== ${results.length - failed.length}/${results.length} checks passed ==`);
process.exit(failed.length ? 1 : 0);
