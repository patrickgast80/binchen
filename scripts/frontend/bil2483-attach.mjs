import fs from "node:fs";
import path from "node:path";

const API = "http://127.0.0.1:3100";
const COMPANY = "723a0156-47d4-4ec0-9d21-81a1cebeb182";
const ISSUE = "7f4984d3-ba8d-438f-82ca-e1f7f89dc488"; // BIL-2483
const ROOT = path.resolve(
  "C:/Users/Besitzer/.paperclip/instances/default/projects/723a0156-47d4-4ec0-9d21-81a1cebeb182/5e251e01-8c35-4243-9a64-ebccc2ffed74/_default/apps/e2e/reports/bil2483",
);

const SHOTS = [
  ["before/catalog-card-mobile.png", "01-vorher-katalog-karte-390x844.png"],
  ["after/catalog-card-mobile.png", "02-nachher-katalog-karte-390x844.png"],
  ["before/home-card-desktop.png", "03-vorher-startseite-karte-1440x900.png"],
  ["after/home-card-desktop.png", "04-nachher-startseite-karte-1440x900.png"],
  ["before/catalog-desktop.png", "05-vorher-katalog-grid-1440x900.png"],
  ["after/catalog-desktop.png", "06-nachher-katalog-grid-1440x900.png"],
  ["after/pdp-desktop.png", "07-nachher-pdp-1440x900.png"],
  ["after/cart-item-mobile.png", "08-nachher-warenkorb-390x844.png"],
  ["after/konfigurator-desktop.png", "09-nachher-konfigurator-hub-1440x900.png"],
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
  const text = await res.text();
  console.log(res.status, name, text.slice(0, 200));
}
