/**
 * BIL-2498 — live-Abnahme fuer die Hose auf bilulu.de: Rotation + Save/Share,
 * scoped auf den einen Konfigurator statt bil2492-live-verify.mjs' alle 5 (die
 * QA-Abnahme hier betrifft nur die Hose).
 *
 *   node scripts/bil2498-hose-live-verify.mjs [baseUrl] [outDir]
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

  for (const vp of [
    { name: "mobile", width: 390, height: 844, isMobile: true },
    { name: "desktop", width: 1440, height: 900, isMobile: false },
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile,
    });
    await ctx.addInitScript(CONSENT);
    const page = await ctx.newPage();
    page.on("console", (m) => {
      if (m.type() === "error") failures.push(`console ${vp.name}: ${m.text()}`);
    });

    const shots = {};
    for (const rot of [0, 90, 180, 270]) {
      const qs = new URLSearchParams({ hose: "stoff-14" });
      if (rot) qs.set("rot", String(rot));
      await page.goto(`${BASE}/konfigurator/hose?${qs}`, { waitUntil: "networkidle" });
      const preview = page.getByRole("img", { name: /Vorschau/ }).first();
      await preview.waitFor({ state: "visible" });
      await preview.evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(600);
      const buf = await preview.screenshot();
      shots[rot] = buf;
      await writeFile(path.join(OUT, `rot-${rot}-${vp.name}.png`), buf);
    }
    if (Buffer.compare(shots[0], shots[90]) === 0) {
      failures.push(`${vp.name}: rot0 and rot90 are byte-identical`);
    }
    if (Buffer.compare(shots[90], shots[180]) === 0) {
      failures.push(`${vp.name}: rot90 and rot180 are byte-identical`);
    }
    if (Buffer.compare(shots[180], shots[270]) === 0) {
      failures.push(`${vp.name}: rot180 and rot270 are byte-identical`);
    }
    await ctx.close();
  }

  // --- save (Merken) + share (og:image) on the primary desktop viewport ------
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(CONSENT);
  const page = await ctx.newPage();
  const URL_ROT = `${BASE}/konfigurator/hose?hose=stoff-14&rot=90`;
  await page.goto(URL_ROT, { waitUntil: "networkidle" });

  const ogUrl = await page.locator('meta[property="og:image"]').first().getAttribute("content");
  console.log(`og:image → ${ogUrl}`);
  if (!ogUrl || !/[?&]rot=90(&|$)/.test(ogUrl)) failures.push(`og:image does not carry rot=90: ${ogUrl}`);

  await page.getByRole("button", { name: /Merken/ }).click();
  await page.waitForTimeout(1200);
  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("bilulu.saved-configs") ?? "[]"),
  );
  if (!stored.length) {
    failures.push("nothing was saved (Merken)");
  } else {
    const entry = stored[0];
    console.log(`saved name → ${entry.name}`);
    if (!/[?&]rot=90(&|$)/.test(entry.href)) failures.push(`saved href lost rot: ${entry.href}`);
    if (!entry.name.includes("90°")) failures.push(`saved name lost the angle: ${entry.name}`);
    const b64 = String(entry.thumbnail).split(",")[1] ?? "";
    await writeFile(path.join(OUT, "saved-thumbnail-rot90.png"), Buffer.from(b64, "base64"));
  }
  await ctx.close();

  // --- OG card itself, direct fetch (a green content-type proves nothing) ----
  const api = await browser.newContext();
  const apiPage = await api.newPage();
  for (const rot of [0, 90]) {
    const qs = new URLSearchParams({ hose: "stoff-14" });
    if (rot) qs.set("rot", String(rot));
    const res = await apiPage.request.get(`${BASE}/api/og/konfig/hose?${qs}`);
    const buf = await res.body();
    const type = res.headers()["content-type"] ?? "";
    const trace = res.headers()["x-og-photo"] ?? "-";
    console.log(`og rot=${rot}: ${res.status()} ${type} x-og-photo=${trace} ${Math.round(buf.byteLength / 1024)}kb`);
    if (!type.startsWith("image/")) {
      failures.push(`og rot=${rot}: not an image (${res.status()} ${type})`);
      continue;
    }
    await writeFile(path.join(OUT, `og-hose-rot${rot}.png`), buf);
    if (!trace.includes("1F")) failures.push(`og rot=${rot}: no fabric zone in trace (${trace})`);
    if (rot && !trace.includes("r90")) failures.push(`og rot=90: trace lost the angle (${trace})`);
  }
  await api.close();

  await browser.close();
  if (failures.length) {
    console.error(`FAIL:\n${failures.join("\n")}`);
    process.exit(1);
  }
  console.log(`PASS — hose rotation (0/90/180/270), save + share on live, both viewports; shots in ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
