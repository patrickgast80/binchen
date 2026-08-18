/**
 * BIL-2492 — attach the visual evidence and post the progress comment.
 * Usage: node scripts/frontend/bil2492-post-progress.mjs <comment.md>
 */
import fs from "node:fs";
import path from "node:path";

const API = process.env.PAPERCLIP_API_URL ?? "http://127.0.0.1:3100";
const KEY = process.env.PAPERCLIP_API_KEY;
const ISSUE = "7753e63a-8c55-4b30-a6cd-39a4d00a9110"; // BIL-2492
const SHOTS = path.join(process.cwd(), "apps", "e2e", "reports", "bil2492");

const FILES = process.argv.slice(3);

for (const name of FILES) {
  const file = path.join(SHOTS, name);
  if (!fs.existsSync(file)) {
    console.log(`skip (missing): ${name}`);
    continue;
  }
  const fd = new FormData();
  fd.set("file", new Blob([fs.readFileSync(file)], { type: "image/png" }), name);
  // The un-scoped /api/issues/{id}/attachments path 404s — attachments are only
  // reachable company-scoped, unlike comments.
  const res = await fetch(
    `${API}/api/companies/${process.env.PAPERCLIP_COMPANY_ID}/issues/${ISSUE}/attachments`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}` },
      body: fd,
    },
  );
  console.log(`attach ${name}: ${res.status} ${(await res.text()).slice(0, 160)}`);
}

const body = fs.readFileSync(process.argv[2], "utf8");
const res = await fetch(`${API}/api/issues/${ISSUE}/comments`, {
  method: "POST",
  headers: { "content-type": "application/json", Authorization: `Bearer ${KEY}` },
  body: JSON.stringify({ body }),
});
console.log(`comment: ${res.status} ${(await res.text()).slice(0, 300)}`);
