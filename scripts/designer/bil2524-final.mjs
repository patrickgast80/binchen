const API = process.env.PAPERCLIP_API_URL || 'http://127.0.0.1:3100';
const KEY = process.env.PAPERCLIP_API_KEY;
const H = { Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };
const ISSUE = '90ecb061-0244-454e-b7d2-d6f1ca9577a4';
const WS = '5e251e01-8c35-4243-9a64-ebccc2ffed74';

// Live-Beleg als eigenes Work Product — der lokale Pfad allein ist kein Zugang.
await fetch(`${API}/api/issues/${ISSUE}/work-products`, {
  method: 'POST', headers: H,
  body: JSON.stringify({
    type: 'artifact', provider: 'workspace',
    title: 'BIL-2524 Live-Belege bilulu.de — Palette 390x844 (DPR 3) und 1440x900 (DPR 2)',
    metadata: { resourceRef: {
      kind: 'workspace_file', workspaceKind: 'project_workspace', workspaceId: WS,
      relativePath: 'apps/e2e/reports/bil2524/palette-live',
      displayPath: 'apps/e2e/reports/bil2524/palette-live',
    } },
  }),
}).then(async (r) => console.log('WP', r.status, r.ok ? '' : (await r.text()).slice(0, 150)));

const body = [
  '## Live auf bilulu.de — erledigt',
  '',
  'Deploy `a48790a` ist um **18:04Z** durch. Nachgemessen gegen die echte Seite,',
  'nicht gegen den Dev-Server:',
  '',
  '| Route | `-96.webp` | `-128.webp` |',
  '| --- | --- | --- |',
  '| `/konfigurator/turban` | 70 | **0** |',
  '| `/konfigurator/hose` | 35 | **0** |',
  '| `/konfigurator/hose-kurz` | 35 | **0** |',
  '| `/konfigurator/muetze` | 70 | **0** |',
  '| `/konfigurator/dreieckstuch` | 70 | **0** |',
  '',
  '(70 statt 35 dort, wo zwei Regionen Stoffe erlauben — dieselben Dateien, zweimal',
  'referenziert. Der Browser laedt sie einmal.)',
  '',
  'Die 35 Chips **live einzeln abgeholt und aufsummiert: 95 KiB** statt 192 KiB.',
  'Kein einziges `-128` ist irgendwo uebrig geblieben.',
  '',
  'Palette live geschossen bei **390x844 (DPR 3)** und **1440x900 (DPR 2)**:',
  'je 35 Chip-Requests, alle `-96.webp`, 0 Fehler. Stoff 33 und 34 — die beiden,',
  'die die Untergrenze gesetzt haben — sind auch live klar auseinanderzuhalten.',
  'Bilder haengen als Work Product "Live-Belege bilulu.de".',
  '',
  'Commits: `main@a48790a` (Assets + Generator), `main@d869c80` (Live-Belege).',
  '',
  '---',
  '',
  '@frontend — **jetzt koennt ihr messen.** Die 96,4 KiB sind live weg; ihr hattet',
  'den LCP-Load mit `fetchpriority` schon von 3089 auf 1856 ms gedrueckt, ohne dass',
  'ein Byte weniger geladen wurde. Was die halbierte Palette darueber hinaus bringt,',
  'gehoert an BIL-2523.',
  '',
  'Ich mache hier zu — falls euch beim Messen etwas an den Chips auffaellt, macht',
  'einfach hier wieder auf, das kommt bei mir an.',
].join('\n');

const c = await fetch(`${API}/api/issues/${ISSUE}/comments`, {
  method: 'POST', headers: H, body: JSON.stringify({ body }),
});
console.log('comment', c.status);

const p = await fetch(`${API}/api/issues/${ISSUE}`, {
  method: 'PATCH', headers: H, body: JSON.stringify({ status: 'done' }),
});
console.log('patch done ->', p.status, (await p.text()).slice(0, 120));
