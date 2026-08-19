// BIL-2526 — Live-Nachmessung nach dem Deploy.
//
// Zwei Dinge muessen zusammen stimmen, sonst misst man den Tag statt die
// Aenderung:
//   * `turban` und `hose` (Kontrolle aus BIL-2523: startet in einer Uni-Zone,
//     laedt genau EINEN Chip statt 35) — beide im selben Lauf,
//   * Startseite, Katalog und Checkout, weil die Aenderung seitenweit ist.
//
// Verglichen wird gegen die Baseline aus `reports/bil2523/post-2524` (gleiche
// Lighthouse-Version 12.8.2, gleiche Flags) und, wo vorhanden, gegen
// `reports/bil2526/attribution/turban-control.json`.
//
// Vorbedingung: der Deploy ist durch. Das Skript prueft das selbst — ein Lauf
// gegen den alten Build waere ein stiller Fehlschluss.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../reports/bil2526/live');
const LH = 'C:/Users/Besitzer/AppData/Local/npm-cache/_npx/6ee2f8988123e994/node_modules/lighthouse/cli/index.js';

const RUNS = [
  { name: 'turban', url: 'https://bilulu.de/konfigurator/turban?turban=sage&schleife=cream' },
  { name: 'hose', url: 'https://bilulu.de/konfigurator/hose?hose=stoff-15&bund=sage' },
  { name: 'home', url: 'https://bilulu.de/' },
  { name: 'catalog', url: 'https://bilulu.de/catalog' },
  { name: 'checkout', url: 'https://bilulu.de/checkout' },
  // Jitter-Kontrolle: dieselbe URL zweimal. Wer die Streuung nicht kennt,
  // verkauft sie als Effekt.
  { name: 'hose-jitter', url: 'https://bilulu.de/konfigurator/hose?hose=stoff-15&bund=sage' },
];

// Deploy-Gate: solange die Startseite noch ein <link rel="stylesheet"> traegt,
// laeuft der alte Build.
const html = await (await fetch('https://bilulu.de/')).text();
const links = (html.match(/rel="stylesheet"/g) ?? []).length;
const styles = (html.match(/<style/g) ?? []).length;
if (links > 0 || styles === 0) {
  throw new Error(`Deploy noch nicht durch: stylesheet-links=${links}, style-tags=${styles}. Nicht messen.`);
}
process.stderr.write(`Deploy-Gate ok: stylesheet-links=${links}, style-tags=${styles}\n`);

mkdirSync(OUT, { recursive: true });

function run(r) {
  const outPath = resolve(OUT, `${r.name}.json`);
  const args = [
    LH, r.url,
    '--preset=perf',
    '--form-factor=mobile',
    '--screenEmulation.mobile',
    '--output=json',
    `--output-path=${outPath}`,
    '--chrome-flags=--headless=new --no-sandbox',
    '--quiet',
  ];
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'ignore'] });
    p.on('exit', (code) => {
      try {
        const j = JSON.parse(readFileSync(outPath, 'utf8'));
        if (j.categories?.performance?.score != null) return res(j);
      } catch { /* faellt durch */ }
      rej(new Error(`${r.name} exit ${code}, kein verwertbarer Report`));
    });
  });
}

function metrics(j) {
  const a = j.audits;
  const items = a['network-requests'].details.items;
  const css = items.find((i) => /_next\/static\/css\//.test(i.url));
  return {
    perf: Math.round(j.categories.performance.score * 100),
    fcp: Math.round(a['first-contentful-paint'].numericValue),
    lcp: Math.round(a['largest-contentful-paint'].numericValue),
    si: Math.round(a['speed-index'].numericValue),
    tbt: Math.round(a['total-blocking-time'].numericValue),
    cls: +a['cumulative-layout-shift'].numericValue.toFixed(3),
    srt: Math.round(a['server-response-time']?.numericValue ?? 0),
    cssReq: css ? `${Math.round(css.networkRequestTime)}->${Math.round(css.networkEndTime)}` : 'inline',
  };
}

// Baseline aus BIL-2523 (post-2524), soweit dieselbe URL dort gemessen wurde.
const BASE = resolve(HERE, '../reports/bil2523/post-2524');
function baseline(file) {
  try {
    return metrics(JSON.parse(readFileSync(resolve(BASE, file), 'utf8')));
  } catch {
    return null;
  }
}
const BEFORE = {
  turban: baseline('turban-uni.json'),
  hose: baseline('hose-stoff.json'),
  'hose-jitter': baseline('hose-stoff-jitter.json'),
};

const rows = [];
for (const r of RUNS) {
  process.stderr.write(`\n=== ${r.name} ===\n`);
  const m = metrics(await run(r));
  rows.push({ name: r.name, ...m });
  console.log(JSON.stringify(rows.at(-1)));
}

console.log('\n| Route | Perf | FCP | LCP | SpeedIndex | TBT | CLS | server-response | CSS |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of rows) {
  console.log(
    `| ${r.name} | ${r.perf} | ${r.fcp} ms | ${r.lcp} ms | ${r.si} ms | ${r.tbt} ms | ${r.cls} | ${r.srt} ms | ${r.cssReq} |`
  );
}

console.log('\nGegen BIL-2523/post-2524 (gleiche LH-Version, gleiche Flags):');
console.log('| Route | FCP vorher -> jetzt | LCP vorher -> jetzt | Perf vorher -> jetzt |');
console.log('| --- | --- | --- | --- |');
for (const r of rows) {
  const b = BEFORE[r.name];
  if (!b) continue;
  const d = (x, y) => `${x} -> ${y} (${y - x > 0 ? '+' : ''}${y - x})`;
  console.log(`| ${r.name} | ${d(b.fcp, r.fcp)} | ${d(b.lcp, r.lcp)} | ${d(b.perf, r.perf)} |`);
}
