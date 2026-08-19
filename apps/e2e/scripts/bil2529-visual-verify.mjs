// BIL-2529 — der Banner darf nicht nur nicht mehr schieben, er muss auch noch
// da sein.
//
// Die Gefahr des Fixes ist genau eine: der Banner startet unsichtbar und wird
// von einem Skript hinter seinem eigenen Markup wieder sichtbar gemacht. Wenn
// dieses Skript ausfaellt, ist die Einwilligung weg — DSGVO-Rueckschritt, nicht
// Performance-Gewinn. Deshalb prueft dieses Skript vier Dinge:
//
//   1. Banner sichtbar (opacity/visibility, nicht nur "im DOM") binnen 5 s,
//      auf beiden Viewports — dieselbe Schwelle wie der Smoke-Test,
//   2. Screenshots 390x844 und 1440x900 als Beleg,
//   3. axe (wcag2a/aa, 2.1 a/aa) auf der geaenderten Flaeche,
//   4. Konsole ohne Fehler UND ohne Hydration-Warnung — ein Skript, das am DOM
//      vorbei arbeitet, waere genau hier zu sehen.
//
// Zusaetzlich der Fall ohne JavaScript: dann muss die `<noscript>`-Regel den
// Banner sichtbar halten.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../reports/bil2529", process.env.BIL2529_TAG || "visual");
const ORIGIN = process.argv[2];
if (!ORIGIN) throw new Error("Aufruf: node bil2529-visual-verify.mjs <origin>");

const PATHS = [
  { name: "turban", path: "/konfigurator/turban?turban=sage&schleife=cream" },
  { name: "hose", path: "/konfigurator/hose?hose=stoff-15&bund=sage" },
];
const VIEWPORTS = [
  { name: "390x844", width: 390, height: 844 },
  { name: "1440x900", width: 1440, height: 900 },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const result = { origin: ORIGIN, checks: [] };
let failed = 0;

for (const vp of VIEWPORTS) {
  for (const js of [true, false]) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      javaScriptEnabled: js,
    });
    const page = await ctx.newPage();
    const console_ = [];
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") console_.push(`${m.type()}: ${m.text()}`);
    });
    page.on("pageerror", (e) => console_.push(`pageerror: ${e.message}`));

    for (const p of PATHS) {
      await page.goto(ORIGIN + p.path, { waitUntil: "load", timeout: 90_000 });
      let visible = false;
      try {
        await page.waitForSelector('[data-testid="cookie-banner"]', {
          state: "visible",
          timeout: 5000,
        });
        visible = true;
      } catch {
        /* bleibt false */
      }
      const box = await page.locator('[data-testid="cookie-banner"]').boundingBox();
      const check = {
        route: p.name,
        viewport: vp.name,
        js,
        bannerVisible: visible,
        bannerBox: box && { y: Math.round(box.y), h: Math.round(box.height) },
        console: console_.slice(),
      };
      if (!visible) failed += 1;
      if (console_.length) failed += 1;

      if (js) {
        await page.screenshot({ path: `${OUT}/${p.name}-${vp.name}.png`, fullPage: false });
        const axe = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        check.axe = axe.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
        if (axe.violations.length) failed += 1;
      }
      result.checks.push(check);
      console.log(
        `${vp.name} js=${js} ${p.name}: Banner ${visible ? "sichtbar" : "NICHT SICHTBAR"}` +
          (check.bannerBox ? ` (y=${check.bannerBox.y} h=${check.bannerBox.h})` : "") +
          (check.axe ? `, axe ${check.axe.length}` : "") +
          (console_.length ? `, Konsole: ${console_.join(" | ")}` : ""),
      );
      console_.length = 0;
    }
    await ctx.close();
  }
}

await browser.close();
writeFileSync(`${OUT}/visual.json`, JSON.stringify(result, null, 2));
console.log(failed === 0 ? "\nOK — alle Pruefungen bestanden" : `\nFEHLGESCHLAGEN: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
