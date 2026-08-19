// Frontend 2026-08-19: BIL-2526 — A/B lokal, BEIDE Varianten im selben Lauf.
//
// `base` = Build mit `BILULU_INLINE_CSS=0` (verlinktes Stylesheet, exakt der
// Zustand, der gerade live ist — gleicher CSS-Hash 844c00a5ed1edcb0.css).
// `inline` = Build mit Inline-<style> im <head>.
//
// Beide laufen auf demselben Rechner, gegen dieselbe Loopback-Strecke, mit
// derselben Lighthouse-Drosselung (devtools: 150 ms RTT, 1474 Kbps, CPU 4x).
// Die absoluten Zahlen sind nicht die von bilulu.de — Loopback hat kein echtes
// RTT und keine echte Server-Zeit. Was hier zaehlt, ist die DIFFERENZ zwischen
// zwei Builds unter identischen Bedingungen; die Live-Bestaetigung kommt nach
// dem Deploy.
//
// Reihenfolge alterniert (base, inline, base, inline, ...) statt blockweise,
// damit ein Drift der Maschine nicht komplett auf eine Variante faellt.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../reports/bil2526/ab-lokal');
const ROOT = resolve(HERE, '../../..');
const SF = resolve(ROOT, 'apps/storefront');
const NEXT_BIN = resolve(
  ROOT,
  'node_modules/.pnpm/next@14.2.35_@opentelemetry+api@1.9.1_@playwright+test@1.60.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/next/dist/bin/next'
);
const LH = 'C:/Users/Besitzer/AppData/Local/npm-cache/_npx/6ee2f8988123e994/node_modules/lighthouse/cli/index.js';

const VARIANTS = [
  { key: 'base', dist: '.next-2526-base', port: 3141 },
  { key: 'inline', dist: '.next-2526', port: 3142 },
];

// `hose` ist die Kontrolle aus BIL-2523: startet in einer Uni-Zone, laedt genau
// einen Chip statt 35. Startseite und Katalog kommen mit, weil die Aenderung
// seitenweit ist und der Auftrag ausdruecklich mehr als den Konfigurator sehen
// will.
const PAGES = [
  { name: 'turban', path: '/konfigurator/turban?turban=sage&schleife=cream' },
  { name: 'hose', path: '/konfigurator/hose?hose=stoff-15&bund=sage' },
  { name: 'home', path: '/' },
  { name: 'catalog', path: '/catalog' },
];

mkdirSync(OUT, { recursive: true });

function startServer(v) {
  const p = spawn(process.execPath, [NEXT_BIN, 'start', '-p', String(v.port)], {
    cwd: SF,
    env: { ...process.env, NEXT_DIST_DIR: v.dist, PORT: String(v.port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`${v.key}: Server kam nicht hoch`)), 60_000);
    const onData = (b) => {
      if (/Ready in/.test(String(b))) {
        clearTimeout(t);
        res(p);
      }
    };
    p.stdout.on('data', onData);
    p.stderr.on('data', onData);
  });
}

function lighthouse(url, outPath) {
  const args = [
    LH, url,
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
      // chrome-launcher stirbt auf Windows mit EPERM in destroyTmp, obwohl der
      // Lauf durch ist — der parsende Report ist der Beleg, nicht der Exit-Code.
      try {
        const j = JSON.parse(readFileSync(outPath, 'utf8'));
        if (j.categories?.performance?.score != null) return res(j);
        if (j.runtimeError) return rej(new Error(`${outPath}: ${j.runtimeError.code}`));
      } catch { /* faellt durch */ }
      rej(new Error(`lighthouse exit ${code} ohne verwertbaren Report: ${outPath}`));
    });
  });
}

function row(name, variant, j) {
  const a = j.audits;
  const items = a['network-requests'].details.items;
  const doc = items.find((i) => i.resourceType === 'Document');
  const css = items.find((i) => /_next\/static\/css\//.test(i.url));
  return {
    page: name,
    variant,
    perf: Math.round(j.categories.performance.score * 100),
    fcp: Math.round(a['first-contentful-paint'].numericValue),
    lcp: Math.round(a['largest-contentful-paint'].numericValue),
    tbt: Math.round(a['total-blocking-time'].numericValue),
    cls: +a['cumulative-layout-shift'].numericValue.toFixed(3),
    docKiB: +((doc?.transferSize ?? 0) / 1024).toFixed(1),
    docEnd: Math.round(doc?.networkEndTime ?? 0),
    cssReq: css ? `${Math.round(css.networkRequestTime)}->${Math.round(css.networkEndTime)}` : 'inline',
  };
}

const servers = [];
const rows = [];
try {
  for (const v of VARIANTS) servers.push(await startServer(v));
  for (const page of PAGES) {
    for (const v of VARIANTS) {
      const out = resolve(OUT, `${page.name}-${v.key}.json`);
      process.stderr.write(`\n=== ${page.name} / ${v.key} ===\n`);
      const j = await lighthouse(`http://127.0.0.1:${v.port}${page.path}`, out);
      rows.push(row(page.name, v.key, j));
      console.log(JSON.stringify(rows.at(-1)));
    }
  }
} finally {
  for (const s of servers) s.kill();
}

console.log('\n| Seite | Variante | Perf | FCP | LCP | TBT | CLS | Dokument | CSS-Request |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of rows) {
  console.log(
    `| ${r.page} | ${r.variant} | ${r.perf} | ${r.fcp} ms | ${r.lcp} ms | ${r.tbt} ms | ${r.cls} | ${r.docKiB} KiB | ${r.cssReq} |`
  );
}
console.log('\n| Seite | dFCP | dLCP | dDokument |');
console.log('| --- | --- | --- | --- |');
for (const page of PAGES) {
  const b = rows.find((r) => r.page === page.name && r.variant === 'base');
  const i = rows.find((r) => r.page === page.name && r.variant === 'inline');
  if (!b || !i) continue;
  const s = (n) => (n > 0 ? `+${n}` : `${n}`);
  console.log(`| ${page.name} | ${s(i.fcp - b.fcp)} ms | ${s(i.lcp - b.lcp)} ms | ${s(+(i.docKiB - b.docKiB).toFixed(1))} KiB |`);
}
