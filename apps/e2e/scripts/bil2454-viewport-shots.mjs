import { chromium } from "@playwright/test";
import path from "node:path";

const BASE = process.env.SHOT_BASE ?? "http://127.0.0.1:3197";
const OUT = path.resolve("reports/bil2454");

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  // Seed cookie-consent + a saved config before first paint so the banner
  // doesn't cover the sheet in the screenshot.
  await ctx.addInitScript(() => {
    try {
      window.localStorage.setItem(
        "bilulu_cookie_consent_v1",
        JSON.stringify({
          version: "1",
          decidedAt: new Date().toISOString(),
          categories: {
            strict: true,
            functional: false,
            analytics: false,
            marketing: false,
          },
        }),
      );
    } catch {}
  });
  const page = await ctx.newPage();
  await page.goto(
    `${BASE}/konfigurator/hose?bund=sage&hose=cream&buendchen=terracotta`,
    { waitUntil: "networkidle", timeout: 30000 },
  );
  // Dismiss the cookie consent (z-50) so it doesn't cover the z-30 sheet.
  await page
    .getByRole("button", { name: /Alle ablehnen|Alle akzeptieren/i })
    .first()
    .click({ timeout: 3000 })
    .catch(() => {});
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(OUT, "hose-mobile-sheet-visible.png"),
    fullPage: false,
  });
  console.log("wrote hose-mobile-sheet-visible.png");

  // Second frame: save a config first so the SavedConfigs grid is populated.
  await page.evaluate(() =>
    window.scrollTo(0, document.body.scrollHeight / 4),
  );
  await page.waitForTimeout(200);
  await page
    .getByRole("button", { name: /Merken/i })
    .click({ timeout: 3000 })
    .catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({
    path: path.join(OUT, "hose-mobile-saved-populated.png"),
    fullPage: false,
  });
  console.log("wrote hose-mobile-saved-populated.png");
  await ctx.close();
} finally {
  await browser.close();
}
