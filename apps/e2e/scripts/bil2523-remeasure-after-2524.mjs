// Frontend 2026-08-19: BIL-2523 — Nachmessung, nachdem BIL-2524 (96px-Chips)
// live ist. Gleiche Lighthouse-Version (12.8.2) und gleiche Flags wie die
// Baseline-Laeufe aus `apps/e2e/reports/bil2523/*.json`, sonst sind die Zahlen
// nicht vergleichbar (13.x gewichtet anders).
//
// Zwei Kontrollen laufen mit:
//   * `jitter`  — `hose` zweimal, damit die Streuung der Messung sichtbar ist
//                 und nicht als Effekt verkauft wird.
//   * `no-chips`— `turban` mit blockierten Chip-Requests. Das ist die Untergrenze,
//                 die die Palette ueberhaupt noch hergeben koennte.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../reports/bil2523/post-2524');
const LH = 'C:/Users/Besitzer/AppData/Local/npm-cache/_npx/6ee2f8988123e994/node_modules/lighthouse/cli/index.js';

const RUNS = [
  { name: 'turban-uni', url: 'https://bilulu.de/konfigurator/turban?turban=sage&schleife=cream' },
  { name: 'turban-stoff', url: 'https://bilulu.de/konfigurator/turban?turban=stoff-15&schleife=sage' },
  { name: 'hose-stoff', url: 'https://bilulu.de/konfigurator/hose?hose=stoff-15&bund=sage' },
  { name: 'hose-stoff-jitter', url: 'https://bilulu.de/konfigurator/hose?hose=stoff-15&bund=sage' },
  { name: 'dreieckstuch-stoff', url: 'https://bilulu.de/konfigurator/dreieckstuch?tuch=stoff-15&knoten=sage' },
  { name: 'muetze-stoff', url: 'https://bilulu.de/konfigurator/muetze?muetze=stoff-15&bund=sage' },
  { name: 'hose-kurz-stoff', url: 'https://bilulu.de/konfigurator/hose-kurz?hose=stoff-15&bund=sage' },
  {
    name: 'turban-stoff-ohne-chips',
    url: 'https://bilulu.de/konfigurator/turban?turban=stoff-15&schleife=sage',
    extra: ['--blocked-url-patterns=*/stoffe/stoff-*-96.webp'],
  },
];

mkdirSync(OUT, { recursive: true });

// Ein bereits geschriebener Report wird nicht neu gemessen — fuer einen frischen
// Durchlauf das Verzeichnis `reports/bil2523/post-2524` loeschen.
function existing(outPath) {
  try {
    const j = JSON.parse(readFileSync(outPath, 'utf8'));
    return j.categories?.performance?.score != null ? outPath : null;
  } catch {
    return null;
  }
}

function run(r) {
  const outPath = resolve(OUT, `${r.name}.json`);
  const done = existing(outPath);
  if (done) return Promise.resolve(done);
  const args = [
    LH, r.url,
    '--preset=perf',
    '--form-factor=mobile',
    '--screenEmulation.mobile',
    '--output=json',
    `--output-path=${outPath}`,
    '--chrome-flags=--headless=new --no-sandbox',
    '--quiet',
    ...(r.extra ?? []),
  ];
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('exit', (code) => {
      // chrome-launcher raeumt sein Temp-Verzeichnis auf Windows nicht immer weg
      // (EPERM in destroyTmp) und beendet sich dann mit 1, obwohl der Lauf durch
      // ist. Der Report selbst ist der Beleg: parst er, gilt der Lauf.
      try {
        const report = JSON.parse(readFileSync(outPath, 'utf8'));
        if (report.categories?.performance?.score != null) return res(outPath);
      } catch { /* faellt unten durch */ }
      rej(new Error(`${r.name} exit ${code}, kein verwertbarer Report`));
    });
  });
}

const rows = [];
for (const r of RUNS) {
  process.stderr.write(`\n=== ${r.name} ===\n`);
  const p = await run(r);
  const j = JSON.parse(readFileSync(p, 'utf8'));
  const a = j.audits;
  const chips = (a['network-requests']?.details?.items ?? []).filter((i) => /\/stoffe\/stoff-\d+-\d+\.webp/.test(i.url));
  rows.push({
    name: r.name,
    perf: Math.round(j.categories.performance.score * 100),
    lcp: Math.round(a['largest-contentful-paint'].numericValue),
    tbt: Math.round(a['total-blocking-time'].numericValue),
    cls: +a['cumulative-layout-shift'].numericValue.toFixed(3),
    fcp: Math.round(a['first-contentful-paint'].numericValue),
    transferKiB: Math.round((a['total-byte-weight']?.numericValue ?? 0) / 1024),
    chipCount: chips.length,
    chipKiB: +(chips.reduce((s, i) => s + (i.transferSize ?? 0), 0) / 1024).toFixed(1),
    lcpElement: (a['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node?.snippet ?? '').slice(0, 90),
    lhVersion: j.lighthouseVersion,
  });
  console.log(JSON.stringify(rows.at(-1)));
}

console.log('\n| Route | Perf | LCP | TBT | CLS | Transfer | Chips |');
console.log('| --- | --- | --- | --- | --- | --- | --- |');
for (const r of rows) {
  console.log(`| ${r.name} | ${r.perf} | ${(r.lcp / 1000).toFixed(1)} s | ${r.tbt} ms | ${r.cls} | ${r.transferKiB} KiB | ${r.chipCount}x / ${r.chipKiB} KiB |`);
}
