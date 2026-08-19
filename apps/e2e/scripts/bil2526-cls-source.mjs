// BIL-2526 — wer verschiebt sich? Das Inline-CSS malt ~1,2 s frueher, dadurch
// wird ein Layout-Sprung SICHTBAR, der vorher hinter dem spaeten ersten Frame
// verschwand. Lighthouse zeigt nur das verschobene Element; hier will ich die
// `sources` mit vorher/nachher-Rechtecken, um die Ursache zu benennen.
//
// Aufruf: node scripts/bil2526-cls-source.mjs <url> [labelfuer-datei]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../reports/bil2526/cls');
mkdirSync(OUT, { recursive: true });

const url = process.argv[2];
const label = process.argv[3] ?? 'run';
if (!url) throw new Error('URL fehlt');

const browser = await chromium.launch();
// viewport gehoert in den Context — flach uebergeben wird es still ignoriert
// und man misst 1280x720 (BIL-2523).
const context = await browser.newContext({
  viewport: { width: 412, height: 823 },
  deviceScaleFactor: 1.75,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

await page.addInitScript(() => {
  window.__shifts = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.hadRecentInput) continue;
      window.__shifts.push({
        t: Math.round(entry.startTime),
        value: entry.value,
        sources: (entry.sources ?? []).map((s) => ({
          node: s.node ? s.node.outerHTML.slice(0, 160) : null,
          prev: s.previousRect ? { ...s.previousRect.toJSON() } : null,
          curr: s.currentRect ? { ...s.currentRect.toJSON() } : null,
        })),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });
  window.__paints = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__paints.push({ name: e.name, t: Math.round(e.startTime) });
  }).observe({ type: 'paint', buffered: true });
});

// Drosseln wie Lighthouse mobil, sonst passiert alles zu schnell, um den
// Sprung ueberhaupt zu erwischen.
const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 150,
  downloadThroughput: (1474 * 1024) / 8,
  uploadThroughput: (675 * 1024) / 8,
});
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

await page.goto(url, { waitUntil: 'load', timeout: 90_000 });
await page.waitForTimeout(4000);

const shifts = await page.evaluate(() => window.__shifts);
const paints = await page.evaluate(() => window.__paints);
const total = shifts.reduce((s, x) => s + x.value, 0);

console.log(JSON.stringify({ url, paints, cls: +total.toFixed(4), shifts }, null, 1));
writeFileSync(resolve(OUT, `${label}.json`), JSON.stringify({ url, paints, cls: total, shifts }, null, 1));

await browser.close();
