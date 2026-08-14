// BIL-2468 — focused before/after evidence for the Hose selection legend.
// Injects the OLD class (sm:grid-cols-3) to reproduce the clip, then restores the
// shipped class and re-measures, capturing a zoomed shot of each state.
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = "reports/bil2468";
const URL = `${BASE}/konfigurator/hose?bund=navy&hose=forest&buendchen=sky`;

const OLD_CLASS = "grid grid-cols-1 gap-x-6 gap-y-2 font-body text-sm sm:grid-cols-3";
const NEW_CLASS = "grid min-w-0 grid-cols-1 gap-x-6 gap-y-2 font-body text-sm sm:flex sm:flex-wrap";

const measure = (page) =>
  page.evaluate(() => {
    const dl = document.querySelector("dl");
    const items = [...dl.querySelectorAll(":scope > div")];
    const dlBox = dl.getBoundingClientRect();
    const rows = items.map((el) => ({
      text: `${el.querySelector("dt")?.textContent ?? ""} ${el.querySelector("dd")?.textContent ?? ""}`.trim(),
      box: el.getBoundingClientRect(),
      // In a grid the item box IS the track, so a long value overflows the box
      // rather than widening it — scrollWidth is what exposes the clip.
      overflowPx: el.scrollWidth - el.clientWidth,
      el,
    }));
    const collisions = [];
    for (let i = 0; i < rows.length; i++)
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i], b = rows[j];
        const sameRow = a.box.top < b.box.bottom && b.box.top < a.box.bottom;
        // Compare painted content extents, not just the (track-sized) boxes.
        const aRight = a.box.left + a.el.scrollWidth;
        const bRight = b.box.left + b.el.scrollWidth;
        if (sameRow && a.box.left < bRight && b.box.left < aRight)
          collisions.push(`${a.text} × ${b.text}`);
      }
    return {
      clippedItems: rows.filter((r) => r.overflowPx > 1).map((r) => `${r.text} (+${r.overflowPx}px)`),
      contentPastContainer: rows
        .filter((r) => r.box.left + r.el.scrollWidth > dlBox.right + 1)
        .map((r) => r.text),
      collisions,
    };
  });

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
// Pre-seed a REJECT-ALL consent decision (strictly necessary only) so the fixed
// bottom banner cannot cover the legend we are capturing. This declines every
// optional category — it never grants anything.
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
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(400);

const dl = page.locator("dl").first();
await dl.scrollIntoViewIfNeeded();
// scrollIntoViewIfNeeded parks the element at the viewport bottom; lift it into
// the middle so nothing sticky can sit on top of the region we capture.
await page.evaluate(() => window.scrollBy(0, 260));
await page.waitForTimeout(300);

for (const [state, cls] of [["before", OLD_CLASS], ["after", NEW_CLASS]]) {
  await dl.evaluate((el, c) => el.setAttribute("class", c), cls);
  await page.waitForTimeout(250);
  const box = await dl.boundingBox();
  await page.screenshot({
    path: `${OUT}/hose-legend-${state}-desktop.png`,
    clip: {
      x: Math.max(0, box.x - 12),
      y: Math.max(0, box.y - 12),
      width: Math.min(760, box.width + 420),
      height: box.height + 48,
    },
  });
  console.log(`${state}: ${JSON.stringify(await measure(page))}`);
}

await browser.close();
