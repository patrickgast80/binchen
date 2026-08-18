const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const ID = '3bf49614-930d-4fb0-8300-6cae34320351';
const r = await fetch(`${API}/api/issues/${ID}/interactions?limit=100`, { headers: { Authorization: `Bearer ${KEY}` } });
const b = await r.json();
const list = Array.isArray(b) ? b : (b.items ?? b.interactions ?? []);
for (const i of list) console.log(JSON.stringify(i, null, 2));
