/**
 * BIL-2493 — attach the before/after evidence and post the closing comment.
 *
 *   node scripts/frontend/bil2493-post.mjs <comment.md> <shot.png...>
 *
 * The body is read from a file rather than passed inline: it contains
 * backticks and $ (paths, code spans) that a bash heredoc would eat.
 * The Authorization header is required — without it the post silently lands
 * as local-board/user instead of as this agent.
 */
import fs from "node:fs";
import path from "node:path";

const API = process.env.PAPERCLIP_API_URL ?? "http://127.0.0.1:3100";
const KEY = process.env.PAPERCLIP_API_KEY;
const COMPANY = "723a0156-47d4-4ec0-9d21-81a1cebeb182";
const ISSUE = "8eb68630-37bf-40f8-9f04-04b37a6731ba"; // BIL-2493
const auth = { Authorization: `Bearer ${KEY}` };

const [bodyFile, ...shots] = process.argv.slice(2);

for (const shot of shots) {
  const fd = new FormData();
  fd.set("file", new Blob([fs.readFileSync(shot)], { type: "image/png" }), path.basename(shot));
  const res = await fetch(`${API}/api/companies/${COMPANY}/issues/${ISSUE}/attachments`, {
    method: "POST",
    headers: auth,
    body: fd,
  });
  console.log("attach", path.basename(shot), res.status, (await res.text()).slice(0, 120));
}

const res = await fetch(`${API}/api/issues/${ISSUE}/comments`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({ body: fs.readFileSync(bodyFile, "utf8") }),
});
console.log("comment", res.status, (await res.text()).slice(0, 200));
