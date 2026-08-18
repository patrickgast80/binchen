/**
 * BIL-2502 — live proof on bilulu.de that the ?error= banner actually shipped.
 *
 * A prod fault cannot be injected, so this drives the render path directly:
 * prepare a throwaway cart (never completed — no order, no stock touched) and
 * open /checkout/payment?error=... . Before this change that URL rendered the
 * plain payment page; the banner appearing IS the deploy signal.
 *
 * Polls for the auto-deploy (5-min cron on the Coolify host) instead of
 * guessing a wait.
 */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = "https://bilulu.de";
const BACKEND = "https://api.bilulu.de";
const PK = "pk_5f4df48ccb4a5a3843410089661e694c74f1db2458ed07e1d94bfd449b14c50f";
const h = { "content-type": "application/json", "x-publishable-api-key": PK };
const OUT = path.resolve("reports/bil2502-live");
await mkdir(OUT, { recursive: true });

const j = async (u, o) => (await fetch(u, o)).json().catch(() => null);

const regionId = (await j(`${BACKEND}/store/regions`, { headers: h })).regions[0].id;
const product = (
  await j(`${BACKEND}/store/products?limit=50&region_id=${regionId}`, { headers: h })
).products.find((p) => p.variants?.length);
const email = "bil2502-live@bilulu.de";
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
      last_name: "Live",
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
console.log("live cart prepared (never completed):", cartId, "| product:", product.title);

const browser = await chromium.launch();
async function context(vp) {
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.addCookies([
    { name: "bilulu_cart_id", value: cartId, domain: "bilulu.de", path: "/", secure: true, sameSite: "Lax" },
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
  return ctx;
}

// Poll until the deployed build renders the banner.
const DEADLINE = Date.now() + 15 * 60_000;
let deployed = false;
let attempts = 0;
while (Date.now() < DEADLINE && !deployed) {
  attempts += 1;
  const ctx = await context({ width: 1440, height: 900 });
  const page = await ctx.newPage();
  await page
    .goto(`${BASE}/checkout/payment?error=out_of_stock`, { waitUntil: "domcontentloaded", timeout: 60_000 })
    .catch(() => {});
  deployed = (await page.getByTestId("checkout-error").count()) > 0;
  console.log(`attempt ${attempts}: banner ${deployed ? "PRESENT" : "absent"} (${page.url()})`);
  await ctx.close();
  if (!deployed) await new Promise((r) => setTimeout(r, 45_000));
}

const results = [];
if (deployed) {
  for (const vp of [
    { name: "mobile", width: 390, height: 844 },
    { name: "desktop", width: 1440, height: 900 },
  ]) {
    for (const c of [
      { name: "out_of_stock", q: "?error=out_of_stock" },
      { name: "unknown", q: "?error=some_future_medusa_code" },
      { name: "control", q: "" },
    ]) {
      const ctx = await context({ width: vp.width, height: vp.height });
      const page = await ctx.newPage();
      const consoleErrors = [];
      page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
      await page.goto(`${BASE}/checkout/payment${c.q}`, { waitUntil: "networkidle", timeout: 60_000 });
      const banner = page.getByTestId("checkout-error");
      const present = (await banner.count()) > 0;
      const text = present ? (await banner.innerText()).replace(/\s+/g, " ").trim() : null;
      await page.screenshot({ path: path.join(OUT, `${c.name}-${vp.name}.png`), fullPage: true });
      results.push({ viewport: vp.name, case: c.name, url: page.url(), bannerPresent: present, text, consoleErrors });
      await ctx.close();
    }
  }
}

await browser.close();
await writeFile(
  path.join(OUT, "results.json"),
  JSON.stringify({ at: new Date().toISOString(), cartId, deployed, attempts, results }, null, 2),
);
console.log(JSON.stringify({ deployed, attempts, results }, null, 2));
