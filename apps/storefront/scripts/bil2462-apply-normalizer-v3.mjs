#!/usr/bin/env node
// BIL-2462 follow-up (board 2026-08-17): re-run the studio normalizer with
// three fixes over the v2 apply pass (bil2462-apply-normalizer.mjs):
//   1. Canvas background now matches EACH PHOTO's own backdrop colour
//      instead of one fixed grey (see pickCanvasBg in the normalizer).
//   2. PAD_RATIO tightened 12%->5% so the product fills more of the frame.
//   3. Canonical orientation for Mützen (opening down) and Pumphosen (legs
//      down), applied via --rotate using a hand-reviewed per-product map
//      (ROTATE_MAP below) — "which way is up" needed a visual read of each
//      garment's waistband/cuffs, not something derivable from pixels alone.
//
// Usage:
//   MEDUSA_ADMIN_EMAIL=... MEDUSA_ADMIN_PASSWORD=... \
//     node apps/storefront/scripts/bil2462-apply-normalizer-v3.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const WORK = path.resolve(REPO_ROOT, ".paperclip-scratch/bil2462-apply-v3");
fs.mkdirSync(path.join(WORK, "in"), { recursive: true });
fs.mkdirSync(path.join(WORK, "out"), { recursive: true });

const BACKEND = "https://api.bilulu.de";
const EMAIL = process.env.MEDUSA_ADMIN_EMAIL, PASS = process.env.MEDUSA_ADMIN_PASSWORD;
if (!EMAIL || !PASS) { console.error("Set MEDUSA_ADMIN_EMAIL + MEDUSA_ADMIN_PASSWORD"); process.exit(1); }

// Visually reviewed 2026-08-17 against each product's live thumbnail: Mützen
// need their fold-hem/opening at the bottom, Pumphosen need waistband up /
// leg cuffs down. Degrees are clockwise (sharp .rotate() convention);
// negative = counter-clockwise. Omitted product ids were already correct.
const ROTATE_MAP = {
  "prod_01KZ0VZN6J66D6AKW54HNX0TK8": -90, // Mütze Winter-Kinder marineblau
  "prod_01KZ0VZNNRMQY35F79W7XBAN39": -90, // Mütze Boho-Regenbogen mint
  "prod_01KZ0VZQ16YTDT81JT5WAFSSZ0": -90, // Turban-Mütze Aquarell-Blüten bordeaux
  "prod_01KZ0VZR3GRE02ZXNAE1M1KJP0": -90, // Turban-Mütze Pastell-Aquarell
  "prod_01KZ0VZQHSK3F3JZDC0GVARFV8": 180, // Baby-Mütze Rosen navy
  "prod_01KZ0VZTMRNYR9XPP2G8FKVM1S": -90, // Pumphose Blätter-Aquarell creme
  "prod_01KZ0VZV13GCM9ESBEDMTF2B65": -90, // Pumphose Rosen rosa
  "prod_01KZ0VZVR4CGBWAM6QEKDFJTHW": -90, // Pumphose Wale marineblau
  "prod_01KZ0VZWW1Z6ZEGWK2V6J5CZQK": -90, // Pumphose Pferde & Blumen
  "prod_01KZ0VZXZMY5F8TMSEF4WP4H1K": -90, // Pumphose Füchse im Wald
  "prod_01KZ0VZYBX4DWZK4JX5BEQ4KWQ": -90, // Pumphose Dinos rosa/türkis
  "prod_01KZ0VZZC7V6PMQH9R54KNM10R": -90, // Pumphose Erdbeeren
};

async function j(url, opts = {}) {
  const r = await fetch(url, opts);
  const t = await r.text();
  let b = null; try { b = t ? JSON.parse(t) : null; } catch { b = t; }
  if (!r.ok) throw new Error(`${opts.method || "GET"} ${url} -> ${r.status}: ${JSON.stringify(b).slice(0, 500)}`);
  return b;
}

const token = (await j(`${BACKEND}/auth/user/emailpass`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
})).token;

const products = (await j(`${BACKEND}/admin/products?limit=100&fields=id,title,thumbnail`, {
  headers: { authorization: `Bearer ${token}` },
})).products;

function runNormalizer(inFile, outFile, rotateDeg) {
  return new Promise((resolve, reject) => {
    const args = [path.join(HERE, "bil2462-studio-normalize.mjs"), "--in", inFile, "--out", outFile];
    if (rotateDeg) args.push("--rotate", String(rotateDeg));
    const p = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => out += d.toString());
    p.stderr.on("data", (d) => err += d.toString());
    p.on("close", (code) => code === 0 ? resolve(out.trim()) : reject(new Error(`normalizer failed: ${err}`)));
  });
}

async function upload(filePath) {
  const buf = await fs.promises.readFile(filePath);
  const filename = path.basename(filePath);
  const form = new FormData();
  form.append("files", new Blob([buf], { type: "image/jpeg" }), filename);
  const res = await fetch(`${BACKEND}/admin/uploads`, {
    method: "POST", headers: { authorization: `Bearer ${token}` }, body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`upload ${filename} failed ${res.status}: ${text.slice(0, 400)}`);
  const body = JSON.parse(text);
  const file = body.files?.[0] ?? body.uploads?.[0];
  if (!file?.url) throw new Error(`no url in upload response: ${text.slice(0, 400)}`);
  return file.url.startsWith("http") ? file.url : `${BACKEND}${file.url}`;
}

const results = [];
for (const p of products) {
  const url = p.thumbnail || "";
  if (!/^https?:\/\/api\.bilulu\.de\/static\/.+\.(jpe?g|png)$/i.test(url)) {
    results.push({ id: p.id, title: p.title, status: "SKIP_NON_STATIC", url });
    console.log(`SKIP ${p.title} (thumbnail not on /static): ${url}`);
    continue;
  }
  const ext = path.extname(new URL(url).pathname) || ".jpg";
  const safe = p.id + ext;
  const inFile = path.join(WORK, "in", safe);
  const outFile = path.join(WORK, "out", safe.replace(/\.[^.]+$/, ".jpg"));
  const rotateDeg = ROTATE_MAP[p.id] || 0;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`download ${url} -> ${r.status}`);
    fs.writeFileSync(inFile, Buffer.from(await r.arrayBuffer()));
    const normalizerOut = await runNormalizer(inFile, outFile, rotateDeg);
    const mode = /\[(\w+)\]/.exec(normalizerOut)?.[1] || "unknown";
    const newUrl = await upload(outFile);
    await j(`${BACKEND}/admin/products/${p.id}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ thumbnail: newUrl }),
    });
    results.push({ id: p.id, title: p.title, status: "UPDATED", mode, rotateDeg, oldUrl: url, newUrl });
    console.log(`OK  [${mode}]${rotateDeg ? ` rot=${rotateDeg}` : ""} ${p.title} -> ${newUrl}`);
  } catch (e) {
    results.push({ id: p.id, title: p.title, status: "ERROR", url, error: String(e) });
    console.log(`ERR ${p.title}: ${e}`);
  }
}

fs.writeFileSync(path.join(WORK, "results.json"), JSON.stringify(results, null, 2));
console.log(`\ndone. summary -> ${path.join(WORK, "results.json")}`);
console.log("  updated:", results.filter(r => r.status === "UPDATED").length);
console.log("  skipped:", results.filter(r => r.status === "SKIP_NON_STATIC").length);
console.log("  errors :", results.filter(r => r.status === "ERROR").length);
