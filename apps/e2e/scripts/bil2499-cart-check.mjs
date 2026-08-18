/**
 * BIL-2499 — proves the short-Pumphose konfigurator puts the RIGHT
 * configuration in the cart (acceptance criterion 3).
 *
 * Drives the real form through a browser rather than POSTing the server action
 * by hand, because the thing under test is the whole chain: hidden inputs →
 * server action → getConfiguratorHoseKurzVariant → line-item metadata → cart
 * line rendering. A hand-built POST would skip the first and last of those.
 *
 * Only a CART is created — no order is placed.
 *
 *   node apps/e2e/scripts/bil2499-cart-check.mjs [baseUrl]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://127.0.0.1:3399";
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../reports/bil2499", BASE.includes("bilulu.de") ? "live" : "local");
await mkdir(OUT, { recursive: true });

// Deliberately not the defaults: if the action dropped the form values and fell
// back, the cart line would read "Terrakotta · Petrol" and the check would fail.
const QS = "?bund=navy&hose=stoff-14&buendchen=mustard&rot=180";
const EXPECT = ["kurz", "Marineblau", "Stoff 14", "Senfgelb", "180"];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/konfigurator/hose-kurz${QS}`, { waitUntil: "networkidle" });
const accept = page.getByRole("button", { name: /akzeptieren|alle annehmen|zustimmen/i }).first();
if (await accept.count()) await accept.click({ timeout: 2000 }).catch(() => {});

await page.getByRole("button", { name: /In den Warenkorb/i }).click();
await page.waitForURL(/\/cart/, { timeout: 45_000 });
await page.waitForLoadState("networkidle");

const body = await page.locator("main").innerText();
await page.screenshot({ path: path.join(OUT, "cart-after-add.png"), fullPage: true });

const missing = EXPECT.filter((t) => !body.includes(t));
const hasTitle = /Konfigurator-Hose \(kurz\)/.test(body);
const report = { base: BASE, qs: QS, hasTitle, missing, cartText: body.slice(0, 1200) };
await writeFile(path.join(OUT, "cart-check.json"), JSON.stringify(report, null, 2));

await browser.close();
console.log(JSON.stringify({ hasTitle, missing }, null, 2));
if (!hasTitle || missing.length) {
  console.error("FAIL — cart line does not carry the configuration");
  process.exit(1);
}
console.log("PASS — cart line shows the short configuration with all selections.");
