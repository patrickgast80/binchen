// BIL-2529 — die Sonde, die den Shift tatsaechlich trifft.
//
// Die Vorgaengerin (`bil2527-cls-probe.mjs`) meldete auf beiden Varianten 0
// Verschiebungen, obwohl Lighthouse im selben Zeitraum bis 0,244 mass. Der
// Unterschied lag NICHT am Beobachter, sondern an der Drosselung:
//
//   Lighthouse `mobileSlow4G` (devtools-Throttling, so laufen alle Reports
//   dieses Tickets) setzt `requestLatencyMs = rttMs * 3.75 = 562,5 ms`.
//   Die alte Sonde setzte 150 ms — den rtt-Wert, nicht die daraus abgeleitete
//   Request-Latenz. Bei 150 ms ist das Dokument fertig gestreamt, bevor der
//   erste Frame faellt; genau das Fenster, in dem der Shift entsteht, gab es
//   dort also gar nicht.
//
// Zweiter Unterschied: Viewport. Lighthouse mobil emuliert 412x823 bei DPR
// 1.75 — die Rechtecke in den Reports sind 412 breit. Die alte Sonde mass
// 390x844. Andere Breite = andere Textumbrueche = andere Endhoehen.
//
// Die Sonde protokolliert zweierlei, weil eines allein nicht reicht:
//   * `layout-shift`-Entries mit `previousRect`/`currentRect` (das WAS),
//   * eine rAF-Schleife ueber die beiden fixed-bottom-Kandidaten, die nur
//     AENDERUNGEN der Hoehe/Oberkante loggt (das WARUM: `dh` und `dy` mit
//     gleichem Betrag und umgekehrtem Vorzeichen = "waechst nach oben").
//
// Aufruf: node bil2529-shift-probe.mjs <label>=<origin> [<label>=<origin> …]
//   BIL2529_RUNS   Wiederholungen je Variante (Default 6)
//   BIL2529_PATH   Route (Default turban)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../reports/bil2529", process.env.BIL2529_TAG || "probe");
const RUNS = Number(process.env.BIL2529_RUNS ?? 6);
const PATH = process.env.BIL2529_PATH || "/konfigurator/turban?turban=sage&schleife=cream";

const VARIANTS = process.argv.slice(2).map((raw) => {
  const at = raw.indexOf("=");
  return { label: raw.slice(0, at), origin: raw.slice(at + 1) };
});
if (!VARIANTS.length) throw new Error("Aufruf: node bil2529-shift-probe.mjs <label>=<origin> …");

// Lighthouse `mobileSlow4G`, devtools-Throttling — 1:1 aus
// lighthouse/core/config/constants.js.
const LH_LATENCY_MS = Number(process.env.BIL2529_LATENCY_MS ?? 562.5);
// BIL2529_KBPS senkt die Bandbreite unter den Lighthouse-Wert. Das ist KEINE
// Lighthouse-vergleichbare Messung mehr, sondern das Gegenteil: der Shift
// haengt daran, dass der Browser malt, WAEHREND das Banner-Markup noch
// unterwegs ist. Bei 1474 kbps faellt das in ungefaehr jedem zwoelften Lauf,
// bei 400 kbps in jedem. So wird aus einem Zufallsfund ein Experiment, das
// vorher/nachher belegt — die Abnahme laeuft danach trotzdem mit den echten
// Lighthouse-Werten.
const LH_DOWN_KBPS = Number(process.env.BIL2529_KBPS ?? 1474.56);
const LH_UP_KBPS = 675;
const LH_CPU_RATE = 4;
// Lighthouse mobil: Moto G Power.
const LH_VIEWPORT = { width: 412, height: 823 };
const LH_DPR = 1.75;
const LH_UA =
  "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";

const WATCH = [
  { key: "sheet", selector: '[aria-label="Farbauswahl-Panel"]' },
  { key: "cookie", selector: "#cookie-consent" },
];

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const out = [];

for (let run = 1; run <= RUNS; run += 1) {
  for (const v of VARIANTS) {
    const ctx = await browser.newContext({
      viewport: LH_VIEWPORT,
      deviceScaleFactor: LH_DPR,
      isMobile: true,
      hasTouch: true,
      userAgent: LH_UA,
    });
    const page = await ctx.newPage();
    await page.addInitScript(
      ({ watch }) => {
        window.__shifts = [];
        window.__timeline = [];
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            if (e.hadRecentInput) continue;
            window.__shifts.push({
              value: e.value,
              startTime: Math.round(e.startTime),
              sources: (e.sources || []).map((s) => ({
                tag: s.node ? s.node.nodeName : "?",
                cls: s.node?.className ? String(s.node.className).slice(0, 70) : "",
                id: s.node ? s.node.id : "",
                prev: s.previousRect
                  ? [s.previousRect.y, s.previousRect.height].map(Math.round)
                  : null,
                next: s.currentRect ? [s.currentRect.y, s.currentRect.height].map(Math.round) : null,
              })),
            });
          }
        }).observe({ type: "layout-shift", buffered: true });

        // Nur AENDERUNGEN loggen, sonst ertrinkt der Verlauf in Wiederholungen.
        const last = {};
        const tick = () => {
          for (const w of watch) {
            const el = document.querySelector(w.selector);
            if (!el) continue;
            const r = el.getBoundingClientRect();
            const sig = `${Math.round(r.top)}/${Math.round(r.height)}`;
            if (last[w.key] !== sig) {
              last[w.key] = sig;
              window.__timeline.push({
                key: w.key,
                t: Math.round(performance.now()),
                top: Math.round(r.top),
                h: Math.round(r.height),
              });
            }
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { watch: WATCH },
    );

    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: LH_CPU_RATE });
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: LH_LATENCY_MS,
      downloadThroughput: (LH_DOWN_KBPS * 1024) / 8,
      uploadThroughput: (LH_UP_KBPS * 1024) / 8,
    });

    await page.goto(v.origin + PATH, { waitUntil: "load", timeout: 120_000 });
    await page.waitForTimeout(5000);
    const { shifts, timeline } = await page.evaluate(() => ({
      shifts: window.__shifts,
      timeline: window.__timeline,
    }));
    const total = shifts.reduce((n, s) => n + s.value, 0);
    out.push({ run, variant: v.label, total, shifts, timeline });

    console.log(`r${run} ${v.label}  CLS ${total.toFixed(4)}  (${shifts.length} Verschiebungen)`);
    for (const s of shifts) {
      console.log(`   ${s.value.toFixed(4)} @ ${s.startTime}ms`);
      for (const src of s.sources) {
        console.log(
          `        <${src.tag}${src.id ? " id=" + src.id : ""} class="${src.cls}">  ` +
            `[y,h] ${JSON.stringify(src.prev)} -> ${JSON.stringify(src.next)}`,
        );
      }
    }
    for (const w of WATCH) {
      const line = timeline
        .filter((t) => t.key === w.key)
        .map((t) => `${t.t}ms top=${t.top} h=${t.h}`)
        .join("  |  ");
      if (line) console.log(`   ${w.key}: ${line}`);
    }
    await ctx.close();
  }
}

await browser.close();
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/probe.json`, JSON.stringify(out, null, 2));

const per = {};
for (const r of out) {
  per[r.variant] ??= { runs: 0, hits: 0, max: 0 };
  per[r.variant].runs += 1;
  if (r.total > 0) per[r.variant].hits += 1;
  per[r.variant].max = Math.max(per[r.variant].max, r.total);
}
console.log("\n=== Zusammenfassung");
for (const [k, s] of Object.entries(per)) {
  console.log(`${k.padEnd(10)} ${s.runs} Laeufe, ${s.hits} mit Shift, max ${s.max.toFixed(4)}`);
}
