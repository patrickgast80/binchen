// BIL-2473 — Frontend own visual acceptance: Bund (waistband) close-up per colour.
// QA's BIL-2475 *-bund-zoom crops landed on the crotch, so the waistband was only
// ever reviewed at full-preview scale. This re-shoots the top of the preview.
import { chromium } from "@playwright/test";

const OUT = "C:/Users/Besitzer/.paperclip/instances/default/projects/723a0156-47d4-4ec0-9d21-81a1cebeb182/5e251e01-8c35-4243-9a64-ebccc2ffed74/_default/apps/e2e/reports/bil2473-accept";
const base = "https://bilulu.de";

const combos = [
  { name: "petrol-cream-petrol", qs: "" }, // default = the board's repro
  { name: "navy-cream-navy", qs: "?bund=navy&hose=cream&buendchen=navy" },
  { name: "forest-sand-rust", qs: "?bund=forest&hose=sand&buendchen=rust" },
  { name: "rust-taupe-rust", qs: "?bund=rust&hose=taupe&buendchen=rust" },
];

const browser = await chromium.launch();

async function acceptCookies(page) {
  try {
    await page.click('button:has-text("Alle akzeptieren")', { timeout: 3000 });
    await page.waitForTimeout(300);
  } catch {}
}

// --- desktop: waistband close-up -------------------------------------------
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

for (const combo of combos) {
  await page.goto(`${base}/konfigurator/hose${combo.qs}`, { waitUntil: "networkidle", timeout: 45000 });
  await acceptCookies(page);
  const preview = page.locator("div.relative.overflow-hidden.rounded-2xl").first();
  await preview.scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  const box = await preview.boundingBox();
  // top ~30% of the preview = waistband + upper body incl. the seam line
  await page.screenshot({
    path: `${OUT}/${combo.name}-bund-zoom.png`,
    clip: { x: box.x, y: box.y, width: box.width, height: box.height * 0.34 },
  });
}
await ctx.close();

// --- mobile: is the preview reachable at all after BIL-2474? ---------------
const mctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const mpage = await mctx.newPage();
await mpage.goto(`${base}/konfigurator/hose`, { waitUntil: "networkidle", timeout: 45000 });
await acceptCookies(mpage);
await mpage.waitForTimeout(700);
await mpage.screenshot({ path: `${OUT}/mobile-viewport.png` });

const preview = mpage.locator("div.relative.overflow-hidden.rounded-2xl").first();
const pbox = await preview.boundingBox();
const inView = pbox ? pbox.y < 844 && pbox.y + pbox.height > 0 : false;
console.log(JSON.stringify({ consoleErrors: errors, mobilePreviewBox: pbox, mobilePreviewInInitialViewport: inView }, null, 2));

await mctx.close();
await browser.close();
