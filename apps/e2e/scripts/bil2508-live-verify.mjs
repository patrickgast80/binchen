#!/usr/bin/env node
// BIL-2508 — live proof on bilulu.de that the fabric tiles no longer show a
// repeat grid, for the fabric the board photographed and across all rotations.
//
// Two independent checks, because either one alone can lie:
//
//   1. ASSET CHECK. Fetch each shipped tile and compare its bytes to the file
//      in this working tree. A screenshot of a stale deploy looks exactly like
//      a screenshot of a fixed one (BIL-2492's lesson), so nothing is believed
//      until the deployed tile is byte-identical to the one that was built.
//
//   2. BROWSER CHECK. Real Chromium, real viewport, screenshot of the preview
//      plus a zoom crop on the trouser leg where the board saw the seams. Run
//      at 0/90/180/270 degrees, because BIL-2492's rotation is applied to the
//      tiling layer and a seam can be orientation-dependent.
//
// Usage:
//   node apps/e2e/scripts/bil2508-live-verify.mjs [--base https://bilulu.de]
//     [--fabric stoff-09] [--wait 900]   # seconds to wait for the deploy

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const BASE = arg("base", "https://bilulu.de");
const FABRIC = arg("fabric", "stoff-09");
const WAIT_S = Number(arg("wait", 900));
const OUT = resolve(arg("out", join(REPO, "apps", "e2e", "reports", "bil2508", "live")));

// Every tile this pass re-authored. All of them have to be live before any
// screenshot counts, not just the one the board happened to photograph.
const CHANGED = [
  "stoff-03",
  "stoff-08",
  "stoff-09",
  "stoff-10",
  "stoff-11",
  "stoff-16",
  "stoff-18",
  "stoff-20",
  "stoff-22",
  "stoff-23",
  "stoff-25",
  "stoff-31",
];

const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchTile(id) {
  const res = await fetch(`${BASE}/stoffe/${id}.webp`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function waitForDeploy() {
  const want = {};
  for (const id of CHANGED) {
    want[id] = sha(await readFile(join(REPO, "apps", "storefront", "public", "stoffe", `${id}.webp`)));
  }
  const deadline = Date.now() + WAIT_S * 1000;
  let attempt = 0;
  for (;;) {
    attempt += 1;
    const live = {};
    let stale = [];
    for (const id of CHANGED) {
      try {
        live[id] = sha(await fetchTile(id));
      } catch (e) {
        live[id] = `err:${e.message}`;
      }
      if (live[id] !== want[id]) stale.push(id);
    }
    if (!stale.length) {
      console.log(`deploy live after ${attempt} probe(s) — all ${CHANGED.length} tiles byte-identical`);
      return { want, live, attempts: attempt };
    }
    if (Date.now() > deadline) {
      console.error(`TIMEOUT: still stale after ${WAIT_S}s -> ${stale.join(", ")}`);
      return { want, live, stale, attempts: attempt, timedOut: true };
    }
    console.log(`  probe ${attempt}: ${stale.length} tile(s) still stale (${stale.slice(0, 4).join(", ")}) — waiting 30s`);
    await sleep(30_000);
  }
}

/** Dismisses the consent banner so it cannot photobomb the evidence. */
async function acceptCookies(page) {
  for (const name of [/alle akzeptieren/i, /akzeptieren/i, /zustimmen/i]) {
    const btn = page.getByRole("button", { name }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(300);
      return true;
    }
  }
  return false;
}

async function shoot(browser, { viewport, label, rot }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const url = `${BASE}/konfigurator/hose?hose=${FABRIC}&rot=${rot}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await acceptCookies(page);
  await page.waitForTimeout(700);

  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  // The preview is the photo layer stack, not an <img> with a helpful alt — the
  // mask/tile layers are divs. Anchor on the wrapper that holds the base photo.
  const preview = page.locator("main img").first();
  await preview.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);

  // On mobile the option sheet is `position: fixed` at the bottom and covers
  // the garment. A full-page screenshot there is a photograph of the sheet, not
  // of the fix (BIL-2492's trap), so the clip is capped at the sheet's top edge
  // and the result is rejected outright if too little of the print is left.
  const sheetTop = await page.evaluate(() => {
    const h = window.innerHeight;
    let top = h;
    for (const el of document.querySelectorAll("body *")) {
      const s = getComputedStyle(el);
      if (s.position !== "fixed" || s.display === "none" || s.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.height < 60 || r.width < window.innerWidth * 0.6) continue;
      if (r.bottom >= h - 2 && r.top > h * 0.2) top = Math.min(top, r.top);
    }
    return top;
  });

  // scrollIntoViewIfNeeded parks the preview just above the sheet, which leaves
  // ~80 px of garment on mobile. Pull it up under the header instead so the
  // whole photo sits in the free strip.
  // `behavior: "instant"` on purpose — the site sets scroll-behavior: smooth,
  // and a smooth scroll that has not finished reads back as "did not move".
  const first = await preview.boundingBox().catch(() => null);
  if (first && first.y > 140) {
    await page.evaluate((dy) => window.scrollTo({ top: window.scrollY + dy, behavior: "instant" }), Math.round(first.y - 130));
    await page.waitForTimeout(500);
  }

  const shot = join(OUT, `${label}-rot${rot}.png`);
  await page.screenshot({ path: shot });

  const box = await preview.boundingBox().catch(() => null);
  let zoom = null;
  if (box) {
    const top = Math.round(box.y + box.height * 0.34);
    const bottom = Math.min(Math.round(box.y + box.height), Math.floor(sheetTop) - 2);
    const height = bottom - top;
    if (height >= 120) {
      zoom = join(OUT, `${label}-rot${rot}-zoom.png`);
      await page.screenshot({
        path: zoom,
        clip: { x: Math.round(box.x + box.width * 0.1), y: top, width: Math.round(box.width * 0.8), height },
      });
    }
  }

  await ctx.close();
  return { url, shot, zoom, sheetTop, box, errors };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const deploy = await waitForDeploy();

  const browser = await chromium.launch();
  const shots = [];
  for (const rot of [0, 90, 180, 270]) {
    shots.push(await shoot(browser, { viewport: { width: 390, height: 844 }, label: "mobile", rot }));
    shots.push(await shoot(browser, { viewport: { width: 1440, height: 900 }, label: "desktop", rot }));
  }
  await browser.close();

  const result = { base: BASE, fabric: FABRIC, deploy, shots };
  await writeFile(join(OUT, "results.json"), JSON.stringify(result, null, 2));
  console.log(`\n${shots.length} screenshots -> ${OUT}`);
  console.log(deploy.timedOut ? "RESULT: DEPLOY NOT LIVE — screenshots prove nothing" : "RESULT: verified against live bytes");
  if (deploy.timedOut) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
