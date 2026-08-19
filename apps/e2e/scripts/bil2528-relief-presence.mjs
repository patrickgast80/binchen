// BIL-2528 — laeuft die Relief-Ebene auf der nackten Konfigurator-Route ueberhaupt?
//
// Die Lighthouse-Zahlen sagen "hose ist teurer als turban". Sie sagen nicht,
// WARUM. Diese Probe beantwortet die Frage binaer am DOM statt am Zeitprofil:
// `ReliefFabricLayer` gibt `null` zurueck, solange keine Zone eine `textureSrc`
// hat — auf einer reinen Uni-Auswahl existiert das <canvas> also gar nicht.
//
// Zusaetzlich messen wir, wieviel Main-Thread die Ebene tatsaechlich frisst:
// `performance.measure`-frei ueber die Long-Task-freie Variante geht nicht, also
// summieren wir alle Tasks zwischen `loadEventEnd` und dem Moment, in dem das
// Canvas sichtbar wird (opacity 1). Das ist die Zeit, die BIL-2527 als
// scriptEvaluation-Differenz gesehen hat.
import { chromium, devices } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../reports/bil2528");
mkdirSync(OUT, { recursive: true });

const URLS = [
  { name: "hose-default", url: "https://bilulu.de/konfigurator/hose" },
  { name: "hose-stoff", url: "https://bilulu.de/konfigurator/hose?hose=stoff-15&bund=sage" },
  { name: "hose-kurz-default", url: "https://bilulu.de/konfigurator/hose-kurz" },
  { name: "muetze-default", url: "https://bilulu.de/konfigurator/muetze" },
  { name: "turban-default", url: "https://bilulu.de/konfigurator/turban" },
  { name: "dreieckstuch-default", url: "https://bilulu.de/konfigurator/dreieckstuch" },
];

const browser = await chromium.launch();
const results = [];
for (const { name, url } of URLS) {
  const ctx = await browser.newContext({ ...devices["Pixel 5"] });
  // Cookie-Banner weg, bevor irgendetwas rendert — sonst deckt er die Vorschau
  // ab und jede Sichtprobe sieht gleich aus (BIL-2492).
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("bilulu-cookie-consent", JSON.stringify({ analytics: false, ts: Date.now() }));
    } catch {}
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load" });

  const probe = await page.evaluate(async () => {
    const t0 = performance.now();
    const canvasSel = 'canvas[aria-hidden="true"]';
    let visibleAt = null;
    // Bis zu 20 s auf ein sichtbares Relief-Canvas warten. Nicht auf Existenz
    // pruefen: die Ebene mountet das Canvas mit opacity 0 und zieht es erst
    // hoch, wenn wirklich gemalt wurde.
    const deadline = t0 + 20000;
    while (performance.now() < deadline) {
      const c = document.querySelector(canvasSel);
      if (c && getComputedStyle(c).opacity === "1") {
        visibleAt = performance.now() - t0;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    const c = document.querySelector(canvasSel);
    const longTasks = performance.getEntriesByType("longtask") ?? [];
    return {
      canvasExists: Boolean(c),
      canvasPx: c ? { w: c.width, h: c.height } : null,
      cssPx: c ? { w: Math.round(c.getBoundingClientRect().width), h: Math.round(c.getBoundingClientRect().height) } : null,
      dpr: devicePixelRatio,
      reliefVisibleAfterLoadMs: visibleAt == null ? null : Math.round(visibleAt),
      longTaskCountAfterLoad: longTasks.length,
    };
  });

  results.push({ name, url, ...probe });
  console.log(name, JSON.stringify(probe));
  await ctx.close();
}
await browser.close();
writeFileSync(resolve(OUT, "relief-presence.json"), JSON.stringify(results, null, 2));
