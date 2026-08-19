// BIL-2527 — wer verschiebt sich, und wann?
//
// Der A/B-Lauf meldete auf `turban` CLS 0 (base) gegen 0,244 (cut). Der
// Lighthouse-`perf`-Preset laesst `layout-shift-elements` weg, der Report sagt
// also nur DASS, nicht WAS. Hier haengt ein PerformanceObserver auf
// `layout-shift` und protokolliert die `sources` mit — inklusive vorher/nachher
// Rechteck, denn die Richtung der Verschiebung sagt meist schon, wer schuld
// ist.
//
// Wichtig: KEIN Consent vorsetzen. Lighthouse laeuft mit frischem Profil und
// sieht den Cookie-Banner; wer ihn hier wegklickt, misst eine andere Seite als
// die, die den Ausschlag erzeugt hat.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const targets = process.argv.slice(2).map((raw) => {
  const [label, origin] = raw.split("=");
  return { label, origin };
});
const PATH = process.env.BIL2527_PATH || "/konfigurator/turban?turban=sage&schleife=cream";

const browser = await chromium.launch();
const out = [];

for (const t of targets) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__shifts = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__shifts.push({
          value: e.value,
          startTime: e.startTime,
          sources: (e.sources || []).map((s) => ({
            tag: s.node ? s.node.nodeName : "?",
            cls: s.node && s.node.className ? String(s.node.className).slice(0, 90) : "",
            id: s.node ? s.node.id : "",
            prev: s.previousRect ? [s.previousRect.x, s.previousRect.y, s.previousRect.width, s.previousRect.height] : null,
            next: s.currentRect ? [s.currentRect.x, s.currentRect.y, s.currentRect.width, s.currentRect.height] : null,
          })),
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });

  // CPU/Netz drosseln wie Lighthouse mobil, sonst verschwindet der Effekt in
  // der Geschwindigkeit des Entwicklerrechners.
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1474 * 1024) / 8,
    uploadThroughput: (675 * 1024) / 8,
  });

  await page.goto(t.origin + PATH, { waitUntil: "load", timeout: 90_000 });
  await page.waitForTimeout(4000);
  const shifts = await page.evaluate(() => window.__shifts);
  const total = shifts.reduce((n, s) => n + s.value, 0);
  out.push({ variant: t.label, total, shifts });

  console.log(`=== ${t.label}  CLS ${total.toFixed(4)}  (${shifts.length} Verschiebungen)`);
  for (const s of shifts) {
    console.log(`   ${s.value.toFixed(4)} @ ${Math.round(s.startTime)}ms`);
    for (const src of s.sources) {
      console.log(
        `        <${src.tag}${src.id ? " id=" + src.id : ""} class="${src.cls}">  ` +
          `${JSON.stringify(src.prev)} -> ${JSON.stringify(src.next)}`
      );
    }
  }
  await ctx.close();
}

await browser.close();
mkdirSync("apps/e2e/reports/bil2527", { recursive: true });
writeFileSync("apps/e2e/reports/bil2527/cls-probe.json", JSON.stringify(out, null, 2));
