#!/usr/bin/env node
// BIL-2524 — the DoD's "Blick auf die gerenderte Palette" at 390x844 and
// 1440x900. The contact sheets from bil2524-chip-size-study.mjs judge the chip
// in isolation; this judges it where a customer meets it, next to 34 others.
//
// Runs at deviceScaleFactor 2 and 3 so the screenshot shows the actual upscale,
// and additionally crops the fabric block so the chips can be compared 1:1
// instead of squinting at a full-page shot.
//
// Usage:
//   node apps/e2e/scripts/bil2524-palette-shots.mjs --base http://localhost:3311

import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};

const BASE = arg("base", "http://localhost:3311");
const ROUTE = arg("route", "/konfigurator/turban");
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(arg("out", join(HERE, "..", "reports", "bil2524", "palette")));

const VIEWPORTS = [
  { name: "mobile-390x844-dpr3", width: 390, height: 844, dpr: 3, mobile: true },
  { name: "desktop-1440x900-dpr2", width: 1440, height: 900, dpr: 2, mobile: false },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.dpr,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
    });
    const page = await ctx.newPage();

    // Record what the palette actually pulled, so the shot doubles as proof
    // that the 96px files are the ones on the wire.
    const chipRequests = [];
    page.on("response", (res) => {
      const u = res.url();
      if (/\/stoffe\/stoff-\d+-\d+\.webp$/.test(u)) {
        chipRequests.push({ url: u.replace(BASE, ""), status: res.status() });
      }
    });

    // The cookie banner covers the palette at 390x844 (BIL-2492 lesson: a
    // banner makes two different states screenshot identically — and it did
    // exactly that here on the first run). Seed the consent instead of clicking
    // it away: the visible label is "Alle akzeptieren" but the accessible name
    // is "Alle Cookies akzeptieren", so getByRole on the visible text silently
    // matches nothing, and clicking it in dev does not unmount the banner.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "bilulu_cookie_consent_v1",
        JSON.stringify({
          version: "1",
          decidedAt: "2026-08-19T00:00:00.000Z",
          categories: { strict: true, functional: true, analytics: false, marketing: false },
        }),
      );
    });

    await page.goto(BASE + ROUTE, { waitUntil: "networkidle" });

    // Assert it worked rather than trusting it — a covered palette is the one
    // way this script can produce a confident, worthless screenshot.
    const banner = page.locator("button").filter({ hasText: "Alle akzeptieren" });
    if (await banner.isVisible().catch(() => false)) {
      throw new Error(`${vp.name}: cookie banner still covers the palette — shot would be useless`);
    }

    // The fabric chips are the tail of the radiogroup — scroll them into view
    // and wait until every <img> has actually decoded, or the shot shows the
    // hex fallback instead of the texture.
    const lastFabric = page.getByRole("radio", { name: /Stoff 35/ }).first();
    await lastFabric.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(600);
    await page.evaluate(async () => {
      const imgs = Array.from(document.querySelectorAll("img")).filter((i) =>
        i.currentSrc.includes("/stoffe/"),
      );
      await Promise.all(imgs.map((i) => (i.complete ? i.decode().catch(() => {}) : null)));
    });
    await page.waitForTimeout(300);

    await page.screenshot({ path: join(OUT, `${vp.name}-full.png`), fullPage: false });

    // Tight crop around the dense low-contrast fabrics — stoff-27/33/34 are the
    // ones that decided the size, so they are the ones worth looking at.
    const target = page.getByRole("radio", { name: /Stoff 33/ }).first();
    const box = await target.boundingBox().catch(() => null);
    if (box) {
      const pad = vp.mobile ? 120 : 220;
      const clip = {
        x: Math.max(0, box.x - pad),
        y: Math.max(0, box.y - pad),
        width: Math.min(vp.width - Math.max(0, box.x - pad), pad * 2 + box.width),
        height: Math.min(vp.height - Math.max(0, box.y - pad), pad * 2 + box.height),
      };
      await page.screenshot({ path: join(OUT, `${vp.name}-chips.png`), clip });
    } else {
      console.warn(`! ${vp.name}: could not locate Stoff 33 — no crop written`);
    }

    const sizes = new Set(chipRequests.map((r) => r.url.match(/-(\d+)\.webp$/)?.[1]));
    const bad = chipRequests.filter((r) => r.status >= 400);
    console.log(
      `${vp.name}: ${chipRequests.length} chip requests, sizes {${[...sizes].join(",")}}, ` +
        `${bad.length} failed`,
    );
    if (bad.length) console.log("  !", bad.slice(0, 5));
    await ctx.close();
  }

  await browser.close();
  console.log(`Shots → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
