#!/usr/bin/env node
// BIL-2455 followup: batch-normalize every product's Medusa thumbnail
// (uniform pale-grey background, decorative cream frame removed),
// upload the result, and PATCH product.thumbnail to the new URL.
//
// Skips products whose thumbnail is not an image on the Medusa /static host
// (configurator anchors like /konfigurator/body-foto/base.webp or the
// storefront-local /products/pumphose/pumphose-01.jpg — those are not
// hero photos of a physical garment and are managed separately).
//
// Usage:
//   MEDUSA_ADMIN_EMAIL=... MEDUSA_ADMIN_PASSWORD=... \
//     node apps/storefront/scripts/bil2455-batch-normalize-thumbnails.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const WORK = path.resolve(REPO_ROOT, ".paperclip-scratch/bil2455-followup/batch");
fs.mkdirSync(path.join(WORK, "in"), { recursive: true });
fs.mkdirSync(path.join(WORK, "out"), { recursive: true });

const BACKEND = "https://api.bilulu.de";
const EMAIL = process.env.MEDUSA_ADMIN_EMAIL, PASS = process.env.MEDUSA_ADMIN_PASSWORD;
if (!EMAIL || !PASS) { console.error("Set MEDUSA_ADMIN_EMAIL + MEDUSA_ADMIN_PASSWORD"); process.exit(1); }

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

function runNormalizer(inFile, outFile) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [
      path.join(HERE, "bil2455-normalize-product-bg.mjs"),
      "--in", inFile, "--out", outFile,
    ], { stdio: ["ignore", "pipe", "pipe"] });
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
  const safe = p.id + "-" + path.basename(new URL(url).pathname);
  const inFile = path.join(WORK, "in", safe);
  const outFile = path.join(WORK, "out", safe.replace(/\.[^.]+$/, ".jpg"));
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`download ${url} -> ${r.status}`);
    fs.writeFileSync(inFile, Buffer.from(await r.arrayBuffer()));
    await runNormalizer(inFile, outFile);
    const newUrl = await upload(outFile);
    await j(`${BACKEND}/admin/products/${p.id}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ thumbnail: newUrl }),
    });
    results.push({ id: p.id, title: p.title, status: "UPDATED", oldUrl: url, newUrl });
    console.log(`OK  ${p.title} -> ${newUrl}`);
  } catch (e) {
    results.push({ id: p.id, title: p.title, status: "ERROR", url, error: String(e) });
    console.log(`ERR ${p.title}: ${e}`);
  }
}

fs.writeFileSync(path.join(WORK, "results.json"), JSON.stringify(results, null, 2));
console.log(`\ndone. summary → ${path.join(WORK, "results.json")}`);
console.log("  updated:", results.filter(r => r.status === "UPDATED").length);
console.log("  skipped:", results.filter(r => r.status === "SKIP_NON_STATIC").length);
console.log("  errors :", results.filter(r => r.status === "ERROR").length);
