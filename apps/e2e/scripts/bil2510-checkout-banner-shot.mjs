/**
 * BIL-2510 — regression proof for the surface this ticket did NOT own.
 *
 * The `?error=` banner on /checkout/payment (BIL-2502) now renders through the
 * shared <ErrorBanner>. Same DOM, same `checkout-error` testid, plus the icon
 * and the full-strength border. This drives the local build to a real payment
 * page and shoots it, so the refactor is not shipped on inspection alone.
 *
 * Cart prep is QA's recipe from bil2500-shipping-bug-browser.mjs: build the
 * cart over the Store API, then hand the storefront its cart cookie. No order
 * is completed — the script stops at rendering the page.
 */
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BIL2510_BASE ?? "http://127.0.0.1:3211";
const BACKEND = "https://api.bilulu.de";
const PK = "pk_5f4df48ccb4a5a3843410089661e694c74f1db2458ed07e1d94bfd449b14c50f";
const h = { "content-type": "application/json", "x-publishable-api-key": PK };
const OUT = path.resolve("reports/bil2510");
mkdirSync(OUT, { recursive: true });

const j = async (url, opts) => {
  const res = await fetch(url, opts);
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
};

const regions = await j(`${BACKEND}/store/regions`, { headers: h });
const region = regions.body.regions[0];

const products = await j(
  `${BACKEND}/store/products?limit=50&region_id=${region.id}&fields=*variants.inventory_quantity`,
  { headers: h },
);
const variant = products.body.products
  .flatMap((p) => p.variants ?? [])
  .find((v) => (v.inventory_quantity ?? 0) > 0 || v.manage_inventory === false);
if (!variant) throw new Error("no purchasable variant found");

const cart = await j(`${BACKEND}/store/carts`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ region_id: region.id, email: "frontend-bil2510@bilulu.de" }),
});
const cartId = cart.body.cart.id;
await j(`${BACKEND}/store/carts/${cartId}/line-items`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ variant_id: variant.id, quantity: 1 }),
});
await j(`${BACKEND}/store/carts/${cartId}`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({
    email: "frontend-bil2510@bilulu.de",
    shipping_address: {
      first_name: "Frontend",
      last_name: "BIL2510",
      address_1: "Teststr 1",
      city: "Hassloch",
      postal_code: "67454",
      country_code: "de",
    },
  }),
});
const shipOpts = await j(`${BACKEND}/store/shipping-options?cart_id=${cartId}`, { headers: h });
const optionId = shipOpts.body?.shipping_options?.[0]?.id;
await j(`${BACKEND}/store/carts/${cartId}/shipping-methods`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ option_id: optionId }),
});

const results = { cartId, variant: variant.id, shippingOption: optionId, shots: [] };
const browser = await chromium.launch();

for (const vp of [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
  });
  await ctx.addCookies([
    { name: "bilulu_cart_id", value: cartId, url: BASE, sameSite: "Lax" },
  ]);
  await ctx.addInitScript(() => {
    window.localStorage.setItem(
      "bilulu_cookie_consent_v1",
      JSON.stringify({
        version: "1",
        decidedAt: "2026-08-18T00:00:00.000Z",
        categories: { strict: true, functional: false, analytics: false, marketing: false },
      }),
    );
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });

  // `out_of_stock` is the non-retryable branch, so this also proves the
  // children slot (the "Warenkorb prüfen" button) survived the refactor.
  await page.goto(`${BASE}/checkout/payment?error=out_of_stock&via=paypal`, {
    waitUntil: "networkidle",
  });
  const banner = page.locator('[data-testid="checkout-error"]');
  const count = await banner.count();
  await page.screenshot({ path: path.join(OUT, `checkout-payment-${vp.name}-error.png`) });
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  results.shots.push({
    viewport: vp.name,
    url: page.url(),
    bannerCount: count,
    role: count ? await banner.getAttribute("role") : null,
    text: count ? (await banner.innerText()).replace(/\s+/g, " ").trim() : null,
    retryButton: await page.getByRole("link", { name: "Warenkorb prüfen" }).count(),
    axeViolations: axe.violations.map((v) => ({ id: v.id, impact: v.impact })),
    consoleErrors,
  });
  await ctx.close();
}

await browser.close();
writeFileSync(path.join(OUT, "checkout-results.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
