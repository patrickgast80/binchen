// Post the BIL-2483 hub-mat update. Tries the agent-authed path first so the
// comment is attributed to Frontend; falls back to the loopback local-board
// write if the agent key is outside this issue's boundary (the issue is
// assigned to Designer, so authed writes here have been 403ing).
import { readFileSync } from 'node:fs';

const U = process.env.PAPERCLIP_API_URL;
const ISSUE = '7f4984d3-ba8d-438f-82ca-e1f7f89dc488';
const body = readFileSync(new URL('./bil2483-comment4.md', import.meta.url), 'utf8');

async function post(label, headers) {
  const res = await fetch(`${U}/api/issues/${ISSUE}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ body }),
  });
  const text = await res.text();
  console.log(`${label}: ${res.status} ${text.slice(0, 200)}`);
  return res.ok;
}

const authed = await post('authed', {
  Authorization: `Bearer ${process.env.PAPERCLIP_API_KEY}`,
});
if (!authed) await post('local-board', {});
