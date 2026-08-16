import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
await page.goto("https://bilulu.de/catalog", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: "bil2462-widemat-catalog.png", fullPage: false });
await browser.close();
console.log("done");
