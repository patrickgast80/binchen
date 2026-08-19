// BIL-2527 — Kommentar posten. Datei-Argument, damit der Markdown-Text nicht
// durch eine Shell muss (Backticks in bash-Heredocs fressen den Inhalt).
//   node bil2527-post.mjs <markdown-datei>
import { readFileSync } from "node:fs";

const API = process.env.PAPERCLIP_API_URL || "http://localhost:3100";
const KEY = process.env.PAPERCLIP_API_KEY;
const AUTH = { Authorization: `Bearer ${KEY}`, "content-type": "application/json" };

const file = process.argv[2];
if (!file) throw new Error("Markdown-Datei fehlt");
const body = readFileSync(file, "utf8");

const issueRes = await fetch(`${API}/api/issues/BIL-2527`, { headers: AUTH });
if (!issueRes.ok) throw new Error(`BIL-2527 nicht lesbar: ${issueRes.status}`);
const issue = await issueRes.json();

const res = await fetch(`${API}/api/issues/${issue.id}/comments`, {
  method: "POST",
  headers: AUTH,
  body: JSON.stringify({ body }),
});
const text = await res.text();
console.log(`POST comment -> ${res.status}`);
if (!res.ok) {
  console.log(text.slice(0, 600));
  process.exit(1);
}
console.log("ok, issueId=" + issue.id + " status=" + issue.status);
