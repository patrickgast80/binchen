// BIL-2533 — die Belege, an denen das Board abnimmt.
//
// Schießt live und mit Jitter-Kontrolle:
//   · Patricks Konfiguration (hose-kurz, stoff-25, Bund/Bündchen Terrakotta)
//   · einen zweiten gemusterten Stoff (Akzeptanzkriterium 2)
//   · eine reine Uni-Konfiguration — die Zone, die vorher gar nicht durch die
//     Relief-Ebene lief und deshalb ein flacher Farbverlauf war
//   · `?rot=90` als Regressionsprobe (BIL-2492)
// je Desktop 1440 und 390px mobil, und baut daraus den Vorher/Nachher-Bogen.
//
// "Vorher" ist NICHT aus dem Gedächtnis: dieselbe Live-Seite mit abgewürgtem
// relief.webp fällt dokumentiert auf den CSS-Multiply zurück, also auf exakt
// den Stand, den Patrick fotografiert hat. Beide Hälften kommen damit aus
// demselben Lauf gegen denselben Server.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../reports/bil2533/evidence");
mkdirSync(OUT, { recursive: true });

const BASE = process.argv[2] ?? "https://bilulu.de";
const CASES = [
  { id: "stoff25", q: "?hose=stoff-25", note: "Patricks Konfiguration" },
  { id: "stoff01", q: "?hose=stoff-01&bund=sage&buendchen=sage", note: "zweiter gemusterter Stoff" },
  { id: "uni", q: "?hose=navy&bund=cream&buendchen=cream", note: "reine Uni — vorher ohne Relief" },
  { id: "stoff25-rot90", q: "?hose=stoff-25&rot=90", note: "Regressionsprobe BIL-2492" },
];
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
];

const consent = () => {
  try {
    window.localStorage.setItem(
      "bilulu_cookie_consent_v1",
      JSON.stringify({
        version: "1",
        decidedAt: "2026-01-01T00:00:00.000Z",
        categories: { strict: true, functional: false, analytics: false, marketing: false },
      }),
    );
  } catch {
    /* egal */
  }
};
const md5 = (f) => createHash("md5").update(readFileSync(f)).digest("hex");

async function shoot(browser, v, url, file, { killRelief = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: 2,
    isMobile: v.mobile,
    hasTouch: v.mobile,
  });
  await ctx.addInitScript(consent);
  if (killRelief) await ctx.route("**/relief.webp", (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(url, { waitUntil: "load", timeout: 90000 });

  let visibleAt = null;
  if (killRelief) {
    await page.waitForTimeout(3000);
    const vis = await page.evaluate(() => {
      const c = document.querySelector('canvas[aria-hidden="true"]');
      return Boolean(c && getComputedStyle(c).opacity === "1");
    });
    if (vis) throw new Error(`${file}: Kontrolle zeigt trotzdem das Relief-Canvas`);
  } else {
    visibleAt = await page.evaluate(async () => {
      const t0 = performance.now();
      while (performance.now() - t0 < 40000) {
        const c = document.querySelector('canvas[aria-hidden="true"]');
        if (c && getComputedStyle(c).opacity === "1") return Math.round(performance.now() - t0);
        await new Promise((r) => setTimeout(r, 25));
      }
      return null;
    });
    if (visibleAt === null) throw new Error(`${file}: Relief-Canvas wurde nie sichtbar`);
  }
  await page.waitForTimeout(400);
  const box = await page.locator("canvas[aria-hidden='true']").first().boundingBox();
  const shot = resolve(OUT, `${file}.png`);
  await page.screenshot({ path: shot, clip: box });
  await ctx.close();
  return { shot, visibleAt, errors: errors.length, sample: errors.slice(0, 2) };
}

const browser = await chromium.launch();
const report = { base: BASE, cases: {} };
for (const c of CASES) {
  for (const v of VIEWPORTS) {
    const url = `${BASE}/konfigurator/hose-kurz${c.q}`;
    const after = await shoot(browser, v, url, `${c.id}-${v.name}-nachher`);
    const jit = await shoot(browser, v, url, `${c.id}-${v.name}-jitter`);
    const before = await shoot(browser, v, url, `${c.id}-${v.name}-vorher`, { killRelief: true });
    const identical = md5(after.shot) === md5(jit.shot);
    report.cases[`${c.id}-${v.name}`] = {
      url,
      note: c.note,
      reliefVisibleMs: after.visibleAt,
      consoleErrors: after.errors,
      jitterIdentical: identical,
      md5After: md5(after.shot),
      md5Before: md5(before.shot),
    };
    console.log(
      `${c.id.padEnd(14)} ${v.name.padEnd(8)} reliefVisibleMs=${String(after.visibleAt).padStart(5)} ` +
      `jitter=${identical ? "identisch" : "ABWEICHEND"} console.error=${after.errors}`,
    );
    if (after.errors) console.log("   ", after.sample);
  }
}
await browser.close();
writeFileSync(resolve(OUT, "results.json"), JSON.stringify(report, null, 2));
console.log(`\n-> ${OUT}`);
