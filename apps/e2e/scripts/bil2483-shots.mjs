// BIL-2483: before/after screenshots of the product-card frame.
// Usage: node bil2483-shots.mjs <baseUrl> <label>
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const base = process.argv[2] ?? "https://bilulu.de";
const label = process.argv[3] ?? "before";
const outDir = path.resolve(process.cwd(), "reports/bil2483", label);
mkdirSync(outDir, { recursive: true });

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844, dsf: 2 },
  { name: "desktop", width: 1440, height: 900, dsf: 1 },
];

const PAGES = [
  { name: "catalog", url: "/catalog" },
  { name: "home", url: "/" },
  { name: "konfigurator", url: "/konfigurator" },
];

const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dsf,
  });
  const page = await ctx.newPage();

  for (const p of PAGES) {
    await page.goto(base + p.url, { waitUntil: "networkidle", timeout: 60_000 });
    // Cookie banner would cover the fold on the first visit.
    const accept = page.getByRole("button", { name: /alle akzeptieren|akzeptieren/i }).first();
    if (await accept.isVisible().catch(() => false)) {
      await accept.click();
      await page.waitForTimeout(400);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    // next/image lazy-loads; networkidle fires before the decode finishes, which
    // otherwise screenshots alt text instead of the photo.
    await page
      .waitForFunction(
        () => [...document.querySelectorAll("img")].every((i) => i.complete && i.naturalWidth > 0),
        null,
        { timeout: 30_000 },
      )
      .catch(() => {});
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(outDir, `${p.name}-${vp.name}.png`), fullPage: false });

    // A tight crop of the first product card is what actually shows the frame.
    const card = page.locator("ul[aria-label='Produkte'] > li, ul > li a[href^='/konfigurator/']").first();
    if (await card.count()) {
      await card.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await card
        .screenshot({ path: path.join(outDir, `${p.name}-card-${vp.name}.png`) })
        .catch(() => {});
    }
  }

  // PDP: first product from the catalog.
  await page.goto(base + "/catalog", { waitUntil: "networkidle", timeout: 60_000 });
  const href = await page
    .locator("ul[aria-label='Produkte'] a[href^='/product/']")
    .first()
    .getAttribute("href")
    .catch(() => null);
  if (href) {
    await page.goto(base + href, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, `pdp-${vp.name}.png`) });
  }

  await ctx.close();
}

await browser.close();
console.log(`shots written to ${outDir}`);
