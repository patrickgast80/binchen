/**
 * BIL-2494 — PDP gallery verification.
 *
 * Shoots the multi-image PDPs and a single-image control at 390x844 and
 * 1440x900, clicks through the thumbnails, and runs axe on both viewports.
 *
 *   node scripts/bil2494-gallery-verify.mjs [baseUrl]
 */
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3007";
const OUT = path.join(process.cwd(), "reports", "bil2494");

const MULTI = [
  ["set-muetze-loop-boho", "prod_01KZ0VZMJWFC9Z00XVNDFYZ6M2", 3],
  // legacy article: thumbnail is a separate upload that is NOT in `images`,
  // so the gallery prepends it -> 4 images + 1 thumbnail = 5 entries.
  ["turban-pastell-aquarell", "prod_01KZ0VZR3GRE02ZXNAE1M1KJP0", 5],
  ["turban-aquarell-bordeaux", "prod_01KZ0VZQ16YTDT81JT5WAFSSZ0", 2],
  ["set-schmetterlinge-hellblau", "prod_01KZ0VZSG4DBE6M148W1TK681B", 2],
  ["set-kleiner-zoo-rosa", "prod_01KZ0VZP4NSTXGTYAT43J51ZTN", 2],
  ["turban-wildblumen", "prod_01KZ0VZS1Y5TFKDJTV2KXERNJV", 2],
];
const SINGLE = [
  ["pumphose-eukalyptus", "prod_01KZ0VZSWB1BA91FBFGKDY6QKV"],
  ["muetze-schneeflocken", "prod_01KZ0VZN6J66D6AKW54HNX0TK8"],
];

const VIEWPORTS = [
  ["mobile", { width: 390, height: 844 }],
  ["desktop", { width: 1440, height: 900 }],
];

const results = [];

async function shoot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
}

/** Decline cookies (never auto-grant) so the banner stops covering the thumbnails. */
async function dismissConsent(page) {
  const decline = page.getByRole("button", { name: "Alle ablehnen" });
  try {
    // the banner mounts after hydration, so poll instead of checking once
    await decline.first().waitFor({ state: "visible", timeout: 5000 });
    await decline.first().click();
    await decline.first().waitFor({ state: "hidden", timeout: 5000 });
  } catch {
    /* already declined in this context */
  }
}

async function run() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const [vpName, viewport] of VIEWPORTS) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });

    for (const [slug, id, expected] of MULTI) {
      await page.goto(`${BASE}/product/${id}`, { waitUntil: "load" });
      await dismissConsent(page);
      const thumbs = page.getByRole("button", { name: /^Bild \d+ von \d+ anzeigen$/ });
      const count = await thumbs.count();
      const visible = page.locator("main img, article img").first();
      await visible.waitFor();
      if (count) await thumbs.last().scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await shoot(page, `${slug}-${vpName}-1`);

      // click the last thumbnail — the mannequin shot the ticket is about
      await thumbs.nth(count - 1).click();
      await page.waitForTimeout(400);
      await shoot(page, `${slug}-${vpName}-${count}`);

      // which hero image is opaque now?
      const activeAlt = await page
        .locator("article > div > div > div > img")
        .evaluateAll((nodes) =>
          nodes
            .filter((n) => getComputedStyle(n).opacity === "1")
            .map((n) => n.getAttribute("alt")),
        )
        .catch(() => []);

      // the hero frame must stay square, otherwise object-contain letterboxes
      // the 1200x1200 studio photo (flex stretch regression)
      const box = await page.locator("article img").first().locator("..").boundingBox();
      const ratio = box ? +(box.width / box.height).toFixed(3) : null;

      results.push({
        vp: vpName,
        slug,
        thumbs: count,
        expected,
        ratio,
        ok: count === expected && ratio !== null && Math.abs(ratio - 1) < 0.02,
        activeAlt,
      });
    }

    for (const [slug, id] of SINGLE) {
      await page.goto(`${BASE}/product/${id}`, { waitUntil: "load" });
      await dismissConsent(page);
      const count = await page
        .getByRole("button", { name: /^Bild \d+ von \d+ anzeigen$/ })
        .count();
      await page.waitForTimeout(300);
      await shoot(page, `${slug}-${vpName}`);
      results.push({ vp: vpName, slug, thumbs: count, expected: 0, ok: count === 0 });
    }

    // a11y on one multi-image PDP per viewport
    await page.goto(`${BASE}/product/${MULTI[0][1]}`, { waitUntil: "load" });
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    results.push({
      vp: vpName,
      slug: "axe:" + MULTI[0][0],
      violations: axe.violations.map((v) => `${v.id} (${v.nodes.length})`),
      ok: axe.violations.length === 0,
    });
    results.push({ vp: vpName, slug: "consoleErrors", errors: consoleErrors, ok: consoleErrors.length === 0 });

    await context.close();
  }

  await browser.close();
  await writeFile(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"} ${r.vp} ${r.slug} ${JSON.stringify({ thumbs: r.thumbs, expected: r.expected, ratio: r.ratio, activeAlt: r.activeAlt, violations: r.violations, errors: r.errors })}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(failed.length ? `\n${failed.length} FAILED` : "\nALL PASS");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
