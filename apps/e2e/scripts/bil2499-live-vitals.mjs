/**
 * BIL-2499 — Core Web Vitals for the new konfigurator on live, measured on a
 * throttled mobile profile.
 *
 * This is deliberately NOT a full Lighthouse run: `lighthouse` is not a
 * dependency of this workspace, and installing one ad-hoc into a checkout that
 * other agents are building in has bitten us before. LCP and CLS are the two
 * numbers the frontend bar actually names, and both come straight from the
 * browser's own PerformanceObserver, so no extra dependency is needed.
 *
 * A control URL is measured in the same run: without one, a slow number says
 * nothing about whether THIS route regressed or the box/network was just busy.
 *
 *   node apps/e2e/scripts/bil2499-live-vitals.mjs [baseUrl]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "https://bilulu.de";
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../reports/bil2499", BASE.includes("bilulu.de") ? "live" : "local");
await mkdir(OUT, { recursive: true });

const ROUTES = [
  { name: "hose-kurz (new)", url: `${BASE}/konfigurator/hose-kurz` },
  { name: "hose (control, unchanged)", url: `${BASE}/konfigurator/hose` },
];

/** Moto-G-class throttling, matching Lighthouse's mobile preset closely enough
 *  to be comparable between the two routes. */
const CPU_THROTTLE = 4;
const NET = { downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 150 };

const browser = await chromium.launch();
const results = [];

for (const route of ROUTES) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  // Returning visitor: the consent banner is not part of what we are measuring.
  await ctx.addInitScript(() => {
    localStorage.setItem(
      "bilulu_cookie_consent_v1",
      JSON.stringify({
        version: "1",
        decidedAt: "2026-08-18T00:00:00.000Z",
        categories: { strict: true, functional: true, analytics: false, marketing: false },
      }),
    );
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, ...NET });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });

  await page.addInitScript(() => {
    window.__lcp = 0;
    window.__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });

  await page.goto(route.url, { waitUntil: "load", timeout: 120_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  // Settle window: late-arriving images are exactly what would move LCP/CLS.
  await page.waitForTimeout(4000);

  const v = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] ?? {};
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null;
    return { lcp: window.__lcp, cls: window.__cls, fcp, ttfb: nav.responseStart ?? null };
  });
  results.push({
    route: route.name,
    url: route.url,
    lcpMs: Math.round(v.lcp),
    cls: Number(v.cls.toFixed(4)),
    fcpMs: v.fcp === null ? null : Math.round(v.fcp),
    ttfbMs: v.ttfb === null ? null : Math.round(v.ttfb),
  });
  await ctx.close();
}

await browser.close();
const report = { base: BASE, profile: { cpuThrottle: CPU_THROTTLE, network: "~1.6Mbit/150ms" }, results };
await writeFile(path.join(OUT, "vitals.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

const target = results[0];
const problems = [];
if (target.lcpMs > 2500) problems.push(`LCP ${target.lcpMs}ms > 2500ms`);
if (target.cls > 0.1) problems.push(`CLS ${target.cls} > 0.1`);
if (problems.length) {
  console.error(`FAIL — ${problems.join("; ")}`);
  process.exit(1);
}
console.log(`PASS — LCP ${target.lcpMs}ms, CLS ${target.cls} on throttled mobile.`);
