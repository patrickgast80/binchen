/**
 * BIL-2492 — shots of the "Muster drehen" control itself, which sits below the
 * fold in the plain viewport screenshots.
 *
 * Also exercises the control instead of only reading the URL: it clicks the
 * button four times and asserts the query string and the rendered angle follow,
 * so the evidence covers the interaction and not just a hand-typed `?rot=`.
 *
 *   node scripts/bil2492-control-shots.mjs [baseUrl] [outDir]
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://127.0.0.1:3311";
const OUT = process.argv[3] ?? path.join(process.cwd(), "reports", "bil2492");

const CONSENT = () => {
  window.localStorage.setItem(
    "bilulu_cookie_consent_v1",
    JSON.stringify({
      version: "1",
      decidedAt: "2026-08-18T00:00:00.000Z",
      categories: { strict: true, functional: false, analytics: false, marketing: false },
    }),
  );
};

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const failures = [];

  // --- Desktop: action row under the preview ---------------------------------
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  await desktop.addInitScript(CONSENT);
  const dp = await desktop.newPage();
  dp.on("console", (m) => {
    if (m.type() === "error") failures.push(`console: ${m.text()}`);
  });
  await dp.goto(`${BASE}/konfigurator/hose?hose=stoff-14`, { waitUntil: "networkidle" });

  const rotate = dp.getByRole("button", { name: /Stoffmuster für Hose drehen/ });
  await rotate.waitFor({ state: "visible" });

  // A uni colour must NOT offer the control.
  await dp.goto(`${BASE}/konfigurator/hose`, { waitUntil: "networkidle" });
  if (await dp.getByRole("button", { name: /Stoffmuster/ }).count()) {
    failures.push("rotate control is offered on a uni colour");
  }
  await dp.goto(`${BASE}/konfigurator/hose?hose=stoff-14`, { waitUntil: "networkidle" });

  // Click through the full cycle and check the URL comes back to clean.
  const expected = [90, 180, 270, 0];
  for (const deg of expected) {
    const t0 = Date.now();
    await rotate.click();
    // Wait for the label to catch up rather than guessing a delay — the first
    // interaction after hydration needs an RSC round-trip and a fixed 250ms
    // sleep read the pre-click URL.
    await dp
      .getByRole("button", { name: new RegExp(`drehen — aktuell ${deg}°`) })
      .waitFor({ state: "visible", timeout: 5000 })
      .catch(() => {});
    console.log(`rot→${deg}: ${Date.now() - t0}ms (dev server, not a prod number)`);
    const url = new URL(dp.url());
    const got = Number(url.searchParams.get("rot") ?? 0);
    if (got !== deg) failures.push(`after click expected rot=${deg}, url has rot=${got}`);
    const label = await rotate.getAttribute("aria-label");
    if (!label?.includes(`${deg}°`)) failures.push(`aria-label "${label}" missing ${deg}°`);
    await dp
      .locator("section[aria-labelledby='preview-heading']")
      .screenshot({ path: path.join(OUT, `control-desktop-after-rot${deg}.png`) });
  }

  // Keyboard reachability — the control has to be operable without a mouse.
  await dp.goto(`${BASE}/konfigurator/hose?hose=stoff-14`, { waitUntil: "networkidle" });
  await rotate.focus();
  const focused = await dp.evaluate(
    () => document.activeElement?.getAttribute("aria-label") ?? "",
  );
  if (!focused.includes("Stoffmuster")) failures.push("rotate control not focusable");
  await dp.keyboard.press("Enter");
  await dp.waitForTimeout(250);
  if (!new URL(dp.url()).searchParams.get("rot")) failures.push("Enter did not rotate");
  await dp
    .locator("section[aria-labelledby='preview-heading']")
    .screenshot({ path: path.join(OUT, "control-desktop-focus.png") });
  await desktop.close();

  // --- Mobile: same control in the bottom sheet ------------------------------
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await mobile.addInitScript(CONSENT);
  const mp = await mobile.newPage();
  await mp.goto(`${BASE}/konfigurator/hose?hose=stoff-14&rot=90`, { waitUntil: "networkidle" });
  // The sheet opens on the first region (Bund, uni) — switch to the fabric zone.
  await mp.getByRole("tab", { name: "Hose" }).click();
  await mp.waitForTimeout(400);
  await mp.screenshot({ path: path.join(OUT, "control-mobile-sheet.png") });

  const sheetRotate = mp.getByRole("button", { name: /Stoffmuster für Hose drehen/ }).last();
  const box = await sheetRotate.boundingBox();
  if (!box || box.height < 44) {
    failures.push(`sheet rotate target too small: ${JSON.stringify(box)}`);
  } else {
    console.log(`sheet rotate tap target: ${Math.round(box.width)}x${Math.round(box.height)}`);
  }
  await sheetRotate.click();
  await mp.waitForTimeout(300);
  console.log(`after sheet click: ${mp.url()}`);
  await mp.screenshot({ path: path.join(OUT, "control-mobile-sheet-after.png") });

  // And the action row under the preview on mobile.
  await mp.goto(`${BASE}/konfigurator/hose?hose=stoff-14&rot=90`, { waitUntil: "networkidle" });
  await mp.getByRole("button", { name: /Stoffmuster für Hose drehen/ }).first().scrollIntoViewIfNeeded();
  await mp.waitForTimeout(400);
  await mp.screenshot({ path: path.join(OUT, "control-mobile-actionrow.png") });
  await mobile.close();

  await browser.close();
  if (failures.length) {
    console.error(`FAIL:\n${failures.join("\n")}`);
    process.exit(1);
  }
  console.log("PASS — rotate control cycles 90/180/270/0, keyboard-operable, hidden on uni");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
