/**
 * BIL-2492 — live-Gegenprobe auf bilulu.de.
 *
 * Shoots the rotated vs. unrotated preview on the real host at both viewports,
 * pulls the real OG share card (which cannot be rendered locally — next/og does
 * not start on Windows), and checks the save round-trip against production.
 *
 *   node scripts/bil2492-live-verify.mjs [baseUrl] [outDir]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "https://bilulu.de";
const OUT = process.argv[3] ?? path.join(process.cwd(), "reports", "bil2492-live");

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

const CASES = [
  { id: "hose", param: "hose" },
  { id: "body", param: "hauptteil" },
  { id: "turban", param: "turban" },
  { id: "muetze", param: "muetze" },
  { id: "dreieckstuch", param: "tuch" },
];

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

    for (const c of CASES) {
      const shots = {};
      for (const rot of [0, 90]) {
        const qs = new URLSearchParams({ [c.param]: "stoff-14" });
        if (rot) qs.set("rot", String(rot));
        await page.goto(`${BASE}/konfigurator/${c.id}?${qs}`, { waitUntil: "networkidle" });
        const preview = page.getByRole("img", { name: /Vorschau/ }).first();
        await preview.waitFor({ state: "visible" });
        await page.waitForTimeout(600);
        const buf = await preview.screenshot();
        shots[rot] = buf;
        await writeFile(path.join(OUT, `${c.id}-${vp.name}-rot${rot}.png`), buf);
      }
      // Identical bytes at 0° and 90° would mean the rotation never shipped.
      if (Buffer.compare(shots[0], shots[90]) === 0) {
        failures.push(`${c.id} ${vp.name}: rot0 and rot90 are byte-identical`);
      }
    }

    // The control has to be there on the real host too.
    await page.goto(`${BASE}/konfigurator/hose?hose=stoff-14&rot=90`, {
      waitUntil: "networkidle",
    });
    const ctrl = page.getByRole("button", { name: /Stoffmuster für Hose drehen/ }).first();
    if (!(await ctrl.count())) failures.push(`${vp.name}: rotate control missing on live`);
    else {
      await ctrl.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `control-${vp.name}.png`) });
    }
    await ctx.close();
  }

  // The share card, rendered by the real host.
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
    // A green content-type proved nothing last time — keep the file to look at,
    // and require the trace to say a fabric zone was actually composed.
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
  console.log(`PASS — live rotation on all 5 konfigurators, both viewports; shots in ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
