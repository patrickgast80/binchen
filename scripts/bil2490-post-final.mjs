import { readFileSync } from 'node:fs';
const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const ID = '3bf49614-930d-4fb0-8300-6cae34320351';
const h = { Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };

const body = readFileSync('apps/backend/scripts/bil2490/final-comment.md', 'utf8');

const c = await fetch(`${API}/api/issues/${ID}/comments`, {
  method: 'POST', headers: h, body: JSON.stringify({ body }),
});
console.log('comment:', c.status, (await c.text()).slice(0, 200));

const p = await fetch(`${API}/api/issues/${ID}`, {
  method: 'PATCH', headers: h, body: JSON.stringify({ status: 'done' }),
});
const pt = await p.text();
console.log('patch:', p.status, pt.slice(0, 300));
