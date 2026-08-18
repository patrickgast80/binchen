/**
 * BIL-2502 — prove the checkout error is visible instead of a silent reload.
 *
 * Drives the REAL Vorkasse server action on a local storefront that talks to
 * the live backend through bil2502-fault-proxy.mjs, which injects the exact
 * 400 body Medusa returned to QA in BIL-2500. Nothing is written to production:
 * the cart is a throwaway and the order never completes.
 *
 * Run the proxy + `NEXT_DIST_DIR=.next-bil2502
 * NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9411 next dev -p 3477` first.
 *
 *   node scripts/bil2502-error-visible.mjs [--fault=out_of_stock]
 */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const FAULT = args.fault ?? "out_of_stock";
const BASE = "http://localhost:3477";
const BACKEND = "http://localhost:9411";
const PK = "pk_5f4df48ccb4a5a3843410089661e694c74f1db2458ed07e1d94bfd449b14c50f";
const h = { "content-type": "application/json", "x-publishable-api-key": PK };
const OUT = path.resolve("reports/bil2502");
await mkdir(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];

async function j(url, opts) {
  const res = await fetch(url, opts);
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
}

/** Build a cart that satisfies every guard on /checkout/payment. */
async function prepareCart(label) {
  const regions = await j(`${BACKEND}/store/regions`, { headers: h });
  const regionId = regions.body.regions[0].id;
  const products = await j(`${BACKEND}/store/products?limit=50&region_id=${regionId}`, { headers: h });
  const product = products.body.products.find((p) => p.variants?.length);
  const variantId = product.variants[0].id;

  const email = `bil2502-${label}@bilulu.de`;
  const cart = await j(`${BACKEND}/store/carts`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ region_id: regionId, email }),
  });
  const cartId = cart.body.cart.id;
  await j(`${BACKEND}/store/carts/${cartId}/line-items`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ variant_id: variantId, quantity: 1 }),
  });
  await j(`${BACKEND}/store/carts/${cartId}`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      email,
      shipping_address: {
        first_name: "BIL2502",
        last_name: "Test",
        address_1: "Teststr 1",
        city: "Hassloch",
        postal_code: "67454",
        country_code: "de",
      },
    }),
  });
  const opts = await j(`${BACKEND}/store/shipping-options?cart_id=${cartId}`, { headers: h });
  const optionId = opts.body?.shipping_options?.[0]?.id;
  await j(`${BACKEND}/store/carts/${cartId}/shipping-methods`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ option_id: optionId }),
  });
  return { cartId, product: product.title, optionId };
}

const results = [];
await fetch(`${BACKEND}/__fault/${FAULT}`).then((r) => r.json()).then((r) => console.log("[proxy]", r));
const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  const { cartId, product, optionId } = await prepareCart(`${FAULT}-${vp.name}`);
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  await ctx.addCookies([
    { name: "bilulu_cart_id", value: cartId, domain: "localhost", path: "/", sameSite: "Lax" },
  ]);
  // Record a consent decision before first paint. Clicking the banner away is
  // unreliable (it mounts after hydration) and a fixed bottom sheet is painted
  // OVER the page in a fullPage screenshot, which hid the payment section in
  // the first run of this script — the BIL-2492 trap.
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
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));

  await page.goto(`${BASE}/checkout/payment`, { waitUntil: "networkidle", timeout: 90_000 });
  // Fail loudly if consent seeding did not take: a visible banner means the
  // screenshots below cannot be trusted as evidence.
  const consentVisible = await page.locator("#cookie-consent").isVisible().catch(() => false);
  if (consentVisible) throw new Error("consent banner still visible — screenshots would be invalid");

  const urlBefore = page.url();
  // Scope to our own banner: Next's dev overlay also renders an (empty)
  // role="alert" node, which is what made the first run look like a pass.
  const banner = page.getByTestId("checkout-error");
  const alertBefore = await banner.count();
  await page.screenshot({ path: path.join(OUT, `${FAULT}-${vp.name}-before.png`), fullPage: true });

  await page.getByRole("button", { name: "Bestellung verbindlich abschließen" }).click();
  // waitForLoadState resolves instantly after a server action, so wait on the
  // thing we actually care about: the redirect landing with ?error=.
  const redirected = await page
    .waitForURL(/error=/, { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  await banner.waitFor({ timeout: 20_000 }).catch(() => {});

  const alertText = (await banner.count()) ? (await banner.innerText()).trim() : null;
  await page.screenshot({ path: path.join(OUT, `${FAULT}-${vp.name}-after.png`), fullPage: true });

  const bodyText = (await page.textContent("body")) ?? "";
  results.push({
    viewport: vp.name,
    cartId,
    product,
    optionId,
    urlBefore,
    urlAfter: page.url(),
    redirected,
    alertsBeforeSubmit: alertBefore,
    alertText,
    // DoD: no raw code, no English Medusa message in customer-facing text.
    leaksRawCode: /insufficient_inventory|complete_failed|out_of_stock|http_\d/.test(bodyText),
    leaksMedusaMessage: /required inventory|shipping profiles|Internal server error/i.test(bodyText),
    consoleErrors,
  });
  await ctx.close();
}

await browser.close();
await writeFile(
  path.join(OUT, `results-${FAULT}.json`),
  JSON.stringify({ fault: FAULT, at: new Date().toISOString(), results }, null, 2),
);
console.log(JSON.stringify(results, null, 2));
