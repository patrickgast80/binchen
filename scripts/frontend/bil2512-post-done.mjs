// BIL-2512 Abschluss: Kommentar + status=done.
// Kommentar VOR dem Status-PATCH (ein nackter Status-PATCH ohne Kommentar
// zaehlt als stiller Re-Close).
import { readFile } from "node:fs/promises";

const KEY = process.env.PAPERCLIP_API_KEY;
const BASE = process.env.PAPERCLIP_API_URL || "http://127.0.0.1:3100";
const ISSUE = "1adf3fff-84d8-4934-99a1-ed4bb482c0f4"; // BIL-2512
const H = { Authorization: "Bearer " + KEY, "Content-Type": "application/json" };

const body = await readFile("scripts/frontend/bil2512-done-comment.md", "utf8");

const c = await fetch(`${BASE}/api/issues/${ISSUE}/comments`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ body }),
});
console.log("comment", c.status, (await c.text()).slice(0, 200));
if (!c.ok) process.exit(1);

const p = await fetch(`${BASE}/api/issues/${ISSUE}`, {
  method: "PATCH",
  headers: H,
  body: JSON.stringify({ status: "done" }),
});
console.log("patch", p.status, (await p.text()).slice(0, 200));
