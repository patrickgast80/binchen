/**
 * BIL-2473 — viewport screenshots of the Hose-Konfigurator preview after the
 * Bündchen/Bund rework. Walks three colours (Petrol default, Terrakotta, Navy)
 * and captures the full page plus a close-up of the preview at both viewports,
 * and runs an axe scan on the surface.
 *
 * Usage: BASE=http://localhost:3217 node scripts/bil2473-shots.mjs
 */
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE ?? "http://localhost:3217";
const OUT = process.env.OUT ?? "reports/bil2473";
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];
const COLOURS = ["petrol", "terracotta", "navy"];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const consoleErrors = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`[${vp.name}] ${m.text()}`); });
  page.on("pageerror", (e) => consoleErrors.push(`[${vp.name}] pageerror: ${e.message}`));

  for (const colour of COLOURS) {
    const url = `${BASE}/konfigurator/hose?bund=${colour}&hose=cream&buendchen=${colour}`;
    await page.goto(url, { waitUntil: "networkidle" });
    // Cookie banner, if the consent state is not already set.
    const accept = page.getByRole("button", { name: /akzeptieren|zustimmen|alle/i }).first();
    if (await accept.isVisible().catch(() => false)) {
      await accept.click();
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(500);

    await page.screenshot({ path: `${OUT}/${vp.name}-${colour}-page.png`, fullPage: false });

    // On mobile the fixed palette sheet is 711 px tall on an 844 px viewport
    // and covers the preview at every scroll position, so the preview cannot be
    // photographed in situ. That is a separate, pre-existing layout defect (the
    // sheet's horizontal region scroller sizes to its TALLEST panel — the Hose
    // panel with all fabric swatches — instead of the active one). Hide the
    // sheet for the close-up so this ticket's own change is still verifiable at
    // 390x844; the page shot above keeps the untouched layout on record.
    if (vp.name === "mobile") {
      await page.addStyleTag({ content: '[aria-label="Farbauswahl-Panel"]{display:none !important}' });
      await page.waitForTimeout(200);
    }
    const preview = page.getByRole("img", { name: /live-vorschau der konfigurierten hose/i }).first();
    if (await preview.count()) {
      await preview.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await preview.screenshot({ path: `${OUT}/${vp.name}-${colour}-preview.png` });
    } else {
      console.log("preview not found for", vp.name, colour);
    }
  }

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  console.log(`axe ${vp.name}: ${axe.violations.length} violations`);
  for (const v of axe.violations) console.log(`  ${v.id} (${v.impact}) x${v.nodes.length} — ${v.help}`);
  await ctx.close();
}

await browser.close();
console.log(consoleErrors.length ? `console errors:\n${consoleErrors.join("\n")}` : "console errors: none");
