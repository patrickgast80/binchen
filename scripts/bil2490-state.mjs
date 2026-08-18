const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const ID = '3bf49614-930d-4fb0-8300-6cae34320351';
const h = { Authorization: `Bearer ${KEY}` };

const j = async (p) => {
  const r = await fetch(`${API}${p}`, { headers: h });
  const t = await r.text();
  try { return { ok: r.ok, status: r.status, body: JSON.parse(t) }; }
  catch { return { ok: r.ok, status: r.status, body: t }; }
};

const iss = await j(`/api/issues/${ID}`);
console.log('ISSUE', iss.body.status, 'blockedBy=', JSON.stringify(iss.body.blockedByIssueIds ?? iss.body.blockedBy));

const cm = await j(`/api/issues/${ID}/comments?limit=1000`);
const list = Array.isArray(cm.body) ? cm.body : (cm.body.items ?? cm.body.comments ?? []);
console.log('\n=== COMMENTS', list.length, '===');
for (const c of list) {
  console.log(`\n--- ${c.id} | ${c.createdAt} | ${c.authorType}/${c.authorAgentId ?? c.authorUserId}`);
  console.log((c.body ?? '').slice(0, 1600));
}

const it = await j(`/api/issues/${ID}/interactions?limit=100`);
const ilist = Array.isArray(it.body) ? it.body : (it.body.items ?? it.body.interactions ?? []);
console.log('\n=== INTERACTIONS', ilist.length, '===');
for (const i of ilist) {
  console.log(`\n--- ${i.id} | ${i.kind} | status=${i.status} | ${i.createdAt}`);
  console.log('payload:', JSON.stringify(i.payload).slice(0, 800));
  console.log('response:', JSON.stringify(i.response ?? i.responsePayload ?? i.result).slice(0, 800));
}
