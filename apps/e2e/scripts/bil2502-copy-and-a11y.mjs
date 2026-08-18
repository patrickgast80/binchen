/**
 * BIL-2502 — render-only checks for the cases the fault proxy cannot produce,
 * plus an axe scan of the error surface.
 *
 *  - unknown code  -> generic copy incl. info@bilulu.de, never the raw code
 *  - via=paypal    -> must NOT promise "es wurde nichts abgebucht"
 *  - axe (wcag2a/wcag2aa) on /checkout/payment with the banner rendered
 */
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = "http://localhost:3477";
const BACKEND = "http://localhost:9411";
const PK = "pk_5f4df48ccb4a5a3843410089661e694c74f1db2458ed07e1d94bfd449b14c50f";
const h = { "content-type": "application/json", "x-publishable-api-key": PK };
const OUT = path.resolve("reports/bil2502");
await mkdir(OUT, { recursive: true });

const j = async (u, o) => (await fetch(u, o)).json().catch(() => null);

const regionId = (await j(`${BACKEND}/store/regions`, { headers: h })).regions[0].id;
const product = (
  await j(`${BACKEND}/store/products?limit=50&region_id=${regionId}`, { headers: h })
).products.find((p) => p.variants?.length);
const email = "bil2502-copy@bilulu.de";
const cartId = (
  await j(`${BACKEND}/store/carts`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ region_id: regionId, email }),
  })
).cart.id;
await j(`${BACKEND}/store/carts/${cartId}/line-items`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ variant_id: product.variants[0].id, quantity: 1 }),
});
await j(`${BACKEND}/store/carts/${cartId}`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({
    email,
    shipping_address: {
      first_name: "BIL2502",
      last_name: "Copy",
      address_1: "Teststr 1",
      city: "Hassloch",
      postal_code: "67454",
      country_code: "de",
    },
  }),
});
const optionId = (await j(`${BACKEND}/store/shipping-options?cart_id=${cartId}`, { headers: h }))
  .shipping_options[0].id;
await j(`${BACKEND}/store/carts/${cartId}/shipping-methods`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ option_id: optionId }),
});

const CASES = [
  { name: "unknown-code", query: "?error=some_future_medusa_code" },
  { name: "paypal", query: "?error=out_of_stock&via=paypal" },
  { name: "no-error", query: "" }, // control: banner must be absent
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addCookies([
  { name: "bilulu_cart_id", value: cartId, domain: "localhost", path: "/", sameSite: "Lax" },
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

const results = [];
for (const c of CASES) {
  await page.goto(`${BASE}/checkout/payment${c.query}`, { waitUntil: "networkidle" });
  const banner = page.getByTestId("checkout-error");
  const present = (await banner.count()) > 0;
  const text = present ? (await banner.innerText()).replace(/\s+/g, " ").trim() : null;
  const entry = {
    case: c.name,
    query: c.query,
    bannerPresent: present,
    text,
    mentionsSupport: text ? text.includes("info@bilulu.de") : null,
    // The PayPal buyer already approved — promising "nothing was charged" there
    // would be false.
    claimsNothingCharged: text ? /nichts abgebucht/.test(text) : null,
    leaksRawCode: text ? /some_future_medusa_code|out_of_stock|http_\d/.test(text) : null,
  };

  if (c.name === "unknown-code") {
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    entry.axeViolations = axe.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.length,
    }));
    await page.screenshot({ path: path.join(OUT, "fallback-mobile.png"), fullPage: true });
  }
  if (c.name === "paypal") {
    await page.screenshot({ path: path.join(OUT, "paypal-mobile.png"), fullPage: true });
  }
  results.push(entry);
}

await browser.close();
await writeFile(path.join(OUT, "copy-and-a11y.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
