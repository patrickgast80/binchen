// BIL-2483: the cart thumbnail uses the same tile pattern, so it needs a real
// line item to be reviewed visually rather than by diff.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const base = process.argv[2] ?? "http://localhost:3007";
const label = process.argv[3] ?? "after";
const outDir = path.resolve(process.cwd(), "reports/bil2483", label);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();

for (const vp of [
  { name: "mobile", width: 390, height: 844, dsf: 2 },
  { name: "desktop", width: 1440, height: 900, dsf: 1 },
]) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dsf,
  });
  const page = await ctx.newPage();

  await page.goto(base + "/catalog", { waitUntil: "domcontentloaded", timeout: 90_000 });
  const accept = page.getByRole("button", { name: /alle akzeptieren/i }).first();
  if (await accept.isVisible().catch(() => false)) await accept.click();

  const href = await page
    .locator("ul[aria-label='Produkte'] a[href^='/product/']")
    .first()
    .getAttribute("href");
  await page.goto(base + href, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByRole("button", { name: /in den warenkorb/i }).first().click();
  await page.waitForTimeout(3000);

  await page.goto(base + "/cart", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page
    .waitForFunction(
      () => [...document.querySelectorAll("img")].every((i) => i.complete && i.naturalWidth > 0),
      null,
      { timeout: 30_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(outDir, `cart-${vp.name}.png`) });

  const li = page.locator("ul[role='list'] > li").first();
  if (await li.count()) {
    await li.screenshot({ path: path.join(outDir, `cart-item-${vp.name}.png`) }).catch(() => {});
  }
  await ctx.close();
}

await browser.close();
console.log("cart shots done");
