/**
 * BIL-2492 — visual proof that the Hauptstoff rotation reaches the preview.
 *
 * Shoots every konfigurator with a fabric print at 0° and 90° (plus 180/270
 * for the Hose) at mobile 390x844 and desktop 1440x900, and additionally
 * pulls the OG share card so the "does the card mirror the preview" question
 * has a picture behind it.
 *
 *   node scripts/bil2492-rotation-shots.mjs [baseUrl] [outDir]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://127.0.0.1:3311";
const OUT = process.argv[3] ?? path.join(process.cwd(), "reports", "bil2492");

/** konfigurator → main fabric zone param, plus a print that is clearly directional. */
const CASES = [
  { id: "hose", param: "hose", fabric: "stoff-14", rotations: [0, 90, 180, 270] },
  { id: "body", param: "hauptteil", fabric: "stoff-14", rotations: [0, 90] },
  { id: "turban", param: "turban", fabric: "stoff-14", rotations: [0, 90] },
  { id: "muetze", param: "muetze", fabric: "stoff-14", rotations: [0, 90] },
  { id: "dreieckstuch", param: "tuch", fabric: "stoff-14", rotations: [0, 90] },
];

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844, isMobile: true },
  { name: "desktop", width: 1440, height: 900, isMobile: false },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    // The consent dialog is modal and covers the preview on a 390px viewport —
    // seed a "strictly necessary only" decision instead of clicking accept, so
    // the shots show the page a returning visitor sees and no optional cookie
    // is ever set.
    await context.addInitScript(() => {
      window.localStorage.setItem(
        "bilulu_cookie_consent_v1",
        JSON.stringify({
          version: "1",
          decidedAt: "2026-08-18T00:00:00.000Z",
          categories: { strict: true, functional: false, analytics: false, marketing: false },
        }),
      );
    });
    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`${vp.name} ${page.url()} :: ${msg.text()}`);
    });

    for (const c of CASES) {
      for (const rot of c.rotations) {
        const qs = new URLSearchParams({ [c.param]: c.fabric });
        if (rot !== 0) qs.set("rot", String(rot));
        const url = `${BASE}/konfigurator/${c.id}?${qs}`;
        await page.goto(url, { waitUntil: "networkidle" });
        // The preview is the whole point — shoot it tight, not the page chrome.
        const preview = page.getByRole("img", { name: /Vorschau/ }).first();
        await preview.waitFor({ state: "visible" });
        await page.waitForTimeout(400);
        await preview.screenshot({
          path: path.join(OUT, `${c.id}-${vp.name}-rot${rot}.png`),
        });
        if (vp.name === "mobile" && rot === 90) {
          await page.screenshot({
            path: path.join(OUT, `${c.id}-mobile-full-rot90.png`),
            fullPage: false,
          });
        }
        if (vp.name === "desktop" && rot === 90) {
          await page.screenshot({
            path: path.join(OUT, `${c.id}-desktop-full-rot90.png`),
            fullPage: false,
          });
        }
      }
    }
    await context.close();
  }

  // Share cards: 0° vs 90°, so a reviewer can see the card follows the preview.
  // `next/og` cannot start on Windows/Node 24 (ERR_INVALID_URL on its bundled
  // font path), so a local 500 here says nothing about production — the OG
  // compositor is proven separately by bil2492-og-compose-check.mjs and on the
  // live host. Never treat this step as a gate locally.
  const cardCtx = await browser.newContext({ viewport: { width: 1200, height: 630 } });
  const cardPage = await cardCtx.newPage();
  for (const rot of [0, 90]) {
    const qs = new URLSearchParams({ hose: "stoff-14" });
    if (rot !== 0) qs.set("rot", String(rot));
    const url = `${BASE}/api/og/konfig/hose?${qs}`;
    try {
      const res = await cardPage.request.get(url);
      const buf = await res.body();
      const type = res.headers()["content-type"] ?? "";
      console.log(
        `og rot=${rot}: ${res.status()} ${type} x-og-photo=${
          res.headers()["x-og-photo"] ?? "-"
        } ${Math.round(buf.byteLength / 1024)}kb`,
      );
      // A green content-type is not proof — only write a file we could look at.
      if (type.startsWith("image/")) {
        await writeFile(path.join(OUT, `og-hose-rot${rot}.png`), buf);
      }
    } catch (err) {
      console.log(`og rot=${rot}: unavailable (${err instanceof Error ? err.message : err})`);
    }
  }
  await cardCtx.close();
  await browser.close();

  console.log(errors.length ? `console errors:\n${errors.join("\n")}` : "no console errors");
  console.log(`shots in ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
