// BIL-2483 side-check: the BEFORE run showed most catalog cards rendering alt text
// instead of a photo. Log every image response the catalog page issues.
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "https://bilulu.de";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const seen = [];
page.on("response", (r) => {
  const u = r.url();
  if (/_next\/image|\/static\/|uploads/.test(u)) seen.push([r.status(), u]);
});
page.on("requestfailed", (r) => {
  const u = r.url();
  if (/_next\/image|\/static\/|uploads/.test(u)) seen.push(["FAILED " + r.failure()?.errorText, u]);
});

await page.goto(base + "/catalog", { waitUntil: "networkidle", timeout: 90_000 });
await page.mouse.wheel(0, 6000);
await page.waitForTimeout(4000);
await page.mouse.wheel(0, 6000);
await page.waitForTimeout(4000);

const broken = await page.evaluate(() =>
  [...document.querySelectorAll("img")]
    .filter((i) => !i.complete || i.naturalWidth === 0)
    .map((i) => ({ alt: i.alt.slice(0, 40), src: i.currentSrc || i.src })),
);

const byStatus = seen.reduce((a, [s]) => ((a[s] = (a[s] ?? 0) + 1), a), {});
console.log("image responses by status:", byStatus);
console.log("non-200 samples:");
for (const [s, u] of seen.filter(([s]) => s !== 200).slice(0, 8)) console.log(" ", s, u.slice(0, 160));
console.log(`broken <img> in DOM: ${broken.length}`);
for (const b of broken.slice(0, 8)) console.log("  ", b.alt, "->", b.src.slice(0, 160));

await browser.close();
