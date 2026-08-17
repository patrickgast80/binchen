// CEO 2026-08-17: Detail-Check BIL-1 / BIL-2486 / BIL-2490 / BIL-2451 (read-only).
const KEY = process.env.PAPERCLIP_API_KEY;
const BASE = 'http://localhost:3100';

const IDS = {
  'BIL-1': '6ed67fea-3d4f-444a-b770-bfda823387b6',
  'BIL-2486': 'cd3dae0c-f708-4476-8c5a-affa697996ff',
};

async function api(path) {
  const r = await fetch(BASE + path, {
    headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}

const COMPANY = '723a0156-47d4-4ec0-9d21-81a1cebeb182';

(async () => {
  // UUIDs für 2490/2451 über die Liste holen
  const list = await api(`/api/companies/${COMPANY}/issues?limit=1000&offset=2000`);
  const items = Array.isArray(list.data) ? list.data : (list.data.issues || list.data.items || list.data.data || []);
  for (const ident of ['BIL-2490', 'BIL-2451', 'BIL-2491']) {
    const found = items.find(i => i.identifier === ident);
    if (found) IDS[ident] = found.id;
  }
  if (!IDS['BIL-2451']) {
    for (let off = 0; off < 2000; off += 1000) {
      const l2 = await api(`/api/companies/${COMPANY}/issues?limit=1000&offset=${off}`);
      const it2 = Array.isArray(l2.data) ? l2.data : (l2.data.issues || l2.data.items || l2.data.data || []);
      const f = it2.find(i => i.identifier === 'BIL-2451');
      if (f) { IDS['BIL-2451'] = f.id; break; }
    }
  }
  for (const [ident, id] of Object.entries(IDS)) {
    const r = await api(`/api/issues/${id}`);
    const d = r.data || {};
    console.log(`== ${ident} (${id}) status=${r.status}`);
    console.log(JSON.stringify({
      status: d.status,
      assigneeAgentId: d.assigneeAgentId,
      blockedByIssueIds: d.blockedByIssueIds,
      executionRunId: d.executionRunId,
      parentId: d.parentId,
      title: (d.title || '').slice(0, 100),
    }, null, 1));
  }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
