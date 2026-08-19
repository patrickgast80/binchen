// BIL-2527 — beweist, dass der Inline-<style> die Hydration ueberlebt.
//
// Seit BIL-2527 ist `GlobalStyles` eine Client-Komponente, deren CSS-Text im
// Client-Bundle absichtlich LEER ist (next.config.mjs ersetzt das Modul im
// Client-Compiler). Der Server rendert die vollen 32 KiB in den <style>-Tag,
// der Client rendert dieselbe Komponente mit leerem Text. Die Erwartung: React
// behandelt `<style precedence href>` als Float-Ressource, findet den bereits
// im <head> stehenden Tag ueber sein `data-href` wieder, adoptiert ihn und
// laesst den Inhalt in Ruhe.
//
// Diese Erwartung ist genau die Sorte Annahme, die still kaputtgeht: schreibt
// React den Tag doch neu, ist die Seite nach der Hydration unstyled — und ein
// Screenshot, den man zu frueh macht, zeigt trotzdem die richtige Seite, weil
// das SSR-HTML ja korrekt war. Deshalb wird hier NACH der Hydration gemessen,
// und zwar am CSSOM (`document.styleSheets[].cssRules.length`), nicht am
// Aussehen.
//
// Der Selbsttest gehoert dazu: gegen den Basis-Build (CSS noch im Flight-
// Payload) MUESSEN dieselben Zahlen herauskommen. Kaeme dort etwas anderes
// heraus, wuerde das Skript nicht die Hydration messen, sondern sich selbst.
//
// Aufruf: node bil2527-hydration-check.mjs <label>=<origin> ...
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const targets = process.argv.slice(2).map((raw) => {
  const [label, origin] = raw.split("=");
  return { label, origin };
});

const ROUTES = [
  ["turban", "/konfigurator/turban?turban=sage&schleife=cream"],
  ["hose", "/konfigurator/hose?hose=stoff-15&bund=sage"],
  ["catalog", "/catalog"],
];

// 390x844 ist das Geraet, auf dem die Seite verkauft wird. `viewport` MUSS ein
// verschachteltes Objekt sein — flache width/height ignoriert Playwright still.
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true };

const browser = await chromium.launch();
const results = [];

for (const t of targets) {
  for (const [name, path] of ROUTES) {
    const ctx = await browser.newContext(MOBILE);
    // Der Cookie-Banner ueberdeckt sonst den unteren Seitenrand und faelscht
    // jeden visuellen Vergleich (BIL-2492).
    await ctx.addInitScript(() => {
      try {
        window.localStorage.setItem(
          "bilulu-cookie-consent",
          JSON.stringify({ analytics: false, decidedAt: "2026-01-01T00:00:00.000Z" })
        );
      } catch {
        /* Storage kann blockiert sein — dann eben mit Banner. */
      }
    });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

    await page.goto(t.origin + path, { waitUntil: "load", timeout: 60_000 });
    // Auf die Hydration warten, nicht auf einen Timer: der Konfigurator setzt
    // erst nach dem React-Mount ein Attribut auf <html> (Next: data-* fehlt,
    // deshalb der Umweg ueber ein interaktives Element).
    await page
      .waitForFunction(() => {
        const btn = document.querySelector("button");
        return Boolean(btn && Object.keys(btn).some((k) => k.startsWith("__react")));
      }, { timeout: 30_000 })
      .catch(() => {});
    await page.waitForTimeout(1500);

    const cssom = await page.evaluate(() => {
      let rules = 0;
      let sheets = 0;
      for (const s of Array.from(document.styleSheets)) {
        sheets += 1;
        try {
          rules += s.cssRules.length;
        } catch {
          /* cross-origin */
        }
      }
      const styleTags = Array.from(document.querySelectorAll("style"));
      const body = document.body;
      return {
        sheets,
        rules,
        styleTagCount: styleTags.length,
        styleTagChars: styleTags.reduce((n, e) => n + e.textContent.length, 0),
        // Wenn das CSS weg waere, faellt die Hintergrundfarbe auf die
        // UA-Vorgabe zurueck. Ein billiger, aber eindeutiger zweiter Zeuge.
        bodyBg: getComputedStyle(body).backgroundColor,
        bodyFont: getComputedStyle(body).fontFamily.slice(0, 40),
        docHeight: document.documentElement.scrollHeight,
      };
    });

    const hydrationErrors = consoleErrors.filter((m) =>
      /hydrat|did not match|Minified React error #(418|423|425)/i.test(m)
    );

    results.push({
      variant: t.label,
      route: name,
      ...cssom,
      hydrationErrors,
      otherConsole: consoleErrors.filter((m) => !hydrationErrors.includes(m)),
    });

    mkdirSync("apps/e2e/reports/bil2527/hydration", { recursive: true });
    await page.screenshot({
      path: `apps/e2e/reports/bil2527/hydration/${t.label}-${name}-390x844.png`,
    });
    await ctx.close();
  }
}

await browser.close();

for (const r of results) {
  console.log(
    `${r.variant.padEnd(6)} ${r.route.padEnd(8)} sheets ${r.sheets} rules ${String(r.rules).padStart(4)} ` +
      `styleTags ${r.styleTagCount} (${r.styleTagChars} Zeichen) bg ${r.bodyBg} h ${r.docHeight} ` +
      `hydrationErrors ${r.hydrationErrors.length}`
  );
  for (const m of r.hydrationErrors) console.log("        ! " + m.slice(0, 200));
  for (const m of r.otherConsole) console.log("        . " + m.slice(0, 160));
}

writeFileSync("apps/e2e/reports/bil2527/hydration/results.json", JSON.stringify(results, null, 2));

// Verdikt: pro Route muessen alle Varianten dieselbe Regelanzahl haben.
let failed = false;
for (const [, name] of ROUTES) {
  const forRoute = results.filter((r) => r.route === name);
  const uniq = new Set(forRoute.map((r) => r.rules));
  if (uniq.size > 1) {
    failed = true;
    console.log(`FAIL ${name}: Regelanzahl weicht ab -> ${[...uniq].join(" vs ")}`);
  }
  if (forRoute.some((r) => r.rules < 100)) {
    failed = true;
    console.log(`FAIL ${name}: weniger als 100 CSS-Regeln — die Seite ist unstyled`);
  }
  if (forRoute.some((r) => r.hydrationErrors.length > 0)) {
    failed = true;
    console.log(`FAIL ${name}: Hydration-Fehler in der Konsole`);
  }
}
console.log(failed ? "VERDIKT: FAIL" : "VERDIKT: OK");
process.exit(failed ? 1 : 0);
