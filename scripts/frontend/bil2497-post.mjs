/**
 * BIL-2497 — Belege anhaengen und Kommentar posten.
 *
 * Usage: node scripts/frontend/bil2497-post.mjs <comment.md> [<bild.png> ...]
 * Bildpfade relativ zu apps/e2e/reports/bil2497.
 */
import fs from "node:fs";
import path from "node:path";

const API = process.env.PAPERCLIP_API_URL ?? "http://127.0.0.1:3100";
const KEY = process.env.PAPERCLIP_API_KEY;
const COMPANY = process.env.PAPERCLIP_COMPANY_ID;
const ISSUE = "855e2df9-0f71-41ff-9e7a-af911a37bc42"; // BIL-2497
const SHOTS = path.join(process.cwd(), "apps", "e2e", "reports", "bil2497");

for (const name of process.argv.slice(3)) {
  const file = path.join(SHOTS, name);
  if (!fs.existsSync(file)) {
    console.log(`skip (missing): ${name}`);
    continue;
  }
  const fd = new FormData();
  fd.set("file", new Blob([fs.readFileSync(file)], { type: "image/png" }), path.basename(name));
  // Attachments gibt es nur company-scoped, Kommentare nur un-scoped (BIL-2492).
  const res = await fetch(`${API}/api/companies/${COMPANY}/issues/${ISSUE}/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}` },
    body: fd,
  });
  console.log(`attach ${name}: ${res.status} ${(await res.text()).slice(0, 120)}`);
}

const body = fs.readFileSync(process.argv[2], "utf8");
const res = await fetch(`${API}/api/issues/${ISSUE}/comments`, {
  method: "POST",
  headers: { "content-type": "application/json", Authorization: `Bearer ${KEY}` },
  body: JSON.stringify({ body }),
});
console.log(`comment: ${res.status} ${(await res.text()).slice(0, 200)}`);
