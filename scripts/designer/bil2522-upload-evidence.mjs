/**
 * BIL-2522 — upload the evidence sheets as issue attachments.
 *
 * The board judges "täuschend echt" by eye, so the images have to be reachable
 * from the ticket itself, not from a path on a build machine.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const ISSUE_ID = "bf583f0d-8c87-4e2e-bfc1-ecb67ec5f140";
const ROOT = "apps/storefront/reports/bil2522";

const FILES = [
  ["hose-stoff-20-petrol-rot90.png", "Vorher / Nachher / echtes Produktfoto — Streifenstoff (rot=90)"],
  ["hose-stoff-15-sage.png", "Vorher / Nachher / echtes Produktfoto — Einhorn-Jeansstoff"],
  ["hose-stoff-04-mustard.png", "Vorher / Nachher / echtes Produktfoto — Pferde-Stoff"],
  ["live/hose-stoff-20-petrol-rot90-desktop.png", "LIVE Browser, Desktop — Streifen, rot=90"],
  ["live/hose-stoff-15-sage-mobile.png", "LIVE Browser, 390px mobil — Einhorn"],
  ["live/hose-stoff-15-sage-desktop-fallback.png", "Fallback-Pfad (relief.webp blockiert) = bisheriger Look"],
];

const out = [];
for (const [rel, title] of FILES) {
  const buf = await readFile(path.join(ROOT, rel));
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "image/png" }), path.basename(rel));
  form.append("title", title);
  const res = await fetch(`${API}/api/issues/${ISSUE_ID}/attachments`, {
    method: "POST",
    headers: { authorization: `Bearer ${KEY}` },
    body: form,
  });
  const text = await res.text();
  console.log(res.status, rel, text.slice(0, 300));
  if (res.ok) {
    try {
      out.push({ rel, title, ...JSON.parse(text) });
    } catch {
      out.push({ rel, title, raw: text });
    }
  }
}
console.log("\n" + JSON.stringify(out, null, 1));
