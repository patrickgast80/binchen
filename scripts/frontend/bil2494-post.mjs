/**
 * BIL-2494 — attach the live screenshots and post the closing comment.
 *   node scripts/frontend/bil2494-post.mjs <comment.md> <shot.png...>
 */
import fs from "node:fs";
import path from "node:path";

const API = process.env.PAPERCLIP_API_URL ?? "http://127.0.0.1:3100";
const KEY = process.env.PAPERCLIP_API_KEY;
const ISSUE = "1ca55fa0-fa42-4707-bd91-8d5a1f969874"; // BIL-2494
const auth = { Authorization: `Bearer ${KEY}` };

const [bodyFile, ...shots] = process.argv.slice(2);

for (const shot of shots) {
  const fd = new FormData();
  fd.set("file", new Blob([fs.readFileSync(shot)], { type: "image/png" }), path.basename(shot));
  const res = await fetch(`${API}/api/issues/${ISSUE}/attachments`, {
    method: "POST",
    headers: auth,
    body: fd,
  });
  console.log("attach", path.basename(shot), res.status, (await res.text()).slice(0, 160));
}

const res = await fetch(`${API}/api/issues/${ISSUE}/comments`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({ body: fs.readFileSync(bodyFile, "utf8") }),
});
console.log("comment", res.status, (await res.text()).slice(0, 200));
