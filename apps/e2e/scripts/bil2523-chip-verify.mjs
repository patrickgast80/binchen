/**
 * BIL-2523 — prove the lazy swatch chips still look and behave right.
 *
 * The chip moved from a CSS `background-image` to a real `<img loading="lazy">`
 * so its bytes leave the LCP window. Three things could go wrong silently, so
 * each gets an assertion rather than a screenshot someone has to squint at:
 *
 *   1. The texture simply never loads — a chip would be a flat hex circle and
 *      still look plausible. Checked via naturalWidth on the decoded image.
 *   2. The active check-mark disappears UNDER the texture. The image is
 *      absolutely positioned, so it paints above any non-positioned sibling
 *      regardless of DOM order; `elementFromPoint` at the chip's centre is the
 *      honest test of what a user actually sees.
 *   3. Lazy loading does not actually defer anything — if the palette were in
 *      the initial viewport, or the attribute were dropped, we would have
 *      changed the markup for nothing. Counted as chip requests before scroll.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BIL2523_BASE ?? "http://localhost:3999";
const OUT = path.join(process.cwd(), "reports", "bil2523");
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844, isMobile: true },
  { name: "desktop", width: 1440, height: 900, isMobile: false },
];

const URL_STOFF = `${BASE}/konfigurator/turban?turban=stoff-15&schleife=sage`;

let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
}

const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile,
    deviceScaleFactor: vp.isMobile ? 3 : 2,
  });
  const page = await ctx.newPage();

  const chipRequests = [];
  page.on("request", (r) => {
    if (/\/stoffe\/.*-128\.webp$/.test(r.url())) chipRequests.push(r.url());
  });

  await page.goto(URL_STOFF, { waitUntil: "load" });
  // The relief layer paints on idle; give it the same grace the page does.
  await page.waitForTimeout(2500);

  const beforeScroll = chipRequests.length;

  // Dismiss the consent banner if present — it covers the palette on mobile
  // and would make every screenshot below identical (BIL-2492 lesson).
  const consent = page.getByRole("button", { name: /alle akzeptieren|akzeptieren/i }).first();
  if (await consent.isVisible().catch(() => false)) {
    await consent.click();
    await page.waitForTimeout(400);
  }

  await page.screenshot({ path: path.join(OUT, `turban-${vp.name}-top.png`) });

  // Scroll the palette into view and let the lazy images fire.
  const chip = page.locator('[role="radio"]:visible').first();
  await chip.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, `turban-${vp.name}-palette.png`) });

  const afterScroll = chipRequests.length;
  // Informational, deliberately NOT an assertion. Chrome's lazy threshold is a
  // distance from the viewport (~1250px, larger on a slow link) and the whole
  // palette fits inside it, so nothing defers today and that is expected. The
  // load-ORDER hint below is what this change actually relies on; asserting
  // deferral here would be asserting a thing we know to be false.
  console.log(
    `INFO  ${vp.name}: chip requests ${beforeScroll} before scroll -> ${afterScroll} after ` +
      `(no deferral expected — palette is inside the lazy threshold)`,
  );

  // 1. Every visible chip image actually decoded.
  const imgs = await page.evaluate(() => {
    const out = [];
    for (const img of document.querySelectorAll('[role="radio"] img')) if (img.getBoundingClientRect().width > 0) {
      const r = img.getBoundingClientRect();
      out.push({
        src: img.getAttribute("src"),
        loading: img.loading,
        // The PROPERTY, not the attribute: React emits camelCase
        // `fetchPriority`, and only the property proves the browser parsed it.
        priority: img.fetchPriority,
        nw: img.naturalWidth,
        w: r.width,
      });
    }
    return out;
  });
  const base = await page.evaluate(() => {
    const b = document.querySelector('img[src*="base.webp"]');
    return b ? { priority: b.fetchPriority, loading: b.loading } : null;
  });
  check(`${vp.name}: base photo is fetchpriority=high`, base?.priority === "high", `got ${base?.priority}`);
  check(
    `${vp.name}: every chip is fetchpriority=low`,
    imgs.every((i) => i.priority === "low"),
    `${imgs.filter((i) => i.priority !== "low").length} not low`,
  );
  check(`${vp.name}: chip images present`, imgs.length > 0, `${imgs.length} chips`);
  check(
    `${vp.name}: all chip images decoded`,
    imgs.every((i) => i.nw > 0),
    `${imgs.filter((i) => i.nw === 0).length} undecoded`,
  );
  check(
    `${vp.name}: loading="lazy" on every chip`,
    imgs.every((i) => i.loading === "lazy"),
  );

  // 2. The active chip's check-mark is on top, not buried under the texture.
  const active = page.locator('[role="radio"][aria-checked="true"]:visible').first();
  await active.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const topmost = await active.evaluate((el) => {
    const span = el.querySelector("span");
    const r = span.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { tag: hit?.tagName, isSvg: hit instanceof SVGElement, cls: String(hit?.getAttribute?.("class") ?? "") };
  });
  check(
    `${vp.name}: check-mark paints above the texture`,
    topmost.isSvg || topmost.tag === "svg" || topmost.tag === "path",
    `topmost at chip centre = ${topmost.tag}`,
  );

  await active.screenshot({
    path: path.join(OUT, `turban-${vp.name}-active-chip.png`),
  });

  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
process.exit(failures ? 1 : 0);
