/**
 * BIL-2492 — save/share round-trip + axe scan on the changed surface.
 *
 * Save: clicks "Merken" with a rotated print, then checks the stored entry's
 * href carries `rot` and dumps the generated thumbnail as a PNG so the
 * "does a saved card look like what I saved" question has a picture behind it.
 *
 * Share: reads the OG <meta> the page emits and asserts `rot` survives into it.
 *
 *   node scripts/bil2492-save-a11y-check.mjs [baseUrl] [outDir]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3311";
const OUT = process.argv[3] ?? path.join(process.cwd(), "reports", "bil2492");
const URL_ROT = `${BASE}/konfigurator/hose?hose=stoff-14&rot=90`;

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

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(CONSENT);
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") failures.push(`console error: ${m.text()}`);
  });
  await page.goto(URL_ROT, { waitUntil: "networkidle" });

  // --- share: the OG image URL has to carry the rotation --------------------
  const ogUrl = await page.locator('meta[property="og:image"]').first().getAttribute("content");
  if (!ogUrl || !/[?&]rot=90(&|$)/.test(ogUrl)) {
    failures.push(`og:image does not carry rot=90: ${ogUrl}`);
  } else {
    console.log(`og:image → ${ogUrl}`);
  }
  const ogTitle = await page.locator('meta[property="og:title"]').first().getAttribute("content");
  console.log(`og:title → ${ogTitle}`);

  // --- save: entry href + rendered thumbnail --------------------------------
  await page.getByRole("button", { name: /Merken/ }).click();
  await page.waitForTimeout(1200);
  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("bilulu.saved-configs") ?? "[]"),
  );
  if (!stored.length) {
    failures.push("nothing was saved");
  } else {
    const entry = stored[0];
    console.log(`saved name → ${entry.name}`);
    console.log(`saved href → ${entry.href}`);
    if (!/[?&]rot=90(&|$)/.test(entry.href)) failures.push(`saved href lost rot: ${entry.href}`);
    if (!entry.name.includes("90°")) failures.push(`saved name lost the angle: ${entry.name}`);
    const b64 = String(entry.thumbnail).split(",")[1] ?? "";
    await writeFile(path.join(OUT, "saved-thumbnail-rot90.png"), Buffer.from(b64, "base64"));
  }

  // Same again unrotated, so the two thumbnails can be compared side by side.
  await page.evaluate(() => window.localStorage.removeItem("bilulu.saved-configs"));
  await page.goto(`${BASE}/konfigurator/hose?hose=stoff-14`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Merken/ }).click();
  await page.waitForTimeout(1200);
  const plain = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("bilulu.saved-configs") ?? "[]"),
  );
  if (plain.length) {
    await writeFile(
      path.join(OUT, "saved-thumbnail-rot0.png"),
      Buffer.from(String(plain[0].thumbnail).split(",")[1] ?? "", "base64"),
    );
    console.log(`saved (unrotated) name → ${plain[0].name}`);
  }

  // --- a11y on the changed surface -----------------------------------------
  for (const [label, url] of [
    ["desktop", URL_ROT],
    ["uni", `${BASE}/konfigurator/hose`],
  ]) {
    await page.goto(url, { waitUntil: "networkidle" });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    console.log(`axe ${label}: ${results.violations.length} violations`);
    for (const v of results.violations) {
      failures.push(`axe ${label} ${v.id} (${v.impact}): ${v.nodes.length} nodes`);
    }
  }
  await ctx.close();

  // Mobile sheet carries the control too — scan it with the fabric tab open.
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await mctx.addInitScript(CONSENT);
  const mpage = await mctx.newPage();
  await mpage.goto(URL_ROT, { waitUntil: "networkidle" });
  await mpage.getByRole("tab", { name: "Hose" }).click();
  await mpage.waitForTimeout(400);
  const mres = await new AxeBuilder({ page: mpage })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  console.log(`axe mobile-sheet: ${mres.violations.length} violations`);
  for (const v of mres.violations) {
    failures.push(`axe mobile ${v.id} (${v.impact}): ${v.nodes.length} nodes`);
  }
  await mctx.close();

  await browser.close();
  if (failures.length) {
    console.error(`FAIL:\n${failures.join("\n")}`);
    process.exit(1);
  }
  console.log("PASS — rotation survives save + share, no axe violations, no console errors");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
