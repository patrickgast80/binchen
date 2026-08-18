/**
 * BIL-2510 — the follow-on the banner itself created: `?error=` must not leak
 * into anything that *reuses* the URL.
 *
 * Without this, a customer who hits the error and then shares her link, or
 * saves it with "Merken", hands out a URL that opens with an error banner for
 * someone whose click never failed.
 *
 * Checks per konfigurator, in the error state:
 *   1. the "Merken" entry's href carries no `error`
 *   2. the hidden `configHref` field carries no `error`
 *   3. changing a colour drops `error` from the address bar and with it the
 *      banner — the error clears when the customer does something
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BIL2510_BASE ?? "http://127.0.0.1:3211";
const OUT = path.resolve("reports/bil2510");
mkdirSync(OUT, { recursive: true });

const SURFACES = [
  { id: "hose", query: "bund=sage&hose=stoff-05&buendchen=terracotta" },
  { id: "hose-kurz", query: "bund=sky&hose=stoff-05&buendchen=powder-pink&rot=90" },
  { id: "turban", query: "turban=stoff-05&schleife=terracotta" },
  { id: "muetze", query: "muetze=stoff-05&futter=sage" },
  { id: "dreieckstuch", query: "tuch=stoff-05" },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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

for (const s of SURFACES) {
  await page.goto(`${BASE}/konfigurator/${s.id}?${s.query}&error=variant_unavailable`, {
    waitUntil: "networkidle",
  });

  const configHref = await page.locator('input[name="configHref"]').inputValue();
  // "Merken" writes the current href into the saved-config store; save one and
  // read back what was stored.
  const saveButton = page.getByRole("button", { name: /merken/i }).first();
  let savedHref = null;
  if (await saveButton.count()) {
    await saveButton.click();
    await page.waitForTimeout(400);
    savedHref = await page.evaluate(() => {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key || !/config/i.test(key)) continue;
        const raw = window.localStorage.getItem(key) ?? "";
        if (raw.includes("konfigurator")) return raw;
      }
      return null;
    });
  }

  const bannerBefore = await page.locator('[data-testid="konfigurator-error"]').count();
  // Pick any swatch that is not the current one and see whether the error
  // survives the interaction.
  const swatch = page.locator("button", { hasText: "Tannengrün" }).first();
  let urlAfter = null;
  let bannerAfter = null;
  if (await swatch.count()) {
    await swatch.click();
    await page.waitForTimeout(1200);
    urlAfter = page.url();
    bannerAfter = await page.locator('[data-testid="konfigurator-error"]').count();
  }

  results.push({
    surface: s.id,
    bannerBefore,
    configHrefHasError: /[?&]error=/.test(configHref),
    savedHrefHasError: savedHref ? /error=/.test(savedHref) : "no-save",
    urlAfterChangeHasError: urlAfter ? /[?&]error=/.test(urlAfter) : "no-swatch",
    bannerAfterChange: bannerAfter,
  });
  await page.evaluate(() => window.localStorage.removeItem("bilulu_konfigurator_saved_v1"));
}

await browser.close();
writeFileSync(path.join(OUT, "param-hygiene.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
