// BIL-2526 — die CLS-Restklasse benennen, nicht wegrunden.
//
// Befund aus den Live-Lighthouse-Reports (`reports/bil2526/live2/`): das
// verschiebende Element ist IMMER das Mobil-Palette-Sheet — `hose-jitter`
// CLS 0,105, `turban-jitter` 0,007, und im selben Lauf dieselbe URL mit 0.
// Gleiche URL, unterschiedliches Ergebnis => Timing, nicht Inhalt.
//
// Diese Sonde misst deshalb nicht "ist CLS klein", sondern WAS am Sheet sich
// bewegt: Hoehe ueber die Zeit ab dem allerersten Frame, dazu jeder
// layout-shift mit vorher/nachher-Rechteck. Erst damit kann man sagen, ob es
// ein Hydration-Sprung, ein Font-Swap oder das svh/vh-Deckel ist.
//
// Aufruf: node scripts/bil2526-sheet-shift-hunt.mjs [runs] [url...]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../reports/bil2526/cls-hunt');
mkdirSync(OUT, { recursive: true });

const runs = Number(process.argv[2] ?? 4);
const urls =
  process.argv.slice(3).length > 0
    ? process.argv.slice(3)
    : [
        'https://bilulu.de/konfigurator/hose',
        'https://bilulu.de/konfigurator/turban?turban=stoff-15&schleife=sage',
      ];

// Lighthouse mobil: 412x823 @1.75 ist das emulierte Moto G. 390x844 ist der
// Viewport aus unserer Definition of Done — beide, weil der Deckel des
// Swatch-Scrollers in svh rechnet und damit direkt an der Viewporthoehe haengt.
const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844, dsf: 3 },
  { name: '412x823', width: 412, height: 823, dsf: 1.75 },
];

const probe = () => {
  // Laeuft vor jedem Skript der Seite.
  window.__ev = [];
  const t = () => Math.round(performance.now());

  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__ev.push({
        kind: 'shift',
        t: t(),
        value: e.value,
        sources: (e.sources ?? []).map((s) => ({
          node: s.node ? String(s.node.nodeName) + '.' + String(s.node.className ?? '').slice(0, 90) : null,
          prev: s.previousRect ? s.previousRect.toJSON() : null,
          curr: s.currentRect ? s.currentRect.toJSON() : null,
        })),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });

  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__ev.push({ kind: 'paint', t: Math.round(e.startTime), name: e.name });
  }).observe({ type: 'paint', buffered: true });

  // Sheet-Hoehe pro Frame. Nur Aenderungen protokollieren, sonst ertrinkt man.
  let lastH = null;
  let lastVar = null;
  const tick = () => {
    const el = document.querySelector('[aria-label="Farbauswahl-Panel"]');
    if (el) {
      const h = Math.round(el.getBoundingClientRect().height);
      const v = getComputedStyle(document.documentElement).getPropertyValue('--binchen-palette-sheet-h').trim();
      if (h !== lastH || v !== lastVar) {
        window.__ev.push({ kind: 'sheet', t: t(), h, cssVar: v || '(unset -> 280px Fallback)', hydrated: !!document.querySelector('[aria-label="Farbauswahl-Panel"]')?.isConnected });
        lastH = h;
        lastVar = v;
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // Font-Swap ist der andere Kandidat fuer Hoehenaenderung an Textzeilen.
  if (document.fonts) {
    document.fonts.ready.then(() => window.__ev.push({ kind: 'fonts-ready', t: t() }));
  }
  window.addEventListener('load', () => window.__ev.push({ kind: 'load', t: t() }), { once: true });
};

const browser = await chromium.launch();
const results = [];

for (const vp of VIEWPORTS) {
  for (const url of urls) {
    for (let i = 1; i <= runs; i++) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.dsf,
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      await page.addInitScript(probe);

      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 150,
        downloadThroughput: (1474 * 1024) / 8,
        uploadThroughput: (675 * 1024) / 8,
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

      await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
      // Lange genug, dass die nach `load` angeforderten Chip-Texturen (BIL-2526)
      // wirklich alle da sind — die sind der Verdaechtige, der erst nach `load`
      // ueberhaupt anfaengt.
      await page.waitForTimeout(6000);

      const ev = await page.evaluate(() => window.__ev);
      const cls = ev.filter((e) => e.kind === 'shift').reduce((s, e) => s + e.value, 0);
      const sheets = ev.filter((e) => e.kind === 'sheet');
      results.push({ url, viewport: vp.name, run: i, cls: +cls.toFixed(4), sheetHeights: sheets, events: ev });

      const tag = `${vp.name} run${i} ${url.replace('https://bilulu.de/konfigurator/', '')}`;
      console.log(
        `${tag.padEnd(58)} CLS=${cls.toFixed(4).padStart(7)}  Sheet: ${sheets.map((s) => `${s.t}ms:${s.h}px`).join(' -> ') || '(nie gesehen)'}`,
      );
      for (const e of ev.filter((x) => x.kind === 'shift')) {
        for (const s of e.sources) {
          const dy = s.prev && s.curr ? Math.round(s.curr.y - s.prev.y) : null;
          const dh = s.prev && s.curr ? Math.round(s.curr.height - s.prev.height) : null;
          console.log(`    shift t=${e.t} v=${e.value.toFixed(4)} dy=${dy} dh=${dh} ${String(s.node).slice(0, 80)}`);
        }
      }
      await context.close();
    }
  }
}

writeFileSync(resolve(OUT, 'results.json'), JSON.stringify(results, null, 1));
const bad = results.filter((r) => r.cls > 0.01);
console.log(`\n${results.length} Laeufe, ${bad.length} mit CLS > 0,01. Max = ${Math.max(...results.map((r) => r.cls)).toFixed(4)}`);

await browser.close();
