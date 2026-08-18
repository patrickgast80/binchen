/**
 * BIL-2512 — konfigurator screenshots at the two review viewports.
 *
 * Turban and Dreieckstuch only: those are the two whose base carried the
 * original print. A light and a dark fabric each, because the ghost was most
 * obvious on dark swatches (multiply loses fine structure as the swatch darkens,
 * so a baked-in motif dominates what is left).
 *
 * Run against a local `next start` or against prod:
 *   node scripts/bil2512-shots.mjs http://localhost:3277 reports/bil2512/local
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const BASE = process.argv[2] ?? "https://bilulu.de";
const OUT = process.argv[3] ?? "reports/bil2512/live";
await mkdir(OUT, { recursive: true });

// Pre-seed consent rather than clicking the banner: a banner that is still up
// makes two different screenshots look identical (BIL-2492 lesson).
const CONSENT = JSON.stringify({
  version: "1",
  decidedAt: "2026-08-18T06:00:00.000Z",
  categories: { strict: true, functional: true, analytics: false, marketing: false },
});

const SURFACES = [
  { id: "turban", tag: "hell", q: "?turban=stoff-01&schleife=terracotta" },
  { id: "turban", tag: "dunkel", q: "?turban=navy&schleife=mustard" },
  { id: "dreieckstuch", tag: "hell", q: "?tuch=stoff-01" },
  { id: "dreieckstuch", tag: "dunkel", q: "?tuch=navy" },
];
const VIEWPORTS = [
  { name: "mobile-390x844", width: 390, height: 844, dsf: 2 },
  { name: "desktop-1440x900", width: 1440, height: 900, dsf: 1 },
];

const browser = await chromium.launch();
const errors = [];
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dsf,
  });
  await ctx.addInitScript((v) => localStorage.setItem("bilulu_cookie_consent_v1", v), CONSENT);
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${vp.name} ${page.url()} :: ${m.text()}`);
  });
  for (const s of SURFACES) {
    await page.goto(`${BASE}/konfigurator/${s.id}${s.q}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    const file = `${OUT}/${s.id}-${s.tag}-${vp.name}.png`;
    await page.screenshot({ path: file });
    console.log("shot", file);
  }
  await ctx.close();
}
await browser.close();

console.log(errors.length ? `console errors:\n  ${errors.join("\n  ")}` : "console errors: none");
