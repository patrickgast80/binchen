// BIL-2468 — visual proof for the two konfigurator UI fixes:
//  1) /konfigurator/muetze copy renders correct German (umlauts, no ASCII fallback)
//  2) /konfigurator/hose selection legend no longer clips/overlaps with long colour names
//
// Usage: node scripts/bil2468-shots.mjs [baseUrl]
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = "reports/bil2468";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];

// Worst case for the legend: the three longest colour names at once.
const HOSE_WORST = "/konfigurator/hose?bund=navy&hose=forest&buendchen=sky";

const PAGES = [
  { slug: "hose-longnames", path: HOSE_WORST, measureLegend: true },
  { slug: "muetze", path: "/konfigurator/muetze", measureLegend: false },
];

/** Measures the selection legend (<dl>) for horizontal overflow and item collisions. */
async function measureLegend(page) {
  return page.evaluate(() => {
    const dl = document.querySelector("dl");
    if (!dl) return { error: "no <dl> found" };
    const items = [...dl.querySelectorAll(":scope > div")];
    const dlBox = dl.getBoundingClientRect();

    const rows = items.map((el) => {
      const dt = el.querySelector("dt");
      const dd = el.querySelector("dd");
      return {
        text: `${dt?.textContent ?? ""} ${dd?.textContent ?? ""}`.trim(),
        box: el.getBoundingClientRect(),
      };
    });

    // Two items collide if they share a horizontal band and their x-ranges overlap.
    const collisions = [];
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i].box;
        const b = rows[j].box;
        const sameRow = a.top < b.bottom && b.top < a.bottom;
        const xOverlap = a.left < b.right && b.left < a.right;
        if (sameRow && xOverlap) collisions.push([rows[i].text, rows[j].text]);
      }
    }

    return {
      dlScrollWidth: dl.scrollWidth,
      dlClientWidth: dl.clientWidth,
      overflowsHorizontally: dl.scrollWidth > dl.clientWidth + 1,
      // An item whose right edge passes the container's right edge is the visible clip.
      itemsPastContainer: rows
        .filter((r) => r.box.right > dlBox.right + 1)
        .map((r) => r.text),
      collisions,
      items: rows.map((r) => ({ text: r.text, right: Math.round(r.box.right) })),
    };
  });
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
let failures = 0;

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
  });

  // Pre-seed a REJECT-ALL consent decision (strictly necessary only) so the fixed
  // bottom banner does not cover the surfaces under review. Declines everything
  // optional — it never grants a category.
  await context.addInitScript(() => {
    window.localStorage.setItem(
      "bilulu_cookie_consent_v1",
      JSON.stringify({
        version: "1",
        decidedAt: "2026-08-14T00:00:00.000Z",
        categories: { strict: true, functional: false, analytics: false, marketing: false },
      }),
    );
  });

  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));

  for (const target of PAGES) {
    await page.goto(`${BASE}${target.path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600); // let the preview overlays settle

    const file = `${OUT}/${target.slug}-${vp.name}.png`;
    await page.screenshot({ path: file, fullPage: false });
    console.log(`shot: ${file}`);

    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    if (axe.violations.length) {
      failures++;
      console.log(
        `a11y ${target.slug} @ ${vp.name}: ${axe.violations.length} violation(s) ` +
          JSON.stringify(axe.violations.map((v) => `${v.id} (${v.nodes.length})`)),
      );
    } else {
      console.log(`a11y ${target.slug} @ ${vp.name}: 0 violations`);
    }

    if (target.measureLegend) {
      const m = await measureLegend(page);
      const bad = m.overflowsHorizontally || m.itemsPastContainer?.length || m.collisions?.length;
      if (bad) failures++;
      console.log(`legend @ ${vp.name}: ${bad ? "FAIL" : "OK"} ${JSON.stringify(m)}`);
    }
  }

  if (consoleErrors.length) {
    failures++;
    console.log(`console errors @ ${vp.name}: ${JSON.stringify(consoleErrors)}`);
  } else {
    console.log(`console errors @ ${vp.name}: none`);
  }

  await context.close();
}

await browser.close();
console.log(failures ? `RESULT: FAIL (${failures})` : "RESULT: PASS");
process.exit(failures ? 1 : 0);
