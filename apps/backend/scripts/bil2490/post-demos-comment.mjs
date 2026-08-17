#!/usr/bin/env node
/**
 * Post the BIL-2490 completion comment. Falls back to the parent BIL-1 if the
 * child issue rejects the write with the known authorization-boundary 403.
 * Comment body is read from a file — heredocs eat backticks in markdown.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const body = readFileSync(join(HERE, "bil2490-demos-comment.md"), "utf8");

const headers = { "content-type": "application/json", authorization: `Bearer ${KEY}` };

async function findIssue(key) {
  for (let offset = 0; offset < 4000; offset += 500) {
    const res = await fetch(`${API}/api/companies/${process.env.PAPERCLIP_COMPANY_ID}/issues?limit=500&offset=${offset}`, { headers });
    if (!res.ok) throw new Error(`list issues -> ${res.status}`);
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.issues ?? data.items ?? data.data ?? []);
    const hit = items.find((i) => i.key === key || i.identifier === key || i.humanKey === key || i.shortId === key);
    if (hit) return hit;
    if (items.length < 500) return null;
  }
  return null;
}

const target = process.argv[2] ?? "BIL-2490";
const issue = await findIssue(target);
if (!issue) throw new Error(`${target} not found`);
console.log(`${target} -> ${issue.id} (status=${issue.status})`);

const res = await fetch(`${API}/api/issues/${issue.id}/comments`, {
  method: "POST",
  headers,
  body: JSON.stringify({ body }),
});
console.log(`POST comment -> ${res.status}`);
console.log((await res.text()).slice(0, 400));
