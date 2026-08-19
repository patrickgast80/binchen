// BIL-2526 — zwei Fragen, die ein Code-Diff nicht beantwortet:
//
//  1. FOUC? Das Inline-CSS steht im <head> VOR jedem Inhalt, ein unstyled
//     Frame ist damit strukturell unmoeglich — aber "strukturell unmoeglich"
//     ist keine Messung. Deshalb wird der erste Frame nach FCP abgegriffen und
//     als Bild abgelegt; wer FOUC behauptet, muss auf dieses Bild zeigen.
//  2. Sieht die fertige Seite identisch aus? base und inline muessen nach dem
//     Laden pixelgleich sein. Nicht "sieht gleich aus" — Byte-Vergleich, weil
//     Screenshot-Belege sonst gerne identisch aussehen und es nicht sind
//     (BIL-2492).
//
// Vier Flaechen, zwei Viewports, beide Builds.
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../reports/bil2526/visual');
mkdirSync(OUT, { recursive: true });

const BUILDS = [
  { key: 'base', origin: 'http://127.0.0.1:3141' },
  { key: 'inline', origin: 'http://127.0.0.1:3142' },
];
const PAGES = [
  { name: 'turban', path: '/konfigurator/turban?turban=sage&schleife=cream' },
  { name: 'home', path: '/' },
  { name: 'catalog', path: '/catalog' },
  { name: 'checkout', path: '/checkout' },
];
const VIEWPORTS = [
  { key: 'mobile', width: 390, height: 844, dpr: 3, mobile: true },
  { key: 'desktop', width: 1440, height: 900, dpr: 1, mobile: false },
];

const md5 = (p) => createHash('md5').update(readFileSync(p)).digest('hex').slice(0, 12);

const browser = await chromium.launch();
const rows = [];

for (const vp of VIEWPORTS) {
  for (const build of BUILDS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.dpr,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
    });
    // Consent vorwegnehmen: das Banner deckt sonst auf jedem Bild dieselbe
    // Flaeche ab und macht zwei verschiedene Seiten zu "identischen" Belegen
    // (BIL-2492). Weggesein wird unten geprueft.
    await context.addInitScript(() => {
      try {
        localStorage.setItem('binchen-cookie-consent', JSON.stringify({ analytics: false, marketing: false, ts: 1 }));
      } catch { /* egal */ }
    });
    const page = await context.newPage();

    for (const p of PAGES) {
      // Ersten Frame nach FCP mitnehmen — das ist der FOUC-Beleg.
      await page.goto(build.origin + p.path, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      const firstShot = resolve(OUT, `${p.name}-${vp.key}-${build.key}-erstframe.png`);
      await page.screenshot({ path: firstShot });

      await page.goto(build.origin + p.path, { waitUntil: 'networkidle', timeout: 90_000 });
      // Stoff-Chips und Relief brauchen einen Moment ueber networkidle hinaus.
      await page.waitForTimeout(1500);
      const shot = resolve(OUT, `${p.name}-${vp.key}-${build.key}.png`);
      await page.screenshot({ path: shot, fullPage: false });

      // Beleg, dass wirklich die erwartete Variante gemessen wurde.
      const marker = await page.evaluate(() => ({
        links: document.querySelectorAll('link[rel="stylesheet"]').length,
        styles: document.querySelectorAll('head style').length,
        // Wenn das Stylesheet fehlte, waere die Body-Hintergrundfarbe der
        // Browser-Default (rgb(0,0,0)/transparent) statt der Creme-Ton.
        bg: getComputedStyle(document.body).backgroundColor,
        banner: document.querySelectorAll('[aria-label*="Cookie" i]').length,
      }));

      rows.push({ page: p.name, viewport: vp.key, build: build.key, ...marker, md5: md5(shot), erstframeMd5: md5(firstShot) });
      console.log(JSON.stringify(rows.at(-1)));
    }
    await context.close();
  }
}
await browser.close();

console.log('\n| Seite | Viewport | Build | link | head-style | body-bg | Screenshot-md5 |');
console.log('| --- | --- | --- | --- | --- | --- | --- |');
for (const r of rows) {
  console.log(`| ${r.page} | ${r.viewport} | ${r.build} | ${r.links} | ${r.styles} | ${r.bg} | ${r.md5} |`);
}

console.log('\nPixelgleich base vs inline (Endzustand):');
let mismatches = 0;
for (const vp of VIEWPORTS) {
  for (const p of PAGES) {
    const b = rows.find((r) => r.page === p.name && r.viewport === vp.key && r.build === 'base');
    const i = rows.find((r) => r.page === p.name && r.viewport === vp.key && r.build === 'inline');
    const same = b.md5 === i.md5;
    if (!same) mismatches++;
    console.log(`  ${same ? 'GLEICH  ' : 'ABWEICHT'} ${p.name} / ${vp.key}  ${b.md5} vs ${i.md5}`);
  }
}
console.log(`\nAbweichungen: ${mismatches}`);
writeFileSync(resolve(OUT, 'results.json'), JSON.stringify({ rows, mismatches }, null, 1));
