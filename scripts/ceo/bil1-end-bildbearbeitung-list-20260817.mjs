// CEO 2026-08-17: Board-Kommentar 2cc9c1f8 auf BIL-1 — alle offenen Tickets
// rund um Bildbearbeitung finden (nur Auflistung, keine Writes).
const KEY = process.env.PAPERCLIP_API_KEY;
const BASE = 'http://localhost:3100';
const COMPANY = '723a0156-47d4-4ec0-9d21-81a1cebeb182';

async function api(method, path) {
  const r = await fetch(BASE + path, {
    method,
    headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}

const OPEN = new Set(['backlog', 'todo', 'in_progress', 'blocked', 'in_review']);
const KEYWORDS = /freistell|freisteller|bildbearbeit|produktfoto|foto|bild|cutout|studio|hintergrund|normalis|segmentier|image/i;

(async () => {
  const all = [];
  let offset = 0;
  for (;;) {
    const r = await api('GET', `/api/companies/${COMPANY}/issues?limit=1000&offset=${offset}`);
    if (r.status !== 200) { console.error('LIST FAIL', r.status, JSON.stringify(r.data).slice(0, 300)); process.exit(1); }
    const items = Array.isArray(r.data) ? r.data : (r.data.issues || r.data.items || r.data.data || []);
    all.push(...items);
    if (items.length < 1000) break;
    offset += 1000;
  }
  console.log('TOTAL', all.length);
  const open = all.filter(i => OPEN.has(i.status));
  console.log('OPEN', open.length);
  for (const i of open) {
    const hit = KEYWORDS.test(i.title || '') ? ' <== KEYWORD' : '';
    console.log(`${i.identifier}\t${i.status}\t${i.assigneeAgentId || '-'}\t${(i.title || '').slice(0, 110)}${hit}`);
  }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
