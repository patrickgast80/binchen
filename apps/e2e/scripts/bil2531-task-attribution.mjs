// BIL-2531 — WO kommen die drei spaeten Long Tasks wirklich her?
//
// Nach dem Scheiben der vier Auf-/Abbauschritte (main@97a4250) sind die drei
// spaeten `Unattributable`-Bloecke kuerzer (251/161/130 -> ~116/86/80 ms), aber
// sie sind nicht weg. Das Ticket sagt dazu klipp und klar: dann die Attribution
// mit einem Performance-Profil nachweisen, statt die Erwartung nachzujustieren.
//
// Genau das macht dieses Skript. Es ist KEINE Lighthouse-Messung, sondern ein
// echter Chrome-Trace ueber CDP mit denselben 4x CPU-Drosselung, die Lighthouse
// fahrt. Ausgewertet werden die Top-Level-`RunTask`-Events des Renderer-Main-
// Threads: jedes >50 ms nach LATE_MS, mit der Aufschluesselung seiner
// Kind-Events nach Selbstzeit. Ein Task, dessen Selbstzeit in `Decode Image` /
// `Draw` / `ImageDecodeTask` steckt, ist keine Malschleife.
//
// Aufruf:  node scripts/bil2531-task-attribution.mjs [url] [label]
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../reports/bil2531");
mkdirSync(OUT, { recursive: true });

const URL_ = process.argv[2] ?? "https://bilulu.de/konfigurator/hose?hose=stoff-15&bund=sage";
const LABEL = process.argv[3] ?? "trace";
// Ohne Netz-Drosselung liegt hier alles frueher als im Lighthouse-Lauf, also ist
// der 3-s-Schnitt aus dem Ticket kein sinnvoller Filter. Beide Grenzen sind
// deshalb Argumente; der Beleg ist nicht "spaet", sondern "genau diese Arbeit".
const LATE_MS = Number(process.argv[4] ?? 0);
const LONG_MS = Number(process.argv[5] ?? 50);

const CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "disabled-by-default-devtools.timeline.stack",
  "blink.user_timing",
  "latencyInfo",
  "v8.execute",
];

const browser = await chromium.launch();
// Lighthouse mobile: Moto-G-Klasse, 412x823 @ DPR 1.75 (siehe BIL-2529 —
// eine andere Viewport-Groesse trifft andere Umbrueche und andere Arbeit).
const ctx = await browser.newContext({
  viewport: { width: 412, height: 823 },
  deviceScaleFactor: 1.75,
  isMobile: true,
  hasTouch: true,
});
await ctx.addInitScript(() => {
  try {
    window.localStorage.setItem(
      "bilulu_cookie_consent_v1",
      JSON.stringify({
        version: "1",
        decidedAt: "2026-01-01T00:00:00.000Z",
        categories: { strict: true, functional: false, analytics: false, marketing: false },
      }),
    );
  } catch {
    /* egal */
  }
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);

// Dieselbe Drosselung wie im Lighthouse-Lauf. Ohne sie liegt kein einziger Task
// ueber 50 ms und das Profil beweist nichts ueber die gemessene Seite.
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

const events = [];
cdp.on("Tracing.dataCollected", (e) => events.push(...e.value));
const done = new Promise((res) => cdp.once("Tracing.tracingComplete", res));

await cdp.send("Tracing.start", {
  transferMode: "ReportEvents",
  traceConfig: { includedCategories: CATEGORIES, recordMode: "recordAsMuchAsPossible" },
});

await page.goto(URL_, { waitUntil: "load", timeout: 90000 });
// Bis das Relief wirklich sichtbar ist — vorher ist die Arbeit nicht gelaufen.
const visibleAt = await page.evaluate(async () => {
  const t0 = performance.now();
  while (performance.now() - t0 < 60000) {
    const c = document.querySelector('canvas[aria-hidden="true"]');
    if (c && getComputedStyle(c).opacity === "1") return Math.round(performance.now() - t0);
    await new Promise((r) => setTimeout(r, 25));
  }
  return null;
});
await page.waitForTimeout(1500);
await cdp.send("Tracing.end");
await done;
await browser.close();

if (visibleAt === null) {
  console.log("WARNUNG: Relief-Canvas wurde nie sichtbar — Profil misst die falsche Sache.");
}

// --- Auswertung -----------------------------------------------------------
// navigationStart als Nullpunkt, damit die Zahlen mit Lighthouse vergleichbar
// sind (dort ist der Long-Task-`startTime` ebenfalls seit Navigationsbeginn).
const nav = events.find(
  (e) => e.name === "navigationStart" && e.args?.data?.documentLoaderURL === URL_,
) ?? events.find((e) => e.name === "navigationStart");
if (!nav) throw new Error("kein navigationStart im Trace");
const T0 = nav.ts;
const PID = nav.pid;
const TID = nav.tid;

// Nur der Renderer-Main-Thread dieses Dokuments; ein anderer Thread erklaert
// keinen Long Task auf diesem hier.
const main = events
  .filter((e) => e.pid === PID && e.tid === TID && (e.ph === "X" || e.ph === "B" || e.ph === "E"))
  .sort((a, b) => a.ts - b.ts || (a.ph === "E" ? -1 : 1));

// B/E-Paare zu X-artigen Intervallen zusammenziehen, damit ein einziger
// Durchlauf reicht.
const stack = [];
const spans = [];
for (const e of main) {
  if (e.ph === "X") spans.push({ name: e.name, ts: e.ts, dur: e.dur ?? 0, args: e.args });
  else if (e.ph === "B") stack.push(e);
  else if (e.ph === "E") {
    const b = stack.pop();
    if (b) spans.push({ name: b.name, ts: b.ts, dur: e.ts - b.ts, args: b.args });
  }
}
spans.sort((a, b) => a.ts - b.ts || b.dur - a.dur);

const tasks = spans
  .filter((s) => s.name === "RunTask" && s.dur / 1000 > LONG_MS && (s.ts - T0) / 1000 > LATE_MS)
  .map((s) => ({ start: Math.round((s.ts - T0) / 1000), dur: Math.round(s.dur / 1000), ts: s.ts, end: s.ts + s.dur }));

function breakdown(task) {
  // Selbstzeit je Event-Name: Dauer des Events minus Dauer seiner direkten
  // Kinder. Das ist die Zahl, die sagt, WO die Zeit wirklich verbraucht wurde.
  const inside = spans.filter((s) => s.ts >= task.ts && s.ts + s.dur <= task.end && s.dur > 0);
  const self = new Map();
  for (const s of inside) {
    let childSum = 0;
    let last = s.ts;
    for (const c of inside) {
      if (c === s) continue;
      if (c.ts >= s.ts && c.ts + c.dur <= s.ts + s.dur && c.ts >= last) {
        childSum += c.dur;
        last = c.ts + c.dur;
      }
    }
    // Bei Decode-Events haengt die halbe Aussage am Bild: "89 ms Decode Image"
    // erklaert nichts, "89 ms Decode Image relief.webp" schon.
    const url =
      s.args?.data?.url ?? s.args?.data?.imageUrl ?? s.args?.imageUrl ?? s.args?.data?.srcUrl;
    const key = url
      ? `${s.name} ${String(url).split("?")[0].split("/").slice(-2).join("/")}`
      : s.name;
    self.set(key, (self.get(key) ?? 0) + Math.max(0, s.dur - childSum));
  }
  return [...self.entries()]
    .map(([name, us]) => ({ name, ms: Math.round(us / 1000) }))
    .filter((x) => x.ms >= 5)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 6);
}

const report = tasks.map((t) => ({ ...t, top: breakdown(t) }));
writeFileSync(
  resolve(OUT, `${LABEL}-attribution.json`),
  JSON.stringify({ url: URL_, visibleAt, tasks: report }, null, 2),
);

console.log(`\n${URL_}`);
console.log(`Relief sichtbar nach ${visibleAt} ms; Tasks >${LONG_MS} ms ab ${LATE_MS} ms:\n`);
for (const t of report) {
  console.log(`  start ${t.start} ms   dur ${t.dur} ms`);
  for (const x of t.top) console.log(`      ${String(x.ms).padStart(4)} ms  ${x.name}`);
}
if (!report.length) console.log("  (keine)");
