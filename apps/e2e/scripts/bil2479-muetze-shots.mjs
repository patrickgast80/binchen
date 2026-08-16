/**
 * BIL-2479 — viewport screenshots of the Mütze-Konfigurator after standing the
 * base photo upright (crown up, brim down) and porting the BIL-2473 fabric
 * pipeline onto it.
 *
 * Walks three colour combinations — the Sage/Powder-Pink default plus two
 * saturated ones (Petrol and Marineblau), which is where the multiply path
 * loses the most fine structure and where the board's "keine Stoffzeichnung"
 * complaint bites hardest — captures the full page and a close-up of the
 * preview at both viewports, and runs an axe scan on the surface.
 *
 * Usage: BASE=http://localhost:3217 node scripts/bil2479-muetze-shots.mjs
 */
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE ?? "http://localhost:3217";
const OUT = process.env.OUT ?? "reports/bil2479";
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];
const COMBOS = [
  { id: "sage-powderpink", muetze: "sage", futter: "powder-pink" },
  { id: "petrol-cream", muetze: "petrol", futter: "cream" },
  { id: "navy-sand", muetze: "navy", futter: "sand" },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const consoleErrors = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`[${vp.name}] ${m.text()}`); });
  page.on("pageerror", (e) => consoleErrors.push(`[${vp.name}] pageerror: ${e.message}`));

  for (const combo of COMBOS) {
    const url = `${BASE}/konfigurator/muetze?muetze=${combo.muetze}&futter=${combo.futter}`;
    await page.goto(url, { waitUntil: "networkidle" });
    const accept = page.getByRole("button", { name: /akzeptieren|zustimmen|alle/i }).first();
    if (await accept.isVisible().catch(() => false)) {
      await accept.click();
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(500);

    await page.screenshot({ path: `${OUT}/${vp.name}-${combo.id}-page.png`, fullPage: false });

    // Same constraint as BIL-2473: on mobile the fixed palette sheet covers the
    // preview at every scroll position, so it is hidden for the close-up only.
    // The page shot above keeps the untouched layout on record.
    if (vp.name === "mobile") {
      await page.addStyleTag({ content: '[aria-label="Farbauswahl-Panel"]{display:none !important}' });
      await page.waitForTimeout(200);
    }
    const preview = page.getByRole("img", { name: /live-vorschau der konfigurierten bilulu-mütze/i }).first();
    if (await preview.count()) {
      await preview.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await preview.screenshot({ path: `${OUT}/${vp.name}-${combo.id}-preview.png` });
    } else {
      console.log("preview not found for", vp.name, combo.id);
    }
  }

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  console.log(`axe ${vp.name}: ${axe.violations.length} violations`);
  for (const v of axe.violations) console.log(`  ${v.id} (${v.impact}) x${v.nodes.length} — ${v.help}`);
  await ctx.close();
}

await browser.close();
console.log(consoleErrors.length ? `console errors:\n${consoleErrors.join("\n")}` : "console errors: none");
