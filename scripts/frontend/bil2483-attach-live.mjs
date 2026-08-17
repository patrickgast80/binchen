import fs from "node:fs";
import path from "node:path";

const API = "http://127.0.0.1:3100";
const COMPANY = "723a0156-47d4-4ec0-9d21-81a1cebeb182";
const ISSUE = "7f4984d3-ba8d-438f-82ca-e1f7f89dc488"; // BIL-2483
const ROOT = path.resolve(
  "C:/Users/Besitzer/.paperclip/instances/default/projects/723a0156-47d4-4ec0-9d21-81a1cebeb182/5e251e01-8c35-4243-9a64-ebccc2ffed74/_default/apps/e2e/reports/bil2483/live",
);

const SHOTS = [
  ["catalog-desktop.png", "10-live-katalog-grid-1440x900.png"],
  ["catalog-card-mobile.png", "11-live-katalog-karte-390x844.png"],
  ["pdp-mobile.png", "12-live-pdp-390x844.png"],
  ["konfigurator-mobile.png", "13-live-konfigurator-hub-390x844.png"],
  ["home-card-mobile.png", "14-live-startseite-karte-390x844.png"],
];

for (const [rel, name] of SHOTS) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    console.log(`MISSING ${rel}`);
    continue;
  }
  const fd = new FormData();
  fd.set("file", new Blob([fs.readFileSync(file)], { type: "image/png" }), name);
  const res = await fetch(`${API}/api/companies/${COMPANY}/issues/${ISSUE}/attachments`, {
    method: "POST",
    body: fd,
  });
  console.log(res.status, name);
}
