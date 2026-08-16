/**
 * BIL-2474 — mobile Farbauswahl-Panel must not swallow the Konfigurator preview.
 *
 * Measures the fixed bottom sheet against the live preview at 390x844 for every
 * region tab, captures screenshots at 390x844 + 1440x900 and runs axe on both.
 *
 * Usage: BASE=http://localhost:3217 PHASE=before node scripts/bil2474-palette-sheet.mjs
 */
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE ?? "http://localhost:3217";
const PHASE = process.env.PHASE ?? "after";
const OUT = process.env.OUT ?? `reports/bil2474/${PHASE}`;
const URL_PATH = process.env.URL_PATH ?? "/konfigurator/hose";

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const consoleErrors = [];
const report = [];

async function acceptCookies(page) {
  const accept = page.getByRole("button", { name: /akzeptieren|zustimmen|alle/i }).first();
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
    await page.waitForTimeout(300);
  }
}

// ---------- mobile ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`[mobile] ${m.text()}`); });
  page.on("pageerror", (e) => consoleErrors.push(`[mobile] pageerror: ${e.message}`));

  await page.goto(`${BASE}${URL_PATH}`, { waitUntil: "networkidle" });
  await acceptCookies(page);
  await page.waitForTimeout(400);

  const sheet = page.locator('[aria-label="Farbauswahl-Panel"]');
  const preview = page.getByRole("img", { name: /live-vorschau/i }).first();
  const tabs = page.getByRole("tab");
  const tabCount = await tabs.count();

  for (let i = 0; i < tabCount; i++) {
    const tab = tabs.nth(i);
    const label = (await tab.textContent())?.trim() ?? `tab-${i}`;
    await tab.click();
    await page.waitForTimeout(350);

    // scrollIntoViewIfNeeded is blind to a fixed overlay, so scroll by hand:
    // put the preview's top edge just below the viewport top and then ask
    // whether it clears the sheet.
    await preview.evaluate((el) => {
      const y = el.getBoundingClientRect().top + window.scrollY - 8;
      window.scrollTo({ top: y, behavior: "instant" });
    });
    await page.waitForTimeout(350);

    const sheetBox = await sheet.boundingBox();
    const previewBox = await preview.boundingBox();
    // First swatch radio inside the currently visible panel.
    const firstSwatch = page.locator('[aria-label="Farbauswahl-Panel"] [role="radio"]').first();
    const swatchBox = await firstSwatch.boundingBox().catch(() => null);
    const swatchVisible = swatchBox
      ? swatchBox.y >= 0 && swatchBox.y + swatchBox.height <= 844
      : false;

    const freeTop = sheetBox ? sheetBox.y : 844;
    const previewFullyVisible = previewBox
      ? previewBox.y >= 0 && previewBox.y + previewBox.height <= freeTop
      : false;

    report.push({
      tab: label,
      sheetHeight: sheetBox ? Math.round(sheetBox.height) : null,
      sheetTop: sheetBox ? Math.round(sheetBox.y) : null,
      freeViewportAboveSheet: Math.round(freeTop),
      previewY: previewBox ? Math.round(previewBox.y) : null,
      previewHeight: previewBox ? Math.round(previewBox.height) : null,
      previewFullyVisible,
      firstSwatchVisible: swatchVisible,
      swatchTapTarget: swatchBox
        ? `${Math.round(swatchBox.width)}x${Math.round(swatchBox.height)}`
        : null,
      tabTapTarget: await tab.boundingBox().then((b) =>
        b ? `${Math.round(b.width)}x${Math.round(b.height)}` : null,
      ),
    });

    await page.screenshot({
      path: `${OUT}/mobile-${String(i)}-${label.toLowerCase().replace(/[^a-z]/g, "")}.png`,
      fullPage: false,
    });
  }

  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  console.log(`axe mobile: ${axe.violations.length} violations`);
  for (const v of axe.violations) console.log(`  ${v.id} (${v.impact}) x${v.nodes.length} — ${v.help}`);
  await ctx.close();
}

// ---------- desktop (sheet is md:hidden — regression guard) ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`[desktop] ${m.text()}`); });
  page.on("pageerror", (e) => consoleErrors.push(`[desktop] pageerror: ${e.message}`));
  await page.goto(`${BASE}${URL_PATH}`, { waitUntil: "networkidle" });
  await acceptCookies(page);
  await page.waitForTimeout(400);
  const sheetVisible = await page
    .locator('[aria-label="Farbauswahl-Panel"]')
    .isVisible()
    .catch(() => false);
  console.log(`desktop sheet visible (expect false): ${sheetVisible}`);
  await page.screenshot({ path: `${OUT}/desktop.png`, fullPage: false });

  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  console.log(`axe desktop: ${axe.violations.length} violations`);
  for (const v of axe.violations) console.log(`  ${v.id} (${v.impact}) x${v.nodes.length} — ${v.help}`);
  await ctx.close();
}

await browser.close();
console.table(report);
console.log(consoleErrors.length ? `console errors:\n${consoleErrors.join("\n")}` : "console errors: none");
