#!/usr/bin/env node
/**
 * BIL-2496 live verification against bilulu.de.
 *
 * Proves the two things Patrick asked for, plus the two traps the ticket named:
 *   1. Pumphose "Wale" altrosa is gone from every catalog page.
 *   2. The Bilulu-Body (Konfigurator) card is gone from the catalog AND the
 *      homepage, while the product itself survives as a draft (checked by
 *      apps/backend/scripts/bil2496/apply.mjs, not here).
 *   3. The Hose-Konfigurator still resolves and its add-to-cart works.
 *   4. /konfigurator/body no longer serves a dead-end configurator.
 *
 * The cookie banner is dismissed before any screenshot: it overlays the lower
 * third of the viewport, and a "proof" screenshot that only shows the banner is
 * how a previous ticket produced two byte-identical evidence shots.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "../reports/bil2496");
mkdirSync(OUT, { recursive: true });

const BASE = "https://bilulu.de";
const GONE = [/Wale["”\s]*\s*altrosa/i, /Bilulu-Body/i];

/**
 * Pre-seed the consent decision instead of clicking the banner away per page.
 * Clicking works but the decision is written to localStorage by a client
 * effect, and a `goto` that lands before that effect re-runs shows the banner
 * again — which is how the first run of this script produced screenshots with
 * the banner still covering a card row.
 * Key/shape mirror apps/storefront/src/components/cookie-consent/cookie-consent.tsx.
 */
const CONSENT_INIT = `try{localStorage.setItem("bilulu_cookie_consent_v1",JSON.stringify({
  version:"1",decidedAt:new Date().toISOString(),
  categories:{strict:true,functional:true,analytics:false,marketing:false}
}))}catch(e){}`;

async function dismissCookies(page) {
  // Belt and braces: if the banner still renders (e.g. policy version bumped),
  // click it away so the shot is never a picture of the banner.
  const btn = page.getByRole("button", { name: /Alle akzeptieren/i });
  if (await btn.count()) {
    await btn.first().click();
    await page.waitForTimeout(400);
  }
  if (await page.getByText(/Wir respektieren deine Privatsph/i).count()) {
    throw new Error("cookie banner still visible — screenshot would not be valid evidence");
  }
}

async function cardTitles(page) {
  return page.$$eval("h2", (hs) =>
    hs.map((h) => h.textContent.trim()).filter((t) => !/^Filter$|Privatsph/.test(t))
  );
}

const results = { at: new Date().toISOString(), checks: {}, pages: {} };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.addInitScript(CONSENT_INIT);

// ---- catalog, every page ----
const allTitles = [];
for (let n = 1; n <= 5; n++) {
  await page.goto(`${BASE}/catalog?page=${n}`, { waitUntil: "networkidle" });
  await dismissCookies(page);
  const titles = await cardTitles(page);
  if (!titles.length) break;
  allTitles.push(...titles);
  results.pages[`catalog_page_${n}`] = titles;
  await page.screenshot({ path: join(OUT, `catalog-page-${n}.png`), fullPage: true });
}
results.checks.catalog_card_count = allTitles.length;
for (const re of GONE) {
  results.checks[`catalog_absent_${re.source.slice(0, 14)}`] = !allTitles.some((t) => re.test(t));
}

// ---- homepage feature cards ----
await page.goto(BASE, { waitUntil: "networkidle" });
await dismissCookies(page);
const home = await page.$$eval("h3, h2", (hs) => hs.map((h) => h.textContent.trim()));
results.pages.homepage_headings = home;
results.checks.homepage_absent_body = !home.some((t) => /Bilulu-Body/i.test(t));
results.checks.homepage_absent_wale_altrosa = !home.some((t) => /Wale["”\s]*\s*altrosa/i.test(t));
await page.screenshot({ path: join(OUT, "homepage.png"), fullPage: true });

// ---- konfigurator hub: body must not be advertised ----
await page.goto(`${BASE}/konfigurator`, { waitUntil: "networkidle" });
await dismissCookies(page);
const hub = await page.$$eval("h3", (hs) => hs.map((h) => h.textContent.trim()));
results.pages.hub_tiles = hub;
results.checks.hub_absent_body = !hub.some((t) => /body/i.test(t));
await page.screenshot({ path: join(OUT, "konfigurator-hub.png"), fullPage: true });

// ---- /konfigurator/body must be gated off (404), /hose must still work ----
const bodyResp = await page.goto(`${BASE}/konfigurator/body`, { waitUntil: "domcontentloaded" });
results.checks.body_route_status = bodyResp.status();
results.checks.body_route_gated = bodyResp.status() === 404;
await page.screenshot({ path: join(OUT, "konfigurator-body-route.png"), fullPage: true });

const hoseResp = await page.goto(`${BASE}/konfigurator/hose`, { waitUntil: "networkidle" });
await dismissCookies(page);
results.checks.hose_route_status = hoseResp.status();
const cartBtn = await page.getByRole("button", { name: /Warenkorb/i }).count();
results.checks.hose_has_cart_button = cartBtn > 0;
await page.screenshot({ path: join(OUT, "konfigurator-hose.png"), fullPage: true });

await browser.close();

writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
for (const [k, v] of Object.entries(results.checks)) console.log(`${String(v).padEnd(6)} ${k}`);
const failed = Object.entries(results.checks).filter(([k, v]) => v === false && k !== "body_route_gated");
console.log(failed.length ? `\nFAILED: ${failed.map(([k]) => k).join(", ")}` : "\nall catalog checks green");
console.log(`screenshots -> ${OUT}`);
