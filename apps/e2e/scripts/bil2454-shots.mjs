import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = process.env.SHOT_BASE ?? "http://127.0.0.1:3197";
const OUT = path.resolve("reports/bil2454");
await fs.mkdir(OUT, { recursive: true });

const SURFACES = [
  {
    name: "hose",
    url: `${BASE}/konfigurator/hose?bund=sage&hose=cream&buendchen=terracotta`,
  },
  {
    name: "turban",
    url: `${BASE}/konfigurator/turban?turban=sage&schleife=mustard`,
  },
];

const VIEWPORTS = [
  { name: "mobile-390x844", width: 390, height: 844, isMobile: true },
  { name: "desktop-1440x900", width: 1440, height: 900, isMobile: false },
];

const browser = await chromium.launch();
try {
  for (const s of SURFACES) {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.isMobile ? 3 : 2,
        isMobile: vp.isMobile,
        hasTouch: vp.isMobile,
      });
      const page = await ctx.newPage();
      await page.goto(s.url, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(700);
      // Save one entry so the SavedConfigs section is populated in the shot.
      if (!vp.isMobile) {
        await page
          .getByRole("button", { name: /Merken/i })
          .click({ timeout: 4000 })
          .catch(() => {});
        await page.waitForTimeout(500);
      }
      const out = path.join(OUT, `${s.name}--${vp.name}.png`);
      await page.screenshot({ path: out, fullPage: true });
      console.log("wrote", out);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
