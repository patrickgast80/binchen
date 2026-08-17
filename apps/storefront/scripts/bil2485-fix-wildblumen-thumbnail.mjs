#!/usr/bin/env node
// BIL-2485: "Turban-Mütze Bunte Wildblumen" kept showing the raw studio
// mannequin-head shot on the catalog card even after the BIL-2462 batch pass.
//
// Root cause: the product's `thumbnail` field pointed at an on-head studio
// photo (mannequin head, full studio backdrop). The BIL-2462 normalizer
// correctly refused to touch it — segmentBackground()'s plausibility gate
// hit "flood fill stalled" because the dark backdrop and the light foam head
// are both large, low-saturation regions with no safe garment/background
// edge to find (see bil2462-studio-normalize.mjs "fallback" mode notes).
// That's a correct fail-safe, not a bug: forcing a segmentation there risks
// eating real product pixels or leaving skin-tone foam behind as if it were
// fabric.
//
// The fix isn't a smarter algorithm — it's using better source material that
// already existed: the product's own image gallery (rank 1, "photo-22") is a
// plain flat-lay shot of the SAME turban with no mannequin, identical in
// style to every sibling Mütze/Turban product. Feeding that into the
// existing v2 normalizer reproduces the standard studio-look result cleanly.
//
// Usage:
//   MEDUSA_ADMIN_EMAIL=... MEDUSA_ADMIN_PASSWORD=... \
//     node apps/storefront/scripts/bil2485-fix-wildblumen-thumbnail.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const WORK = path.resolve(REPO_ROOT, ".paperclip-scratch/bil2485-fix");
fs.mkdirSync(WORK, { recursive: true });

const BACKEND = "https://api.bilulu.de";
const PRODUCT_ID = "prod_01KZ0VZS1Y5TFKDJTV2KXERNJV"; // Turban-Mütze "Bunte Wildblumen"
const GALLERY_FLATLAY_URL = "https://api.bilulu.de/static/1785841859977-photo-22.jpg";

const EMAIL = process.env.MEDUSA_ADMIN_EMAIL, PASS = process.env.MEDUSA_ADMIN_PASSWORD;
if (!EMAIL || !PASS) { console.error("Set MEDUSA_ADMIN_EMAIL + MEDUSA_ADMIN_PASSWORD"); process.exit(1); }

async function j(url, opts = {}) {
  const r = await fetch(url, opts);
  const t = await r.text();
  let b = null; try { b = t ? JSON.parse(t) : null; } catch { b = t; }
  if (!r.ok) throw new Error(`${opts.method || "GET"} ${url} -> ${r.status}: ${JSON.stringify(b).slice(0, 500)}`);
  return b;
}

function runNormalizer(inFile, outFile) {
  return new Promise((resolve, reject) => {
    const args = [path.join(HERE, "bil2462-studio-normalize.mjs"), "--in", inFile, "--out", outFile];
    const p = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => out += d.toString());
    p.stderr.on("data", (d) => err += d.toString());
    p.on("close", (code) => code === 0 ? resolve(out.trim()) : reject(new Error(`normalizer failed: ${err}`)));
  });
}

const token = (await j(`${BACKEND}/auth/user/emailpass`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
})).token;

const inFile = path.join(WORK, "source-flatlay.jpg");
const outFile = path.join(WORK, "normalized.jpg");

const r = await fetch(GALLERY_FLATLAY_URL);
if (!r.ok) throw new Error(`download ${GALLERY_FLATLAY_URL} -> ${r.status}`);
fs.writeFileSync(inFile, Buffer.from(await r.arrayBuffer()));

const normalizerOut = await runNormalizer(inFile, outFile);
console.log(normalizerOut);

const buf = await fs.promises.readFile(outFile);
const form = new FormData();
form.append("files", new Blob([buf], { type: "image/jpeg" }), `${PRODUCT_ID}.jpg`);
const res = await fetch(`${BACKEND}/admin/uploads`, {
  method: "POST", headers: { authorization: `Bearer ${token}` }, body: form,
});
const text = await res.text();
if (!res.ok) throw new Error(`upload failed ${res.status}: ${text.slice(0, 400)}`);
const body = JSON.parse(text);
const file = body.files?.[0] ?? body.uploads?.[0];
const newUrl = file.url.startsWith("http") ? file.url : `${BACKEND}${file.url}`;

await j(`${BACKEND}/admin/products/${PRODUCT_ID}`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ thumbnail: newUrl }),
});

console.log(`OK thumbnail updated -> ${newUrl}`);
