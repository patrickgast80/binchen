/**
 * BIL-2494 — LCP/CLS on a gallery PDP vs. a single-image PDP.
 *
 * No Lighthouse binary in this checkout, so we measure the two metrics this
 * change actually puts at risk: LCP (the gallery keeps every image mounted) and
 * CLS (the new thumbnail rail). Mobile viewport, 4x CPU + Fast-3G throttling.
 *
 *   node scripts/bil2494-perf.mjs [baseUrl]
 */
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:3007";
const TARGETS = [
  ["gallery-3-images", "prod_01KZ0VZMJWFC9Z00XVNDFYZ6M2"],
  ["single-image", "prod_01KZ0VZSWB1BA91FBFGKDY6QKV"],
];

const COLLECT = `
new Promise((resolve) => {
  let lcp = 0, lcpEl = "", cls = 0;
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) { lcp = e.startTime; lcpEl = e.element?.getAttribute("alt") ?? e.element?.tagName ?? ""; }
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) cls += e.value;
  }).observe({ type: "layout-shift", buffered: true });
  setTimeout(() => resolve({ lcp: Math.round(lcp), lcpEl, cls: +cls.toFixed(4) }), 6000);
})`;

const browser = await chromium.launch();
for (const [label, id] of TARGETS) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await page.goto(`${BASE}/product/${id}`, { waitUntil: "commit" });
  const m = await page.evaluate(COLLECT);
  console.log(`${label.padEnd(18)} LCP ${String(m.lcp).padStart(5)} ms  CLS ${m.cls}  (LCP-Element: ${m.lcpEl})`);
  await context.close();
}
await browser.close();
