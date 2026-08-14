/**
 * BIL-2461 — screenshot the Foto-Konfigurator preview for Hose + Mütze at a
 * range of tint combinations, without needing the Next dev server (which is
 * blocked by a stale .next\standalone symlink on this Windows checkout).
 *
 * Renders the same layer stack the app uses (base + ZoneOverlay with
 * mix-blend-mode: multiply) via a tiny Node http server that serves the
 * regenerated assets, then uses Playwright to capture each combo.
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { readFile } from "node:fs/promises";

const ROOT = path.resolve("../storefront/public");
const OUT = path.resolve(".paperclip-scratch/bil2461");
await mkdir(OUT, { recursive: true });

const LAYOUTS = {
  hose: {
    assetBase: "/konfigurator/hose-foto",
    w: 900,
    h: 1005,
    zones: [
      { id: "bund", mask: "bund", defaultHex: "#5BA8AE" },
      { id: "hose", mask: "hose", defaultHex: "#FAF7F2" },
      { id: "buendchen", mask: "buendchen", defaultHex: "#5BA8AE" },
    ],
  },
  muetze: {
    assetBase: "/konfigurator/muetze-foto",
    w: 900,
    h: 920,
    zones: [
      { id: "muetze", mask: "muetze", defaultHex: "#5BA8AE" },
      { id: "futter", mask: "futter", defaultHex: "#FAF7F2" },
    ],
  },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  console.error("[srv]", req.method, url.pathname);
  try {
    if (url.pathname === "/hose.html") {
      const body = pageHtml("hose", url.searchParams);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(body);
      return;
    }
    if (url.pathname === "/muetze.html") {
      const body = pageHtml("muetze", url.searchParams);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(body);
      return;
    }
    if (url.pathname.startsWith("/konfigurator/")) {
      const file = path.join(ROOT, url.pathname);
      let buf;
      try {
        buf = await readFile(file);
      } catch {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "image/webp" });
      res.end(buf);
      return;
    }
    res.writeHead(404);
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500);
      res.end(String(err));
    }
  }
});
await new Promise((r) => server.listen(3462, "127.0.0.1", r));
const BASE = "http://127.0.0.1:3462";

const COMBOS = {
  hose: [
    { name: "default", zones: { bund: "#5BA8AE", hose: "#FAF7F2", buendchen: "#5BA8AE" } },
    { name: "sage-cream-terracotta", zones: { bund: "#3F6444", hose: "#FAF7F2", buendchen: "#C4704A" } },
    { name: "navy-sky-mustard", zones: { bund: "#2D3E50", hose: "#A8C8D8", buendchen: "#D4A24C" } },
    { name: "rust-sand-terracotta", zones: { bund: "#7A3318", hose: "#E8DDC8", buendchen: "#C4704A" } },
  ],
  muetze: [
    { name: "default-petrol-cream", zones: { muetze: "#5BA8AE", futter: "#FAF7F2" } },
    { name: "terracotta-sand", zones: { muetze: "#C4704A", futter: "#E8DDC8" } },
    { name: "forest-powderpink", zones: { muetze: "#3F6444", futter: "#E8C2C2" } },
    { name: "mustard-navy", zones: { muetze: "#D4A24C", futter: "#2D3E50" } },
  ],
};

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];

const browser = await chromium.launch();
try {
  for (const [garment, combos] of Object.entries(COMBOS)) {
    for (const combo of combos) {
      for (const vp of VIEWPORTS) {
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: 2,
        });
        const page = await ctx.newPage();
        const params = new URLSearchParams(combo.zones).toString();
        const url = `${BASE}/${garment}.html?${params}`;
        console.log("→", garment, combo.name, vp.name);
        await page.goto(url, { waitUntil: "load", timeout: 15_000 });
        await page.waitForTimeout(500);
        const name = `${garment}-${vp.name}-${combo.name}.png`;
        await page.screenshot({ path: path.join(OUT, name), fullPage: false });
        await ctx.close();
      }
    }
  }
  console.log("wrote", OUT);
} finally {
  await browser.close();
  server.close();
}

function pageHtml(garment, searchParams) {
  const layout = LAYOUTS[garment];
  const layers = layout.zones
    .map((z) => {
      const tint = searchParams.get(z.id) ?? z.defaultHex;
      return `
        <div style="
          position:absolute; inset:0;
          background:${tint};
          mix-blend-mode:multiply;
          -webkit-mask-image:url('${layout.assetBase}/mask-${z.mask}.webp');
                  mask-image:url('${layout.assetBase}/mask-${z.mask}.webp');
          -webkit-mask-mode:alpha;      mask-mode:alpha;
          -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat;
          -webkit-mask-size:100% 100%;   mask-size:100% 100%;
          pointer-events:none;
        "></div>`;
    })
    .join("");
  return `<!doctype html><html><head>
    <meta charset="utf-8"><title>${garment}</title>
    <style>
      html,body{margin:0;padding:0;background:#faf7f2;font-family:system-ui;}
      .wrap{max-width:520px;margin:24px auto;padding:16px;}
      .frame{position:relative;width:100%;aspect-ratio:${layout.w}/${layout.h};isolation:isolate;}
      .frame img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;user-select:none;pointer-events:none;}
      .frame img.sheen{mix-blend-mode:screen;}
      h1{font-size:14px;color:#555;text-align:center;margin:0 0 8px;letter-spacing:0.02em;}
    </style></head>
    <body><div class="wrap">
      <h1>${garment.toUpperCase()} – Foto-Konfigurator</h1>
      <div class="frame">
        <img src="${layout.assetBase}/base.webp" alt="">
        ${layers}
        <img class="sheen" src="${layout.assetBase}/highlight.webp" alt="">
      </div>
    </div></body></html>`;
}
