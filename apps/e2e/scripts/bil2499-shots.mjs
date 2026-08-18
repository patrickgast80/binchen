/**
 * BIL-2499 — viewport screenshots + axe scan for the short-Pumphose konfigurator.
 *
 * Code review is not visual review, so this drives a real browser at the two
 * viewports the team ships against and additionally zooms the waistband on two
 * different fabrics, which is the board's own acceptance evidence for the
 * "made with love" label.
 *
 *   node apps/e2e/scripts/bil2499-shots.mjs [baseUrl]
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3399";
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../reports/bil2499", BASE.includes("bilulu.de") ? "live" : "local");
await mkdir(OUT, { recursive: true });

const ROUTE = "/konfigurator/hose-kurz";

/**
 * Query strings chosen to hit the extremes: the untouched default, a
 * near-white uni (which would wash a leaked label out) and a real fabric print
 * with a quarter turn (which also exercises `?rot=`).
 */
const CASES = [
  { name: "default", qs: "" },
  { name: "cream", qs: "?bund=cream&hose=cream&buendchen=cream" },
  { name: "stoff14-rot90", qs: "?bund=mustard&hose=stoff-14&buendchen=mustard&rot=90" },
];

const VIEWPORTS = [
  { name: "mobile-390x844", width: 390, height: 844, isMobile: true },
  { name: "desktop-1440x900", width: 1440, height: 900, isMobile: false },
];

const browser = await chromium.launch();
const results = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  for (const c of CASES) {
    await page.goto(`${BASE}${ROUTE}${c.qs}`, { waitUntil: "networkidle" });
    // The cookie banner covers the bottom sheet on mobile — accept it once so
    // the screenshots show the real page and not a consent overlay.
    const accept = page.getByRole("button", { name: /akzeptieren|alle annehmen|zustimmen/i }).first();
    if (await accept.count()) {
      await accept.click({ timeout: 2000 }).catch(() => {});
    }
    // Every overlay must be decoded before the shot, else the preview is
    // captured mid-load and "proves" a blank garment.
    await page.evaluate(async () => {
      const imgs = Array.from(document.images);
      await Promise.all(imgs.map((i) => (i.complete ? i.decode().catch(() => {}) : null)));
    });
    await page.waitForTimeout(400);

    const file = path.join(OUT, `${vp.name}-${c.name}.png`);
    await page.screenshot({ path: file, fullPage: false });

    // Waistband zoom, clipped off the live preview element itself.
    const preview = page.getByRole("img", { name: /Live-Vorschau der konfigurierten kurzen Hose/i });
    const box = await preview.boundingBox();
    if (box) {
      await page.screenshot({
        path: path.join(OUT, `${vp.name}-${c.name}-bund.png`),
        clip: {
          x: box.x + box.width * 0.42,
          y: box.y + box.height * 0.0,
          width: box.width * 0.45,
          height: box.height * 0.28,
        },
      });
    }
    results.push({ viewport: vp.name, case: c.name, consoleErrors: consoleErrors.length });
  }

  // One axe pass per viewport on the default state.
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: "networkidle" });
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  results.push({
    viewport: vp.name,
    case: "axe",
    violations: axe.violations.map((v) => `${v.id}(${v.nodes.length})`),
  });

  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
const violations = results.filter((r) => r.violations?.length);
const errors = results.filter((r) => r.consoleErrors > 0);
if (violations.length || errors.length) {
  console.error("FAIL", { violations, errors });
  process.exit(1);
}
console.log("PASS — no axe violations, no console errors.\nshots in", OUT);
