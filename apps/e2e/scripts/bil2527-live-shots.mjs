// BIL-2527 — Sichtprüfung live, 390x844 und 1440x900.
//
// Die Aenderung ist byte-nah und unsichtbar — genau deshalb muss man hingucken.
// Wenn React den Inline-<style> beim Hydrieren doch ueberschriebe, waere die
// Seite komplett unstyled, und das sieht man in einer Sekunde. Zusaetzlich
// laeuft derselbe CSSOM-Zaehler wie im lokalen Hydration-Check mit, denn ein
// Screenshot allein beweist nur den Moment, in dem er entstanden ist.
//
// Consent wird per addInitScript gesetzt: der Cookie-Banner deckt sonst auf
// 390x844 den halben unteren Rand ab und macht jeden Vergleich wertlos
// (BIL-2492). `viewport` MUSS verschachtelt sein — flach ignoriert Playwright
// es still und man screenshottet 1280x720.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE = "https://bilulu.de";
const ROUTES = [
  ["turban", "/konfigurator/turban?turban=sage&schleife=cream"],
  ["hose", "/konfigurator/hose?hose=stoff-15&bund=sage"],
  ["catalog", "/catalog"],
  ["home", "/"],
];
const VIEWPORTS = [
  ["mobile", { width: 390, height: 844 }, 3, true],
  ["desktop", { width: 1440, height: 900 }, 1, false],
];

const OUT = "apps/e2e/reports/bil2527/live-shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const checks = [];

for (const [vpName, viewport, dsf, isMobile] of VIEWPORTS) {
  for (const [name, path] of ROUTES) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, isMobile });
    // Schluessel und Form muessen exakt zu `components/cookie-consent` passen:
    // `bilulu_cookie_consent_v1`, und `version` MUSS "1" sein, sonst verwirft
    // `readStored()` den Eintrag still und der Banner steht wieder da. Genau
    // das ist mir hier einmal passiert — geraten statt nachgesehen.
    await ctx.addInitScript(() => {
      try {
        window.localStorage.setItem(
          "bilulu_cookie_consent_v1",
          JSON.stringify({
            version: "1",
            decidedAt: "2026-01-01T00:00:00.000Z",
            categories: { strict: true, functional: false, analytics: false, marketing: false },
          })
        );
      } catch {
        /* egal */
      }
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    await page.goto(BASE + path, { waitUntil: "load", timeout: 90_000 });
    await page.waitForTimeout(3000);

    const state = await page.evaluate(() => {
      let rules = 0;
      for (const s of Array.from(document.styleSheets)) {
        try {
          rules += s.cssRules.length;
        } catch {
          /* cross-origin */
        }
      }
      return {
        rules,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        cssInFlight: /__next_f/.test(document.documentElement.outerHTML),
      };
    });

    const file = `${OUT}/${name}-${vpName}.png`;
    await page.screenshot({ path: file });
    checks.push({ route: name, viewport: vpName, ...state, errors, file });
    console.log(
      `${name.padEnd(8)} ${vpName.padEnd(8)} rules ${String(state.rules).padStart(4)} bg ${state.bodyBg} errors ${errors.length}  -> ${file}`
    );
    for (const e of errors) console.log("      ! " + e.slice(0, 140));
    await ctx.close();
  }
}

await browser.close();
writeFileSync(`${OUT}/checks.json`, JSON.stringify(checks, null, 2));

const bad = checks.filter((c) => c.rules < 100);
console.log(bad.length ? `FAIL: ${bad.length} Ansichten ohne Styles` : "VERDIKT: OK — jede Ansicht hat ihr CSS");
process.exit(bad.length ? 1 : 0);
