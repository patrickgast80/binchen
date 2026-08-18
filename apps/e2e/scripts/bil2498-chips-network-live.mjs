/**
 * BIL-2498 — Schritt 2 (Palette: alle 35 Chips) + Schritt 6 (Netzwerk) live auf
 * bilulu.de.
 *
 *   node scripts/bil2498-chips-network-live.mjs [baseUrl] [outDir]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "https://bilulu.de";
const OUT = process.argv[3] ?? path.join(process.cwd(), "reports", "bil2498-live");

const CONSENT = () => {
  window.localStorage.setItem(
    "bilulu_cookie_consent_v1",
    JSON.stringify({
      version: "1",
      decidedAt: "2026-08-18T00:00:00.000Z",
      categories: { strict: true, functional: false, analytics: false, marketing: false },
    }),
  );
};

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const failures = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(CONSENT);
  const page = await ctx.newPage();

  // --- Schritt 2: alle 35 Chip-Dateien direkt abrufen -------------------------
  const manifestRes = await page.request.get(`${BASE}/stoffe/manifest.json`);
  const manifest = await manifestRes.json();
  console.log(`manifest: ${manifest.swatches.length} swatches, tile=${manifest.tile} chip=${manifest.chip}`);
  const chipResults = [];
  for (const sw of manifest.swatches) {
    const res = await page.request.get(`${BASE}${sw.chipSrc}`);
    const buf = await res.body();
    const ok = res.ok() && buf.byteLength > 500;
    chipResults.push({ id: sw.id, status: res.status(), bytes: buf.byteLength });
    if (!ok) failures.push(`chip ${sw.id}: status=${res.status()} bytes=${buf.byteLength}`);
  }
  console.log(
    `chips: ${chipResults.filter((c) => c.status === 200).length}/${chipResults.length} ok, ` +
      `avg ${Math.round(chipResults.reduce((s, c) => s + c.bytes, 0) / chipResults.length)} bytes`,
  );
  await writeFile(path.join(OUT, "chips-result.json"), JSON.stringify(chipResults, null, 2), "utf8");

  // Visual: scroll through the whole palette and screenshot it, both viewports.
  for (const vp of [
    { name: "mobile", width: 390, height: 844, isMobile: true },
    { name: "desktop", width: 1440, height: 900, isMobile: false },
  ]) {
    const vctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile,
    });
    await vctx.addInitScript(CONSENT);
    const vpage = await vctx.newPage();
    await vpage.goto(`${BASE}/konfigurator/hose?hose=stoff-14`, { waitUntil: "networkidle" });
    if (vp.isMobile) {
      const tab = vpage.getByRole("tab", { name: "Hose" });
      if (await tab.count()) await tab.click();
      await vpage.waitForTimeout(400);
    }
    const group = vpage.getByRole("radiogroup", { name: /Farbe für Hose/ });
    if (await group.count()) {
      await group.first().scrollIntoViewIfNeeded();
      await vpage.waitForTimeout(300);
      await group.first().screenshot({ path: path.join(OUT, `palette-full-${vp.name}.png`) });
    } else {
      failures.push(`${vp.name}: palette radiogroup not found`);
    }
    await vctx.close();
  }

  // --- Schritt 6: Netzwerk ----------------------------------------------------
  const seen = [];
  page.on("response", (res) => {
    const u = res.url();
    if (u.includes("/stoffe/")) seen.push({ url: u, status: res.status() });
  });
  await page.goto(`${BASE}/konfigurator/hose?hose=stoff-14`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  const tile = seen.filter((s) => /stoff-14\.webp/.test(s.url));
  const legacy256 = seen.filter((s) => /-256\.webp/.test(s.url));
  console.log("network /stoffe/ requests on page load:");
  for (const s of seen) console.log(`  ${s.status}  ${s.url}`);
  if (legacy256.length) failures.push(`page requested legacy -256.webp: ${legacy256.map((s) => s.url).join(", ")}`);
  if (!tile.length) failures.push("page never requested stoff-14.webp");

  const tileRes = await page.request.get(`${BASE}/stoffe/stoff-14.webp`);
  const tileBuf = await tileRes.body();
  const kb = Math.round(tileBuf.byteLength / 1024);
  console.log(`stoff-14.webp: ${kb} kB (expect ~110 kB, not ~444 kB)`);
  if (kb > 150) failures.push(`stoff-14.webp is ${kb} kB, expected ~110 kB`);

  await ctx.close();
  await browser.close();

  if (failures.length) {
    console.error(`FAIL:\n${failures.join("\n")}`);
    process.exit(1);
  }
  console.log("PASS — all 35 chips resolve, palette renders both viewports, network is lean, no -256 requests");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
