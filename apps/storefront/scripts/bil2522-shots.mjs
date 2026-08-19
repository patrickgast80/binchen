/**
 * BIL-2522 — live preview screenshots, desktop + 390px mobile.
 *
 * Captures the preview box twice per URL (jitter control: identical bytes or
 * the pair proves nothing, BIL-2506) plus one run with relief.webp blocked,
 * which is the CSS fallback the layer degrades to.
 *
 * Consent is seeded before the first navigation. Without it the banner covers
 * the whole preview at 390px and BOTH shots of a pair come back as pictures of
 * the banner — byte-identical, and a completely convincing-looking non-result.
 *
 *   node scripts/bil2522-shots.mjs --base http://127.0.0.1:3522 --out .tmp/...
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const BASE = arg("base", "http://127.0.0.1:3522");
const OUT = arg("out", ".tmp/bil2522/shots");
const KONFIG = arg("konfig", "hose");

const { chromium } = await import(
  new URL("../../e2e/node_modules/@playwright/test/index.mjs", import.meta.url).href
);

const CASES = [
  { tag: "stoff-04-mustard", query: "hose=stoff-04&bund=mustard&buendchen=mustard" },
  { tag: "stoff-15-sage", query: "hose=stoff-15&bund=sage&buendchen=sage" },
  { tag: "stoff-20-petrol-rot90", query: "hose=stoff-20&bund=petrol&buendchen=petrol&rot=90" },
];
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
];

const md5 = (buf) => createHash("md5").update(buf).digest("hex").slice(0, 12);

const CONSENT = JSON.stringify({
  version: "1",
  decidedAt: "2026-08-19T00:00:00.000Z",
  categories: { strict: true, functional: true, analytics: false, marketing: false },
});

async function newContext(vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  await ctx.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    ["bilulu_cookie_consent_v1", CONSENT],
  );
  return ctx;
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const results = [];

async function shoot(ctx, url, file, { waitForCanvas, blockRelief = false }) {
  const page = await ctx.newPage();
  if (blockRelief) await page.route("**/relief.webp", (route) => route.abort());
  await page.goto(url, { waitUntil: "networkidle" });
  if (waitForCanvas) {
    await page.waitForFunction(
      () => {
        const c = document.querySelector("canvas");
        return Boolean(c) && getComputedStyle(c).opacity === "1";
      },
      null,
      { timeout: 20000, polling: 200 },
    );
  }
  const box = page.locator('[role="img"][aria-label*="Vorschau"]').first();
  // Scroll the preview to the top of the viewport before capturing. At 390px
  // the sticky mobile palette sheet owns the bottom 262px and sits *over* the
  // preview where it lands by default — an element screenshot happily includes
  // it, and the result is a picture of the colour chips.
  const stickyTop = () =>
    page.evaluate(() => {
      const el = [...document.querySelectorAll("div")].find((d) => {
        const s = getComputedStyle(d);
        return s.position === "fixed" && d.getBoundingClientRect().height > 100;
      });
      return el ? el.getBoundingClientRect().top : Number.POSITIVE_INFINITY;
    });

  let sheet = await stickyTop();
  let rect = await box.boundingBox();
  if (rect.y + rect.height > sheet) {
    // Integer scroll only: a fractional scrollY renders the preview at a
    // sub-pixel offset, and two captures of the SAME url then differ — which
    // would quietly destroy the jitter control this script exists to provide.
    await box.evaluate((el) => {
      // 100px, not 24: the sticky site header is not `position: fixed` and so
      // is not caught by the sheet probe below, but it still paints over the
      // top of the preview.
      window.scrollTo(0, Math.round(el.getBoundingClientRect().top + window.scrollY - 100));
    });
    await page.waitForTimeout(150);
    sheet = await stickyTop();
    rect = await box.boundingBox();
  }
  if (rect.y + rect.height > sheet) {
    throw new Error(
      `preview (${rect.y}..${rect.y + rect.height}) is under the sticky sheet at ${sheet} — ` +
      `the screenshot would show the palette, not the garment`,
    );
  }
  await box.screenshot({ path: file });
  await page.close();
  return md5(await readFile(file));
}

for (const vp of VIEWPORTS) {
  for (const c of CASES) {
    const url = `${BASE}/konfigurator/${KONFIG}?${c.query}`;

    const ctx = await newContext(vp);
    const f1 = path.join(OUT, `${KONFIG}-${c.tag}-${vp.name}.png`);
    const f2 = path.join(OUT, `.jitter-${KONFIG}-${c.tag}-${vp.name}.png`);
    const h1 = await shoot(ctx, url, f1, { waitForCanvas: true });
    const h2 = await shoot(ctx, url, f2, { waitForCanvas: true });

    // Fallback: block the relief map. That drives the real error path — decode
    // fails, the layer reports not-ready, and the CSS multiply zones stay
    // visible — which is a stronger check than merely turning JS off, and it
    // still lets the consent banner be dismissed so the preview is visible.
    const f3 = path.join(OUT, `${KONFIG}-${c.tag}-${vp.name}-fallback.png`);
    const h3 = await shoot(ctx, url, f3, { waitForCanvas: false, blockRelief: true });
    await ctx.close();

    results.push({
      url,
      viewport: vp.name,
      shot: path.basename(f1),
      jitterIdentical: h1 === h2,
      md5: h1,
      fallbackMd5: h3,
      fallbackDiffers: h1 !== h3,
    });
    console.log(
      `${vp.name.padEnd(7)} ${c.tag.padEnd(22)} md5=${h1} jitter=${h1 === h2 ? "OK" : "DRIFT"} ` +
      `fallback=${h3} ${h1 !== h3 ? "(differs, as expected)" : "(IDENTICAL — relief not applied!)"}`,
    );
  }
}

await browser.close();
await writeFile(path.join(OUT, "shots.json"), JSON.stringify(results, null, 2));
const bad = results.filter((r) => !r.jitterIdentical || !r.fallbackDiffers);
console.log(`\n${results.length - bad.length}/${results.length} clean`);
if (bad.length) process.exitCode = 1;
