/**
 * BIL-2449 screenshots — verify the normalized product images now render live at
 * bilulu.de across catalog, homepage, PDPs, konfigurator, and /fruehchen.
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE ?? "https://bilulu.de";
const OUT = path.resolve(".paperclip-scratch/bil2449");
await mkdir(OUT, { recursive: true });

const shots = [
  { name: "mobile-catalog",    viewport: { width: 390, height: 844 }, url: "/catalog", full: true },
  { name: "desktop-catalog",   viewport: { width: 1440, height: 900 }, url: "/catalog", full: true },
  { name: "mobile-home",       viewport: { width: 390, height: 844 }, url: "/", full: true },
  { name: "desktop-home",      viewport: { width: 1440, height: 900 }, url: "/", full: true },
  { name: "mobile-pdp-anker",  viewport: { width: 390, height: 844 }, url: "/product/prod_01KZ0VZWHC22ARK526BGW44NAF", full: true },
  { name: "desktop-pdp-anker", viewport: { width: 1440, height: 900 }, url: "/product/prod_01KZ0VZWHC22ARK526BGW44NAF", full: true },
  { name: "mobile-pdp-turban", viewport: { width: 390, height: 844 }, url: "/product/prod_01KZ0VZQ16YTDT81JT5WAFSSZ0", full: true },
  { name: "desktop-pdp-turban",viewport: { width: 1440, height: 900 }, url: "/product/prod_01KZ0VZQ16YTDT81JT5WAFSSZ0", full: true },
  { name: "mobile-fruehchen",  viewport: { width: 390, height: 844 }, url: "/fruehchen", full: true },
  { name: "desktop-fruehchen", viewport: { width: 1440, height: 900 }, url: "/fruehchen", full: true },
];

const browser = await chromium.launch();
try {
  for (const s of shots) {
    const ctx = await browser.newContext({ viewport: s.viewport, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    console.log("->", s.name, s.url);
    try {
      await page.goto(BASE + s.url, { waitUntil: "networkidle", timeout: 30000 });
    } catch (e) {
      console.log("  (nav:", e.message, ")");
    }
    await page.addStyleTag({ content: `.klaro, .cookie-notice, [data-cookiebanner] { display: none !important; }` });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, s.name + ".png"), fullPage: !!s.full });
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log("shots ->", OUT);
