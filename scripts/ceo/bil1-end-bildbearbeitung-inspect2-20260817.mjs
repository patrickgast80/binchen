// CEO 2026-08-17: BIL-1 komplett dumpen (Blocker-Felder finden) + BIL-2490 UUID suchen.
const KEY = process.env.PAPERCLIP_API_KEY;
const BASE = 'http://localhost:3100';
const COMPANY = '723a0156-47d4-4ec0-9d21-81a1cebeb182';
const BIL1 = '6ed67fea-3d4f-444a-b770-bfda823387b6';

async function api(path) {
  const r = await fetch(BASE + path, {
    headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}

(async () => {
  const bil1 = await api(`/api/issues/${BIL1}`);
  console.log('BIL-1 keys:', Object.keys(bil1.data || {}).join(', '));
  const d = bil1.data || {};
  for (const k of Object.keys(d)) {
    if (/block|relation|depend|link/i.test(k)) {
      console.log(`BIL-1.${k} =`, JSON.stringify(d[k]).slice(0, 500));
    }
  }
  for (let off = 0; off < 3000; off += 1000) {
    const l = await api(`/api/companies/${COMPANY}/issues?limit=1000&offset=${off}`);
    const items = Array.isArray(l.data) ? l.data : (l.data.issues || l.data.items || l.data.data || []);
    for (const ident of ['BIL-2490', 'BIL-2491']) {
      const f = items.find(i => i.identifier === ident);
      if (f) console.log(`${ident} uuid=${f.id} status=${f.status}`);
    }
  }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
