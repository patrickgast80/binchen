// Designer 2026-08-19: BIL-2524 — Belege als Work Products, damit sie nicht nur
// als lokale Pfade in einem Kommentar stehen.
const API = process.env.PAPERCLIP_API_URL || 'http://127.0.0.1:3100';
const KEY = process.env.PAPERCLIP_API_KEY;
const H = { Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };
const ISSUE = '90ecb061-0244-454e-b7d2-d6f1ca9577a4'; // BIL-2524
const WS = '5e251e01-8c35-4243-9a64-ebccc2ffed74';

const ref = (p) => ({
  resourceRef: { kind: 'workspace_file', workspaceKind: 'project_workspace', workspaceId: WS, relativePath: p, displayPath: p },
});

const items = [
  {
    type: 'artifact', provider: 'workspace', isPrimary: true,
    title: 'BIL-2524 Kontaktboegen — alle 35 Stoffe in 128/96/80/64 px auf Malgroesse',
    metadata: ref('apps/e2e/reports/bil2524'),
  },
  {
    type: 'artifact', provider: 'workspace',
    title: 'BIL-2524 Gerenderte Palette 390x844 (DPR 3) und 1440x900 (DPR 2)',
    metadata: ref('apps/e2e/reports/bil2524/palette'),
  },
  {
    type: 'commit', provider: 'github',
    title: 'BIL-2524: Stoff-Chips der Palette auf 96px @ q70 (main@a48790a)',
    externalId: 'a48790a',
    url: 'https://github.com/patrickgast80/binchen/commit/a48790a',
  },
];

for (const body of items) {
  const r = await fetch(`${API}/api/issues/${ISSUE}/work-products`, {
    method: 'POST', headers: H, body: JSON.stringify(body),
  });
  const t = await r.text();
  console.log(r.status, body.title.slice(0, 55), r.ok ? '' : t.slice(0, 200));
}
