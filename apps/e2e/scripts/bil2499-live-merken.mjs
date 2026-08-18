/**
 * BIL-2499 acceptance criterion 4, live: the "Merken" thumbnail must show the
 * chosen FABRIC PRINT, not a flat average colour (the BIL-2492 defect), and the
 * label has to survive into it too.
 *
 * The thumbnail is painted client-side into a canvas and stored as a data URL,
 * so it is decoded back to a real PNG here and inspected numerically. Checking
 * that the entry merely exists would have passed the BIL-2492 bug.
 *
 *   node apps/e2e/scripts/bil2499-live-merken.mjs [baseUrl]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "https://bilulu.de";
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../reports/bil2499", BASE.includes("bilulu.de") ? "live" : "local");
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem(
    "bilulu_cookie_consent_v1",
    JSON.stringify({
      version: "1",
      decidedAt: "2026-08-18T00:00:00.000Z",
      categories: { strict: true, functional: true, analytics: false, marketing: false },
    }),
  );
});
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));

// A printed fabric, so a flat-colour thumbnail is detectable as low variance.
await page.goto(`${BASE}/konfigurator/hose-kurz?bund=navy&hose=stoff-14&buendchen=mustard`, {
  waitUntil: "networkidle",
});
await page.waitForTimeout(1200);

await page.getByRole("button", { name: /merken/i }).first().click();
await page.waitForTimeout(1200);

const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("bilulu.saved-configs") ?? "[]"));
const entry = saved.find((e) => (e.konfigurator ?? e.id ?? "").includes("hose-kurz")) ?? saved[0];
if (!entry?.thumbnail?.startsWith("data:image/")) {
  console.error("FAIL — no thumbnail data URL stored", JSON.stringify(saved).slice(0, 400));
  process.exit(1);
}

const b64 = entry.thumbnail.split(",")[1];
const png = Buffer.from(b64, "base64");
await writeFile(path.join(OUT, "merken-thumbnail.png"), png);

await page.getByRole("heading", { name: /gespeicherten Konfigurationen/i }).scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, "merken-section.png") });

/**
 * Flat-colour detection without sharp: count distinct quantised colours in the
 * decoded bitmap via a canvas in the page. A real print yields many; the
 * BIL-2492 average-colour bug yielded a handful.
 */
const stats = await page.evaluate(async (dataUrl) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const { data } = g.getImageData(0, 0, c.width, c.height);
  const seen = new Set();
  let opaque = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    opaque++;
    seen.add((data[i] >> 3) + "," + (data[i + 1] >> 3) + "," + (data[i + 2] >> 3));
  }
  return { w: img.width, h: img.height, opaque, distinctColours: seen.size };
}, entry.thumbnail);

const report = { base: BASE, entryCount: saved.length, stats, consoleErrors };
await writeFile(path.join(OUT, "merken-check.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();

const problems = [];
if (stats.opaque < 1000) problems.push(`thumbnail nearly empty (${stats.opaque} opaque px)`);
// A flat-fill rendering of three zones lands well under 30 quantised colours.
if (stats.distinctColours < 60) problems.push(`only ${stats.distinctColours} colours — print missing`);
if (consoleErrors.length) problems.push(`${consoleErrors.length} console errors`);

if (problems.length) {
  console.error(`FAIL — ${problems.join("; ")}`);
  process.exit(1);
}
console.log(`PASS — Merken thumbnail carries the print (${stats.distinctColours} distinct colours).`);
