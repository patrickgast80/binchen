#!/usr/bin/env node
// BIL-2462 image grader — walks the live Medusa catalogue, downloads each
// product's thumbnail, and grades it against the Bilulu Studio-Look
// standard (see docs/design/STUDIO-LOOK.md). Produces a machine-readable
// reshoot list + a human-readable summary printed to stdout.
//
// Grading heuristics (deliberately simple; catches the biggest defects the
// board flagged 2026-08-14):
//
//   corner_purity  — average max-channel-deviation of the 4 image corners
//                    from CANVAS_BG (200/200/198). Threshold: 5 ok, 15 warn,
//                    30+ fail (dark backdrop rectangle bleeding to corners).
//
//   backdrop_rect  — scans an inner ring (30-70% of the frame) for a
//                    sustained low-luminance block: mean L < 140 across
//                    the inner ring signals a visible dark-vinyl backdrop.
//
//   central_off_center — centre of mass of "non-background" pixels
//                        (dist from canvas_bg > 25) vs. geometric centre.
//                        Threshold: <30 px ok, 30-80 warn, 80+ fail.
//
//   tilt_hint      — measures skew of the top edge of the motif bounding
//                    box (crude: leftmost vs. rightmost non-bg pixel on the
//                    top 20% of the frame). Flag if > 15 px slope.
//
// Usage:
//   node apps/storefront/scripts/bil2462-image-grader.mjs \
//     --key <publishable-key> \
//     --out apps/storefront/.paperclip-scratch/bil2462/reshoot-list.json
//
// Env:
//   PUBLISHABLE_KEY  fallback for --key
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const CANVAS_BG = { r: 200, g: 200, b: 198 };
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, a) => {
  if (cur.startsWith("--")) acc.push([cur.slice(2), a[i + 1]]);
  return acc;
}, []));
const KEY = args.key || process.env.PUBLISHABLE_KEY;
const OUT = args.out || "apps/storefront/.paperclip-scratch/bil2462/reshoot-list.json";
const BASE = args.base || "https://api.bilulu.de";
if (!KEY) { console.error("--key or PUBLISHABLE_KEY required"); process.exit(1); }

async function fetchProducts() {
  const url = `${BASE}/store/products?limit=100&fields=handle,title,thumbnail`;
  const r = await fetch(url, { headers: { "x-publishable-api-key": KEY } });
  if (!r.ok) throw new Error(`store list ${r.status}`);
  const j = await r.json();
  return j.products;
}

async function download(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

function distBg(r, g, b) {
  return Math.max(Math.abs(r - CANVAS_BG.r), Math.abs(g - CANVAS_BG.g), Math.abs(b - CANVAS_BG.b));
}

async function gradeOne(url) {
  const buf = await download(url);
  const png = await sharp(buf).rotate().resize(400, 400, { fit: "inside" }).ensureAlpha(0).removeAlpha().png().toBuffer();
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const pixel = (x, y) => {
    const i = (y * w + x) * c;
    return [data[i], data[i + 1], data[i + 2]];
  };
  // corner purity
  const CS = Math.max(6, Math.round(Math.min(w, h) * 0.03));
  const cornerBoxes = [[0, 0], [w - CS, 0], [0, h - CS], [w - CS, h - CS]];
  let cornerDev = 0;
  for (const [x0, y0] of cornerBoxes) {
    let sumR = 0, sumG = 0, sumB = 0, n = 0;
    for (let y = y0; y < y0 + CS; y++) for (let x = x0; x < x0 + CS; x++) {
      const [r, g, b] = pixel(x, y); sumR += r; sumG += g; sumB += b; n++;
    }
    cornerDev += distBg(sumR / n, sumG / n, sumB / n);
  }
  cornerDev = Math.round(cornerDev / 4);
  // inner ring luminance (30-70% of frame)
  const ir0 = Math.round(w * 0.30), ir1 = Math.round(w * 0.70);
  let ringSum = 0, ringN = 0;
  for (let y = ir0; y < ir1; y++) {
    for (let x = ir0; x < ir1; x++) {
      const [r, g, b] = pixel(x, y);
      if (distBg(r, g, b) < 25) continue; // skip canvas-bg
      ringSum += (r * 0.299 + g * 0.587 + b * 0.114);
      ringN++;
    }
  }
  const backdropL = ringN ? Math.round(ringSum / ringN) : 255;
  // centre of mass of "non-background" pixels
  let mx = 0, my = 0, mn = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x, y);
      if (distBg(r, g, b) > 25) { mx += x; my += y; mn++; }
    }
  }
  const cx = mn ? Math.round(mx / mn) : w / 2;
  const cy = mn ? Math.round(my / mn) : h / 2;
  const offCentre = Math.round(Math.hypot(cx - w / 2, cy - h / 2));
  // tilt hint: leftmost/rightmost non-bg x on rows 5..15% and 85..95%
  const scanRow = (y0f, y1f) => {
    let lx = w, rx = 0;
    for (let y = Math.round(h * y0f); y < Math.round(h * y1f); y++) {
      for (let x = 0; x < w; x++) {
        const [r, g, b] = pixel(x, y);
        if (distBg(r, g, b) > 25) { if (x < lx) lx = x; if (x > rx) rx = x; break; }
      }
    }
    return { lx, rx };
  };
  const top = scanRow(0.05, 0.15);
  const bot = scanRow(0.85, 0.95);
  const tilt = Math.max(Math.abs(top.lx - bot.lx), Math.abs(top.rx - bot.rx));
  return { cornerDev, backdropL, offCentre, tilt };
}

function verdict(g) {
  const issues = [];
  if (g.cornerDev >= 30) issues.push(`corner-drift ${g.cornerDev}`);
  else if (g.cornerDev >= 15) issues.push(`corner-warn ${g.cornerDev}`);
  if (g.backdropL < 140) issues.push(`dark-backdrop L=${g.backdropL}`);
  else if (g.backdropL < 165) issues.push(`grey-backdrop L=${g.backdropL}`);
  if (g.offCentre >= 80) issues.push(`off-centre ${g.offCentre}px`);
  else if (g.offCentre >= 30) issues.push(`slight-off-centre ${g.offCentre}px`);
  if (g.tilt >= 40) issues.push(`tilt ${g.tilt}px`);
  // 3-band verdict
  const severity = issues.some((s) => s.startsWith("dark-backdrop") || s.startsWith("corner-drift") || s.startsWith("off-centre") || s.startsWith("tilt"))
    ? "reshoot"
    : issues.length ? "keep-with-warnings" : "ok";
  return { severity, issues };
}

async function main() {
  const products = await fetchProducts();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const rows = [];
  for (const p of products) {
    if (!p.thumbnail) { rows.push({ title: p.title, thumbnail: null, severity: "missing", issues: ["no-thumbnail"] }); continue; }
    if (!/api\.bilulu\.de\/static\//.test(p.thumbnail)) {
      rows.push({ title: p.title, thumbnail: p.thumbnail, severity: "external", issues: ["non-medusa-thumbnail"] });
      continue;
    }
    try {
      const g = await gradeOne(p.thumbnail);
      const v = verdict(g);
      rows.push({ title: p.title, thumbnail: p.thumbnail, ...v, metrics: g });
    } catch (e) {
      rows.push({ title: p.title, thumbnail: p.thumbnail, severity: "error", issues: [e.message] });
    }
  }
  rows.sort((a, b) => {
    const order = { reshoot: 0, missing: 1, external: 2, "keep-with-warnings": 3, ok: 4, error: 5 };
    return (order[a.severity] ?? 9) - (order[b.severity] ?? 9);
  });
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: rows.length, rows }, null, 2));
  const counts = rows.reduce((acc, r) => { acc[r.severity] = (acc[r.severity] || 0) + 1; return acc; }, {});
  console.log("== Bilulu image grader ==");
  console.log(counts);
  for (const r of rows) {
    console.log(`  [${r.severity.padEnd(20)}] ${r.title}  ${r.issues.join("; ")}`);
  }
  console.log(`\nwritten: ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
