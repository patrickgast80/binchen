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

/**
 * Two fabrics plus a quarter-turn per Konfigurator — the acceptance criteria
 * ask for at least two different fabrics on desktop and at 390px. The zone
 * parameter names differ per piece, so they cannot be shared.
 */
const CASES_BY_KONFIG = {
  hose: [
    { tag: "stoff-04-mustard", query: "hose=stoff-04&bund=mustard&buendchen=mustard" },
    { tag: "stoff-15-sage", query: "hose=stoff-15&bund=sage&buendchen=sage" },
    { tag: "stoff-20-petrol-rot90", query: "hose=stoff-20&bund=petrol&buendchen=petrol&rot=90" },
  ],
  "hose-kurz": [
    { tag: "stoff-04-mustard", query: "hose=stoff-04&bund=mustard&buendchen=mustard" },
    { tag: "stoff-15-sage", query: "hose=stoff-15&bund=sage&buendchen=sage" },
    { tag: "stoff-20-petrol-rot90", query: "hose=stoff-20&bund=petrol&buendchen=petrol&rot=90" },
  ],
  muetze: [
    { tag: "stoff-04-mustard", query: "muetze=stoff-04&futter=mustard" },
    { tag: "stoff-15-sage", query: "muetze=stoff-15&futter=sage" },
    { tag: "stoff-20-petrol-rot90", query: "muetze=stoff-20&futter=petrol&rot=90" },
  ],
  turban: [
    { tag: "stoff-04-mustard", query: "turban=stoff-04&schleife=mustard" },
    { tag: "stoff-15-sage", query: "turban=stoff-15&schleife=sage" },
    { tag: "stoff-20-petrol-rot90", query: "turban=stoff-20&schleife=petrol&rot=90" },
  ],
  dreieckstuch: [
    { tag: "stoff-04", query: "tuch=stoff-04" },
    { tag: "stoff-15", query: "tuch=stoff-15" },
    { tag: "stoff-20-rot90", query: "tuch=stoff-20&rot=90" },
  ],
};

const CASES = CASES_BY_KONFIG[KONFIG];
if (!CASES) throw new Error(`no shot cases for konfigurator ${KONFIG}`);
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

/**
 * At 390x844 the sticky mobile palette sheet owns the bottom 503px, so only
 * ~241px of usable band is left above it. The Mütze preview is 301px tall and
 * the Turban 272px — they genuinely cannot be shown whole on that viewport, and
 * no amount of scrolling changes that. (The Dreieckstuch fits by 4px, which is
 * close enough to the edge to flip between runs.)
 *
 * Rather than crop the garment or screenshot the palette, those cases are
 * retaken at the SAME 390px width on a taller viewport — the mobile layout is
 * identical, only more of it is visible at once. Recorded per shot in
 * shots.json so nobody has to take that on trust.
 */
const TALL = 1400;

for (const vp of VIEWPORTS) {
  for (const c of CASES) {
    const url = `${BASE}/konfigurator/${KONFIG}?${c.query}`;

    let used = vp;
    let ctx = await newContext(used);
    const f1 = path.join(OUT, `${KONFIG}-${c.tag}-${vp.name}.png`);
    const f2 = path.join(OUT, `.jitter-${KONFIG}-${c.tag}-${vp.name}.png`);
    let h1;
    let h2;
    try {
      h1 = await shoot(ctx, url, f1, { waitForCanvas: true });
      h2 = await shoot(ctx, url, f2, { waitForCanvas: true });
    } catch (err) {
      if (!/under the sticky sheet/.test(err.message)) throw err;
      await ctx.close();
      used = { ...vp, height: TALL };
      ctx = await newContext(used);
      console.log(`      ${c.tag}: preview does not fit above the palette sheet at ` +
        `${vp.width}x${vp.height} — retaken at ${vp.width}x${TALL}`);
      h1 = await shoot(ctx, url, f1, { waitForCanvas: true });
      h2 = await shoot(ctx, url, f2, { waitForCanvas: true });
    }

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
      viewportPx: `${used.width}x${used.height}`,
      retakenTaller: used.height !== vp.height,
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
