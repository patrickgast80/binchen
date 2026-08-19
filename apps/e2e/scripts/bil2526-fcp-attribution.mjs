// Frontend 2026-08-19: BIL-2526 — Attribution, BEVOR irgendwas umgebaut wird.
//
// Die Ticket-These lautet "7 KiB CSS kosten 907 ms, das sind Roundtrip-Kosten,
// keine Bytes". Bevor ich darauf ein seitenweites `optimizeCss` baue, will ich
// wissen, WER die 907 ms wirklich haelt. Zwei Fakten aus den BIL-2523-Reports
// machen die These angreifbar:
//
//   * throttlingMethod ist `devtools` (angewandt), nicht `simulate`. Die
//     Wasserfall-Zeiten sind also echt gedrosselt gemessen, nicht modelliert.
//     Drosselung: 150 ms RTT, 1474 Kbps down (~184 KiB/s), CPU 4x.
//   * Zwischen 740 und 1700 ms sind **209 KiB** gleichzeitig in der Leitung
//     (base.webp 56 KiB + ~15 JS-Chunks ~145 KiB + CSS 7 KiB). 209 KiB bei
//     184 KiB/s sind ~1130 ms. Die 907 ms der CSS-Antwort passen exakt auf
//     Bandbreiten-Konkurrenz, nicht auf einen Roundtrip (der waere ~190 ms).
//
// Deshalb messe ich drei Varianten gegen dieselbe Route, im selben Lauf:
//
//   control    — nichts blockiert (Tageswert, gegen den alles andere zaehlt)
//   no-js      — alle `/_next/static/chunks/*` blockiert. Die Seite ist SSR-
//                gerendert, malt also trotzdem. Das ist die Obergrenze dessen,
//                was "JS von der FCP-Strecke nehmen" ueberhaupt bringen kann.
//   no-lcp-img — base.webp blockiert. Isoliert den Anteil des 56-KiB-Bildes,
//                das in BIL-2523 bewusst auf fetchpriority=high gesetzt wurde.
//   no-css     — CSS blockiert. Kein Fix-Kandidat (die Seite ist unstyled),
//                aber die einzige Messung, die die Roundtrip-These direkt
//                pruefen kann: faellt FCP hier NICHT deutlich, ist das CSS
//                nicht der Halter.
//
// `hose` laeuft als unveraenderte Kontrolle mit — sonst misst man den Tag.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../reports/bil2526/attribution');
const LH = 'C:/Users/Besitzer/AppData/Local/npm-cache/_npx/6ee2f8988123e994/node_modules/lighthouse/cli/index.js';

const TURBAN = 'https://bilulu.de/konfigurator/turban?turban=sage&schleife=cream';
const HOSE = 'https://bilulu.de/konfigurator/hose?hose=stoff-15&bund=sage';

const RUNS = [
  { name: 'turban-control', url: TURBAN },
  { name: 'turban-no-js', url: TURBAN, extra: ['--blocked-url-patterns=*/_next/static/chunks/*'] },
  { name: 'turban-no-lcp-img', url: TURBAN, extra: ['--blocked-url-patterns=*/turban-foto/*'] },
  { name: 'turban-no-css', url: TURBAN, extra: ['--blocked-url-patterns=*/_next/static/css/*'] },
  { name: 'hose-control', url: HOSE },
];

mkdirSync(OUT, { recursive: true });

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
  if (existing(outPath)) return Promise.resolve(outPath);
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
      // chrome-launcher stirbt auf Windows regelmaessig mit EPERM in destroyTmp,
      // obwohl der Lauf durch ist. Der parsende Report ist der Beleg.
      try {
        const j = JSON.parse(readFileSync(outPath, 'utf8'));
        if (j.categories?.performance?.score != null) return res(outPath);
      } catch { /* faellt durch */ }
      rej(new Error(`${r.name} exit ${code}, kein verwertbarer Report`));
    });
  });
}

const rows = [];
for (const r of RUNS) {
  process.stderr.write(`\n=== ${r.name} ===\n`);
  const j = JSON.parse(readFileSync(await run(r), 'utf8'));
  const a = j.audits;
  const items = a['network-requests'].details.items;
  const css = items.find((i) => /_next\/static\/css\//.test(i.url));
  const fcp = a['first-contentful-paint'].numericValue;
  // Alles, was zwischen Dokument-Ende und FCP gleichzeitig Bandbreite zieht.
  const doc = items.find((i) => i.resourceType === 'Document');
  const inflight = items.filter(
    (i) => i.networkRequestTime < fcp && i.networkEndTime > (doc?.networkEndTime ?? 0) && i.transferSize
  );
  rows.push({
    name: r.name,
    throttling: j.configSettings.throttlingMethod,
    perf: Math.round(j.categories.performance.score * 100),
    fcp: Math.round(fcp),
    lcp: Math.round(a['largest-contentful-paint'].numericValue),
    tbt: Math.round(a['total-blocking-time'].numericValue),
    cls: +a['cumulative-layout-shift'].numericValue.toFixed(3),
    docEnd: Math.round(doc?.networkEndTime ?? 0),
    ttfb: Math.round(a['metrics'].details.items[0].timeToFirstByte),
    srt: Math.round(a['server-response-time']?.numericValue ?? 0),
    cssStart: css ? Math.round(css.networkRequestTime) : null,
    cssEnd: css ? Math.round(css.networkEndTime) : null,
    cssMs: css ? Math.round(css.networkEndTime - css.networkRequestTime) : null,
    inflightReqs: inflight.length,
    inflightKiB: Math.round(inflight.reduce((s, i) => s + i.transferSize, 0) / 1024),
  });
  console.log(JSON.stringify(rows.at(-1)));
}

console.log(`\n| Lauf | Perf | FCP | LCP | TBT | Dok-Ende | CSS start->ende (Dauer) | parallel bis FCP |`);
console.log(`| --- | --- | --- | --- | --- | --- | --- | --- |`);
for (const r of rows) {
  const cssCell = r.cssStart == null ? 'blockiert' : `${r.cssStart} -> ${r.cssEnd} (${r.cssMs} ms)`;
  console.log(
    `| ${r.name} | ${r.perf} | ${r.fcp} ms | ${r.lcp} ms | ${r.tbt} ms | ${r.docEnd} ms | ${cssCell} | ${r.inflightReqs}x / ${r.inflightKiB} KiB |`
  );
}
