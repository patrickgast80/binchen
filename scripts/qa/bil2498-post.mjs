/**
 * BIL-2498 — Belege anhaengen und QA-Verdikt posten, dann auf done setzen.
 *
 * Usage: node scripts/qa/bil2498-post.mjs
 */
import fs from "node:fs";
import path from "node:path";

const API = process.env.PAPERCLIP_API_URL ?? "http://127.0.0.1:3100";
const KEY = process.env.PAPERCLIP_API_KEY;
const ISSUE = "865933d4-65a3-427d-84ae-effef783d4d6"; // BIL-2498
const SHOTS = path.join(process.cwd(), "..", "e2e", "reports", "bil2498-live");

const ATTACH = [
  "live-stoff14-desktop-preview.png",
  "live-stoff14-mobile-preview.png",
  "palette-full-desktop.png",
  "palette-full-mobile.png",
  "rot-0-desktop.png",
  "rot-90-desktop.png",
  "rot-180-desktop.png",
  "rot-270-desktop.png",
  "rot-0-mobile.png",
  "rot-90-mobile.png",
  "saved-thumbnail-rot90.png",
  "og-hose-rot0.png",
  "og-hose-rot90.png",
];

for (const name of ATTACH) {
  const file = path.join(SHOTS, name);
  if (!fs.existsSync(file)) {
    console.log(`skip (missing): ${name}`);
    continue;
  }
  const fd = new FormData();
  fd.set("file", new Blob([fs.readFileSync(file)], { type: "image/png" }), name);
  const res = await fetch(`${API}/api/companies/${process.env.PAPERCLIP_COMPANY_ID}/issues/${ISSUE}/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}` },
    body: fd,
  });
  console.log(`attach ${name}: ${res.status} ${(await res.text()).slice(0, 120)}`);
}

const body = fs.readFileSync(path.join(process.cwd(), "bil2498-verdict.md"), "utf8");
const res = await fetch(`${API}/api/issues/${ISSUE}/comments`, {
  method: "POST",
  headers: { "content-type": "application/json", Authorization: `Bearer ${KEY}` },
  body: JSON.stringify({ body }),
});
console.log(`comment: ${res.status} ${(await res.text()).slice(0, 200)}`);

const patchRes = await fetch(`${API}/api/issues/${ISSUE}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", Authorization: `Bearer ${KEY}` },
  body: JSON.stringify({ status: "done" }),
});
console.log(`status patch: ${patchRes.status} ${(await patchRes.text()).slice(0, 200)}`);
