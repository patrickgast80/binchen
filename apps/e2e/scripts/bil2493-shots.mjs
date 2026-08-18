/**
 * BIL-2493 — before/after screenshots for the fabric-weight change.
 *
 *   node scripts/bil2493-shots.mjs [baseUrl] [outDir] [label]
 *
 * The DoD is "print unchanged at 1440px desktop", so the desktop shots are
 * taken at deviceScaleFactor 2 and additionally cropped tight on the preview
 * — a full-page shot scaled down to fit a comment hides exactly the softness
 * we are trying to rule out.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://127.0.0.1:3311";
const OUT = process.argv[3] ?? path.join(process.cwd(), "reports", "bil2493");
const LABEL = process.argv[4] ?? "after";

const CASES = [
  { id: "uni", url: "/konfigurator/hose" },
  { id: "stoff14", url: "/konfigurator/hose?hose=stoff-14" },
  { id: "stoff14-rot90", url: "/konfigurator/hose?hose=stoff-14&rot=90" },
  // A fine, high-frequency print is the one most likely to go soft.
  { id: "stoff20", url: "/konfigurator/hose?hose=stoff-20" },
];

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
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
    // Seed a strictly-necessary-only consent decision: the modal covers the
    // preview at 390px, and clicking "accept" would set optional cookies we
    // have no business setting for a screenshot run.
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
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`${vp.name} ${page.url()} :: ${m.text()}`);
    });

    for (const c of CASES) {
      await page.goto(`${BASE}${c.url}`, { waitUntil: "networkidle" });
      const preview = page.getByRole("img", { name: /Vorschau/ }).first();
      await preview.waitFor({ state: "visible" });
      // Let the tiled multiply layer finish rasterising before we judge it.
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `${LABEL}-${c.id}-${vp.name}.png`) });
      await preview.screenshot({
        path: path.join(OUT, `${LABEL}-${c.id}-${vp.name}-preview.png`),
      });
    }

    // The palette chips are the other half of the change — prove they still
    // render the fabric and not a flat hex fallback.
    await page.goto(`${BASE}/konfigurator/hose?hose=stoff-14`, { waitUntil: "networkidle" });
    const group = page.getByRole("radiogroup", { name: /Farbe für Hose/ });
    if (await group.count()) {
      await group.first().scrollIntoViewIfNeeded();
      await group.first().screenshot({ path: path.join(OUT, `${LABEL}-chips-${vp.name}.png`) });
    }

    await context.close();
  }

  await browser.close();
  if (errors.length) {
    console.error(`console errors:\n  ${errors.join("\n  ")}`);
    process.exitCode = 1;
  } else {
    console.log("no console errors");
  }
  console.log(`shots → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
