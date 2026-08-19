// BIL-2528 — wie teuer ist das Warten wirklich, gestalterisch?
//
// Die Entscheidung "spaeter rechnen" kostet genau eine Sache: der Besucher sieht
// fuer die Dauer der Rechnung die flache CSS-Version statt der Relief-Version.
// Wie schlimm das ist, kann man nicht am Quelltext entscheiden — nur am Bild,
// und zwar in der Groesse, in der das Bild auf dem Geraet wirklich steht (311
// CSS px auf einem Pixel 5, nicht 900).
//
// Deshalb schiessen wir DIESELBE Deep-Link-URL zweimal:
//   before  — direkt nach `load`, bevor das Relief-Canvas sichtbar wird
//   after   — sobald das Canvas opacity 1 hat
// Beide als Ausschnitt der Vorschau-Box, in Geraete-Aufloesung.
//
// Jitter-Kontrolle: `after` wird zweimal geschossen (zwei Kontexte, gleiche URL).
// Wenn die beiden `after`-Bilder nicht byte-identisch sind, misst der Vergleich
// Rauschen und nicht den Effekt (BIL-2492).
import { chromium, devices } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../reports/bil2528/swap");
mkdirSync(OUT, { recursive: true });

const URL_DEEP = "https://bilulu.de/konfigurator/hose?hose=stoff-15&bund=sage";
const PREVIEW = 'div[role="img"][aria-label*="Hose"]';

const browser = await chromium.launch();

// Zwei Ansichten, weil sie verschiedene Fragen beantworten:
//  - `desktop` zeigt die Vorschau ungeschnitten und ist der Qualitaetsvergleich.
//  - `mobile` zeigt, wieviel von der Vorschau hinter dem Paletten-Sheet ueberhaupt
//    zu sehen ist — auf einem Pixel 5 ist das etwa ein Drittel.
const VIEWS = {
  mobile: { ...devices["Pixel 5"] },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};

async function shoot(label, { waitForRelief, view = "mobile" }) {
  const ctx = await browser.newContext(VIEWS[view]);
  // Exakt der Key/Payload aus cookie-consent.tsx. Ein falscher Key wird still
  // ignoriert, der Banner deckt die Vorschau ab — und die Jitter-Kontrolle
  // besteht trotzdem, weil zwei Banner identisch aussehen (BIL-2492).
  await ctx.addInitScript(() => {
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
  });
  const page = await ctx.newPage();
  await page.goto(URL_DEEP, { waitUntil: "load" });
  // Der Banner steht bis zur Hydration auch mit gesetztem Consent im DOM (er
  // rendert absichtlich server-seitig mit). Erst danach ist der Ausschnitt frei.
  await page.locator("#cookie-consent").waitFor({ state: "detached", timeout: 5000 });
  let visibleAt = null;
  if (waitForRelief) {
    visibleAt = await page.evaluate(async () => {
      const t0 = performance.now();
      while (performance.now() - t0 < 20000) {
        const c = document.querySelector('canvas[aria-hidden="true"]');
        if (c && getComputedStyle(c).opacity === "1") return Math.round(performance.now() - t0);
        await new Promise((r) => setTimeout(r, 25));
      }
      return null;
    });
  } else {
    // Vor dem Swap: sicherstellen, dass das Canvas noch NICHT sichtbar ist,
    // sonst ist das "before"-Bild in Wahrheit ein zweites "after".
    const opacity = await page.evaluate(() => {
      const c = document.querySelector('canvas[aria-hidden="true"]');
      return c ? getComputedStyle(c).opacity : "no-canvas";
    });
    if (opacity === "1") throw new Error("Relief war schon sichtbar — 'before' waere gelogen");
  }
  const file = resolve(OUT, `${label}.png`);
  await page.locator(PREVIEW).first().screenshot({ path: file });
  await ctx.close();
  const md5 = createHash("md5").update(readFileSync(file)).digest("hex");
  console.log(label, "visibleAfterLoadMs=", visibleAt, "md5=", md5);
  return { label, file, visibleAt, md5 };
}

const shots = {
  mobileBefore: await shoot("mobile-before-flat-css", { waitForRelief: false, view: "mobile" }),
  mobileAfter: await shoot("mobile-after-relief", { waitForRelief: true, view: "mobile" }),
  desktopBefore: await shoot("desktop-before-flat-css", { waitForRelief: false, view: "desktop" }),
  desktopAfter: await shoot("desktop-after-relief", { waitForRelief: true, view: "desktop" }),
  desktopAfterJitter: await shoot("desktop-after-relief-jitter", {
    waitForRelief: true,
    view: "desktop",
  }),
};
await browser.close();

const stable = shots.desktopAfter.md5 === shots.desktopAfterJitter.md5;
const changed = shots.desktopBefore.md5 !== shots.desktopAfter.md5;
const before = shots.desktopBefore;
const after1 = shots.desktopAfter;
writeFileSync(resolve(OUT, "swap.json"), JSON.stringify({ url: URL_DEEP, shots, stable, changed }, null, 2));
console.log(
  `\nJitter-Kontrolle: zwei 'after' identisch = ${stable}\n` +
    `Swap ueberhaupt sichtbar (before != after) = ${changed}`,
);
if (!stable) console.log("WARNUNG: 'after' ist nicht reproduzierbar — Vergleich misst Rauschen.");
