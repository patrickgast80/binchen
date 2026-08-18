/**
 * BIL-2510 — visual + a11y proof that `?error=` is now visible on every
 * konfigurator, and that the customer's colours survive the bounce.
 *
 * Runs against a local `next start` (default :3210). For each konfigurator:
 *   1. shot WITHOUT ?error= (control — banner must be absent)
 *   2. shot WITH ?error=variant_unavailable plus a non-default selection
 *      (banner must be present, selection must still be in the URL and in the
 *      rendered summary)
 *   3. axe-core scan on the error state
 * at 390x844 and 1440x900.
 */
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BIL2510_BASE ?? "http://127.0.0.1:3210";
const OUT = path.resolve("reports/bil2510");

/** query = a non-default selection, so a reset would be obvious in the shot */
const SURFACES = [
  { id: "hose", query: "bund=sage&hose=stoff-05&buendchen=terracotta" },
  { id: "hose-kurz", query: "bund=sky&hose=stoff-05&buendchen=powder-pink&rot=90" },
  { id: "turban", query: "turban=stoff-05&schleife=terracotta" },
  { id: "muetze", query: "muetze=stoff-05&futter=sage" },
  { id: "dreieckstuch", query: "tuch=stoff-05" },
];

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];

mkdirSync(OUT, { recursive: true });

const results = [];
const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
  });
  // Consent banner would cover the fold and make every shot look identical
  // (BIL-2492 lesson). It stores a decision in localStorage, not a cookie.
  await context.addInitScript(() => {
    window.localStorage.setItem(
      "bilulu_cookie_consent_v1",
      JSON.stringify({
        version: "1",
        decidedAt: "2026-08-18T00:00:00.000Z",
        categories: { strict: true, functional: false, analytics: false, marketing: false },
      }),
    );
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });

  for (const s of SURFACES) {
    const control = `${BASE}/konfigurator/${s.id}?${s.query}`;
    const errored = `${control}&error=variant_unavailable`;

    await page.goto(control, { waitUntil: "networkidle" });
    const bannerOnControl = await page.locator('[data-testid="konfigurator-error"]').count();
    await page.screenshot({ path: path.join(OUT, `${s.id}-${vp.name}-control.png`) });

    await page.goto(errored, { waitUntil: "networkidle" });
    const banner = page.locator('[data-testid="konfigurator-error"]');
    const bannerCount = await banner.count();
    const bannerText = bannerCount ? (await banner.innerText()).replace(/\s+/g, " ").trim() : null;
    const role = bannerCount ? await banner.getAttribute("role") : null;
    // The whole point of preserving configHref: the selection summary must
    // still show the chosen colours, not the defaults.
    const summary = (await page.locator("dl").first().innerText()).replace(/\s+/g, " ").trim();
    await page.screenshot({ path: path.join(OUT, `${s.id}-${vp.name}-error.png`) });

    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    results.push({
      surface: s.id,
      viewport: vp.name,
      bannerOnControl,
      bannerOnError: bannerCount,
      role,
      bannerText,
      summary,
      axeViolations: axe.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
    });
  }

  results.push({ viewport: vp.name, consoleErrors });
  await context.close();
}

await browser.close();
writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
