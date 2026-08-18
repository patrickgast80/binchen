/**
 * BIL-2516 — press the real button and prove what the customer sees.
 *
 * Runs against a storefront built to talk to bil2516-fault-proxy.mjs, so every
 * case below is an actual "In den Warenkorb" click, not a hand-typed `?error=`
 * URL. That distinction is the whole point: the ticket is about the *click*
 * going nowhere, and typing the error URL yourself would only prove the banner
 * renders, not that the action ever sends her there.
 *
 * The `off` case is the control and it must still end in a cart WITH the item —
 * an error path that also breaks the happy path is not a fix.
 */
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3210";
const HERE = dirname(fileURLToPath(import.meta.url));
const MODE_FILE = join(HERE, "bil2516-fault-mode.txt");
const OUT = join(HERE, "..", "reports", "bil2516");
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];

const CASES = [
  { mode: "off", label: "control", expectUrl: /\/cart$/, expectBanner: null },
  { mode: "out_of_stock", label: "out_of_stock", expectUrl: /\/product\/[^?]+\?error=out_of_stock$/, expectBanner: "Einzelstück" },
  { mode: "backend_error", label: "backend_unavailable", expectUrl: /\/product\/[^?]+\?error=backend_unavailable$/, expectBanner: "nicht geklappt" },
  { mode: "hangup", label: "transport", expectUrl: /\/product\/[^?]+\?error=backend_unavailable$/, expectBanner: "nicht geklappt" },
];

async function firstProductId() {
  const res = await fetch(`${BASE}/catalog`);
  const html = await res.text();
  const m = html.match(/\/product\/(prod_[A-Z0-9]+)/);
  if (!m) throw new Error("no product link found on /catalog");
  return m[1];
}

const results = [];

const productId = await firstProductId();
console.log(`product: ${productId}`);

const browser = await chromium.launch();

for (const c of CASES) {
  writeFileSync(MODE_FILE, c.mode);
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
    // A bare "Failed to load resource" tells you nothing about whose resource
    // it was — record the URL and status so a pre-existing asset 400 can be
    // told apart from something this change broke.
    const failedRequests = [];
    page.on("response", (r) => {
      if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, "")}`);
    });

    await page.goto(`${BASE}/product/${productId}`, { waitUntil: "networkidle" });
    // Dismiss the consent banner: it covers the lower third on mobile, and a
    // screenshot where every case is half cookie-banner proves nothing
    // (BIL-2492 lesson). "Alle ablehnen" — never auto-grant.
    // By testid, not by name: the button carries aria-label="Alle nicht
    // notwendigen Cookies ablehnen", so a by-name lookup matches nothing and
    // an `if (count)` guard swallows that into a silent skip — every screenshot
    // then shows the consent sheet instead of the thing under test.
    await page.locator('[data-testid="cookie-reject-all"]').click();

    const before = page.url();
    await page.getByRole("button", { name: "In den Warenkorb" }).click();
    // A server action redirect is a client-side navigation on an already-idle
    // page, so `networkidle` alone returns *before* the action even runs — that
    // read the old URL and made every case look like the bug.
    await page
      .waitForFunction((u) => location.href !== u, before, { timeout: 20_000 })
      .catch(() => {});
    await page.waitForLoadState("networkidle");

    const url = page.url().replace(BASE, "");
    // Scoped to our own testids: the consent layer also carries a live region,
    // and counting that as "the error banner" would pass without a fix.
    const alert = page.locator('[data-testid="product-error"], [data-testid="cart-error"]');
    const alertCount = await alert.count();
    const alertText = alertCount ? (await alert.first().innerText()).replace(/\s+/g, " ") : null;
    const cartLines = await page.locator('section[aria-label="Artikel im Warenkorb"] li').count();

    // "In the DOM" is not "she sees it". A server-action redirect keeps the
    // scroll position, so a banner can pass every text assertion while sitting
    // 500px above the viewport — which is the original bug wearing a hat.
    const view = alertCount
      ? await page.evaluate(() => {
          const el = document.querySelector('[data-testid="product-error"], [data-testid="cart-error"]');
          const r = el.getBoundingClientRect();
          return { scrollY: Math.round(scrollY), top: Math.round(r.top), inView: r.bottom > 0 && r.top < innerHeight };
        })
      : null;

    const shot = join(OUT, `add-${c.label}-${vp.name}.png`);
    await page.screenshot({ path: shot, fullPage: false });

    // a11y only where the new node is, and only on the surface it changed.
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();

    const urlOk = c.expectUrl.test(url);
    const bannerOk = c.expectBanner
      ? alertCount === 1 && alertText.includes(c.expectBanner) && view?.inView === true
      : alertCount === 0;
    const cartOk = c.mode === "off" ? cartLines > 0 : true;

    results.push({
      mode: c.mode,
      viewport: vp.name,
      url,
      urlOk,
      alertCount,
      alertText,
      bannerOk,
      view,
      cartLines,
      cartOk,
      axeViolations: axe.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
      consoleErrors,
      failedRequests,
      pass: urlOk && bannerOk && cartOk && axe.violations.length === 0,
      screenshot: shot,
    });
    console.log(
      `${c.mode.padEnd(14)} ${vp.name.padEnd(8)} ${urlOk ? "url✓" : "url✗"} ${bannerOk ? "banner✓" : "banner✗"} ` +
        `${view ? `inView=${view.inView} (scrollY=${view.scrollY}, top=${view.top}) ` : ""}` +
        `axe=${axe.violations.length} http4xx=[${failedRequests.join(", ")}] -> ${url}`,
    );

    // Empty the cart again so the control case is not polluted by a leftover
    // line item from a previous run.
    await ctx.close();
  }
}

// The cart's own failure path — a real "Entfernen" on a real line item, so the
// banner is photographed over a cart that still holds the piece it talks about.
for (const vp of VIEWPORTS) {
  writeFileSync(MODE_FILE, "off");
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/product/${productId}`, { waitUntil: "networkidle" });
  await page.locator('[data-testid="cookie-reject-all"]').click();
  let before = page.url();
  await page.getByRole("button", { name: "In den Warenkorb" }).click();
  await page.waitForFunction((u) => location.href !== u, before, { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  const linesBefore = await page.locator('section[aria-label="Artikel im Warenkorb"] li').count();

  writeFileSync(MODE_FILE, "remove_fail");
  before = page.url();
  await page.getByRole("button", { name: /entfernen/i }).first().click();
  await page.waitForFunction((u) => location.href !== u, before, { timeout: 20_000 }).catch(() => {});
  await page.waitForLoadState("networkidle");

  const url = page.url().replace(BASE, "");
  const alert = page.locator('[data-testid="cart-error"]');
  const text = (await alert.count()) ? (await alert.first().innerText()).replace(/\s+/g, " ") : null;
  const linesAfter = await page.locator('section[aria-label="Artikel im Warenkorb"] li').count();
  await page.screenshot({ path: join(OUT, `remove-failed-${vp.name}.png`) });
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();

  results.push({
    mode: "cart:remove_failed",
    viewport: vp.name,
    url,
    alertText: text,
    linesBefore,
    linesAfter,
    axeViolations: axe.violations.map((v) => ({ id: v.id, impact: v.impact })),
    pass:
      linesBefore === 1 &&
      url === "/cart?error=remove_failed" &&
      !!text &&
      text.includes("nicht entfernt") &&
      // The copy says the piece is still in the cart. If it were not, that
      // sentence would be the next silent lie.
      linesAfter === 1 &&
      axe.violations.length === 0,
    screenshot: join(OUT, `remove-failed-${vp.name}.png`),
  });
  console.log(
    `remove_fail    ${vp.name.padEnd(8)} lines ${linesBefore}->${linesAfter} axe=${axe.violations.length} -> ${url}`,
  );
  await ctx.close();
}

// Regression guard on the neighbour: `addLineItem` is now a wrapper around
// `addLineItemResult`, and all cart calls go through `cartFetch`. The six
// konfigurators (BIL-2510) must be untouched by that — success still lands on
// /cart?added=konfigurator, failure still shows their own single banner.
for (const [mode, expectUrl, expectBanner] of [
  ["off", "/cart?added=konfigurator", false],
  ["out_of_stock", "/konfigurator/dreieckstuch?error=add_failed", true],
]) {
  writeFileSync(MODE_FILE, mode);
  // Desktop: on mobile the konfigurator's fixed colour panel sits over the
  // button. That is its own (intended) layout, not what this guard is about.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/konfigurator/dreieckstuch`, { waitUntil: "networkidle" });
  await page.locator('[data-testid="cookie-reject-all"]').click();
  const before = page.url();
  await page.getByRole("button", { name: /In den Warenkorb/i }).first().click();
  await page.waitForFunction((u) => location.href !== u, before, { timeout: 20_000 }).catch(() => {});
  await page.waitForLoadState("networkidle");
  const url = page.url().replace(BASE, "");
  const banner = await page.locator('[data-testid="konfigurator-error"]').count();
  results.push({
    mode: `konfigurator:${mode}`,
    viewport: "mobile",
    url,
    alertCount: banner,
    pass: url === expectUrl && banner === (expectBanner ? 1 : 0),
  });
  console.log(`konfig ${mode.padEnd(14)} banner=${banner} -> ${url}`);
  await ctx.close();
}

await browser.close();
writeFileSync(MODE_FILE, "off");
writeFileSync(join(OUT, "results.json"), JSON.stringify({ productId, base: BASE, results }, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} pass`);
if (failed.length) {
  console.log(JSON.stringify(failed, null, 2));
  process.exit(1);
}
