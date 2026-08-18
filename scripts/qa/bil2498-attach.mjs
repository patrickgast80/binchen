import fs from "node:fs";
import path from "node:path";

const API = process.env.PAPERCLIP_API_URL ?? "http://127.0.0.1:3100";
const KEY = process.env.PAPERCLIP_API_KEY;
const ISSUE = "865933d4-65a3-427d-84ae-effef783d4d6"; // BIL-2498
const SHOTS = path.join(process.cwd(), "..", "..", "apps", "e2e", "reports", "bil2498-live");

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
    console.log(`skip (missing): ${file}`);
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
