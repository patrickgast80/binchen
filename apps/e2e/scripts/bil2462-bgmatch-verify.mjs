import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "reports/bil2462-bgmatch-20260817";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 2600 } });

for (const pageNum of [1, 2, 3]) {
  await page.goto(`https://bilulu.de/catalog?page=${pageNum}`, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let total = 0;
      const step = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        total += step;
        if (total >= document.body.scrollHeight) { clearInterval(timer); resolve(); }
      }, 100);
    });
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/catalog-page${pageNum}.png`, fullPage: true });
  console.log(`captured page ${pageNum}`);
}

await page.goto("https://bilulu.de/", { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/home.png`, fullPage: true });
console.log("captured home");

await browser.close();
console.log("done ->", OUT);
