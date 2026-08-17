/**
 * BIL-2454 acceptance shots against live bilulu.de:
 * mobile bottom-sheet, Merken/localStorage round-trip, desktop layout.
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE ?? "https://bilulu.de";
const OUT = path.resolve("reports/bil2454-20260817");
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];
try {
  // --- mobile: bottom sheet + save round-trip
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[mobile] ${m.text()}`); });
  // Returning-visitor state: consent already decided, so the banner does not
  // own the bottom of the viewport in the sheet shots.
  await ctx.addInitScript(() => {
    localStorage.setItem("bilulu_cookie_consent_v1", JSON.stringify({
      version: "1",
      decidedAt: "2026-08-17T00:00:00.000Z",
      categories: { strict: true, functional: true, analytics: false, marketing: false },
    }));
  });

  await page.goto(`${BASE}/konfigurator/hose?bund=terracotta&hose=cream&buendchen=sage`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  // Consent banner owns the bottom of the viewport on a first visit; dismiss it
  // so the shot shows the returning-visitor state the sheet was designed for.
  const reject = page.getByRole("button", { name: /alle ablehnen/i });
  if (await reject.count()) { await reject.first().click(); await page.waitForTimeout(400); }
  await page.screenshot({ path: `${OUT}/mobile-sheet.png` });

  const sheet = page.getByRole("region", { name: "Farbauswahl-Panel" });
  console.log("sheet visible:", await sheet.isVisible());
  const tabs = await page.getByRole("tab").allInnerTexts();
  console.log("region tabs:", JSON.stringify(tabs));

  const merken = page.getByRole("button", { name: /merken/i }).first();
  await merken.click();
  await page.waitForTimeout(500);
  const saved = await page.evaluate(() => localStorage.getItem("bilulu.saved-configs"));
  console.log("localStorage entries:", saved ? JSON.parse(saved).length : 0);
  console.log("thumbnail present:", saved ? Boolean(JSON.parse(saved)[0]?.thumbnail) : false);

  await page.getByRole("heading", { name: /gespeicherten Konfigurationen/i }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/mobile-saved.png` });

  // reload → entry survives (localStorage, no consent needed)
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("bilulu.saved-configs") ?? "[]").length);
  console.log("entries after reload:", after);

  // --- desktop
  const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await dctx.addInitScript(() => {
    localStorage.setItem("bilulu_cookie_consent_v1", JSON.stringify({
      version: "1",
      decidedAt: "2026-08-17T00:00:00.000Z",
      categories: { strict: true, functional: true, analytics: false, marketing: false },
    }));
  });
  const dpage = await dctx.newPage();
  dpage.on("console", (m) => { if (m.type() === "error") errors.push(`[desktop] ${m.text()}`); });
  await dpage.goto(`${BASE}/konfigurator/hose?bund=terracotta&hose=cream&buendchen=sage`, { waitUntil: "networkidle" });
  await dpage.waitForTimeout(800);
  await dpage.screenshot({ path: `${OUT}/desktop.png` });

  console.log("console errors:", errors.length ? errors : "none");
} finally {
  await browser.close();
}
