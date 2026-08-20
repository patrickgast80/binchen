// BIL-2533 — Schritt 1: Patricks Konfiguration live nachstellen (Cache-Frage).
//
// Patricks Screenshot vom 20.08. 12:09Z zeigt schnurgerade Streifen, obwohl
// BIL-2522 (Pass 2, "Muster folgt Falten") am selben Morgen 06:55Z abgenommen
// wurde. Bevor irgendetwas geändert wird, muss belegt sein, WAS live steht:
//
//   (a) Patrick sah einen alten Stand  -> Rest-Lücke kleiner
//   (b) der Pass-2-Effekt ist auf hose-kurz sichtbar zu schwach -> Arbeitsauftrag
//
// Das Skript beantwortet das hart statt per Augenmaß:
//   · wartet auf das Relief-Canvas (opacity 1) — ohne das ist der Screenshot
//     der CSS-Fallback und nicht von "Pass 2 fehlt" zu unterscheiden
//   · schießt zusätzlich EINEN Screenshot mit deaktiviertem Canvas (= exakt der
//     Vor-Pass-2-Look), damit die Differenz messbar ist statt behauptet
//   · Jitter-Kontrolle: dieselbe URL zweimal, Diff muss 0 Bytes sein
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../reports/bil2533/live-repro");
mkdirSync(OUT, { recursive: true });

const BASE = process.argv[2] ?? "https://bilulu.de";
// Patricks Konfiguration: hose-kurz, Streifen/Pferde, Bund+Bündchen Terrakotta
// (beides ist der Default, genau wie in seinem Screenshot).
const PATH = "/konfigurator/hose-kurz?hose=stoff-25";

const VIEWPORTS = [
  { name: "desktop-1440x900", width: 1440, height: 900, mobile: false },
  { name: "mobile-390x844", width: 390, height: 844, mobile: true },
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

async function shoot(browser, v, file, { killRelief = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: 2,
    isMobile: v.mobile,
    hasTouch: v.mobile,
  });
  await ctx.addInitScript(consent);
  if (killRelief) {
    // Die Relief-Ebene braucht relief.webp. Fällt der Request aus, greift der
    // dokumentierte Fallback (relief-layer.tsx, Eigenschaft 1) und die Seite
    // rendert bitgenau den Stand VOR BIL-2522 — die einzige ehrliche Kontrolle
    // für "wie viel bringt Pass 2 auf hose-kurz überhaupt".
    await ctx.route("**/relief.webp", (route) => route.abort());
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(BASE + PATH, { waitUntil: "load", timeout: 90000 });

  let visibleAt = null;
  if (!killRelief) {
    visibleAt = await page.evaluate(async () => {
      const t0 = performance.now();
      while (performance.now() - t0 < 40000) {
        const c = document.querySelector('canvas[aria-hidden="true"]');
        if (c && getComputedStyle(c).opacity === "1") return Math.round(performance.now() - t0);
        await new Promise((r) => setTimeout(r, 25));
      }
      return null;
    });
  } else {
    // Der Fallback braucht einen Moment: der Fetch scheitert, der catch greift,
    // die CSS-Zonen bleiben sichtbar. Es gibt kein Signal dafür — deshalb hart
    // prüfen, dass das Canvas NICHT sichtbar wurde.
    await page.waitForTimeout(3000);
    const canvasVisible = await page.evaluate(() => {
      const c = document.querySelector('canvas[aria-hidden="true"]');
      return Boolean(c && getComputedStyle(c).opacity === "1");
    });
    if (canvasVisible) throw new Error(`${v.name}: Kontrolle zeigt trotzdem das Relief-Canvas`);
  }
  await page.waitForTimeout(400);

  // Der Vorschau-Kasten, nicht das Canvas: in der Kontrolle ist das Canvas
  // leer/unsichtbar, sein Kasten liegt aber deckungsgleich über dem Foto.
  const preview = page.locator("canvas[aria-hidden='true']").first();
  const box = await preview.boundingBox().catch(() => null);
  const shot = resolve(OUT, `${file}.png`);
  await page.screenshot({ path: shot });
  if (box) {
    await page.screenshot({
      path: resolve(OUT, `${file}-preview.png`),
      clip: box,
    });
  }
  await ctx.close();
  return { visibleAt, errors: errors.length, sample: errors.slice(0, 3), shot };
}

const browser = await chromium.launch();
const report = { base: BASE, path: PATH, runs: {} };

for (const v of VIEWPORTS) {
  const live = await shoot(browser, v, `${v.name}-live`);
  report.runs[`${v.name}-live`] = { ...live, md5: md5(live.shot) };
  console.log(
    `${v.name} LIVE       reliefVisibleMs=${live.visibleAt} console.error=${live.errors}`,
  );
  if (live.errors) console.log("   ", live.sample);

  // Jitter-Kontrolle: gleiche URL, gleicher Ablauf, muss byte-identisch sein.
  const again = await shoot(browser, v, `${v.name}-live-jitter`);
  const same = md5(again.shot) === md5(live.shot);
  report.runs[`${v.name}-live-jitter`] = { ...again, md5: md5(again.shot), identical: same };
  console.log(`${v.name} JITTER     identisch=${same}`);

  const css = await shoot(browser, v, `${v.name}-cssfallback`, { killRelief: true });
  report.runs[`${v.name}-cssfallback`] = { ...css, md5: md5(css.shot) };
  console.log(`${v.name} CSS-FALLB. console.error=${css.errors}`);
}

await browser.close();
writeFileSync(resolve(OUT, "results.json"), JSON.stringify(report, null, 2));
console.log(`\n-> ${OUT}`);
