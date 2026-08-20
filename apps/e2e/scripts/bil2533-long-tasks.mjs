// BIL-2531 — dieselbe Messung wie bil2528-entry-vs-deeplink.mjs, nur nach
// reports/bil2531/. Der BIL-2528-Ordner ist der VORHER-Stand und wird hier
// nicht ueberschrieben, sonst gaebe es nachher nichts mehr zu vergleichen.
//
// Zusaetzlich zum Kennzahlen-Tisch zieht dieses Skript die Tabelle heraus, um
// die es im Ticket geht: die spaeten `Unattributable`-Long-Tasks (Start > 3 s).
// Genau die drei sollen weg sein. Und es prueft, was BIL-2528 gefunden hat —
// dass TTI auf die Millisekunde das Ende des letzten Long Task ist; bleibt die
// Differenz 0 und TTI faellt trotzdem nicht, ist die Attribution falsch und die
// Erwartung gehoert nicht nachjustiert, sondern die Ursache neu gesucht.
//
// Zwei verschraenkte Runden, weil eine einzelne Runde auf dieser Seite bis zu
// 157 ms TBT streut (BIL-2526) und der Live-TBT ueber den Tag um Faktor 2
// driftet. hose-default und turban-uni laufen als Kontrollen im selben Lauf:
// bewegen die sich mit, war es Maschinenlaerm und kein Effekt.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../reports/bil2533/lh");
// Version gepinnt wie in BIL-2528 — eine andere LH-Version aendert die Zahlen.
const LH =
  "C:/Users/Besitzer/AppData/Local/npm-cache/_npx/6ee2f8988123e994/node_modules/lighthouse/cli/index.js";

// BIL-2533 — die Seite, die sich geaendert hat, und zwei Kontrollen, die sich
// NICHT geaendert haben. Ohne die Kontrollen im selben Lauf ist jede Zahl hier
// nur Tagesform: der Live-TBT driftet ueber den Tag um Faktor 2 (BIL-2526).
//
// hose-kurz-uni ist der eigentliche Risikofall. Vor diesem Ticket malte die
// Relief-Ebene dort NICHTS — kein Zone hatte ein textureSrc, `key` war leer und
// der Effekt kehrte sofort zurueck. Jetzt malt sie alle drei Zonen. Wenn der
// BIL-2531-Stand irgendwo kippt, dann hier.
const VARIANTS = [
  { name: "hosekurz-stoff25", url: "https://bilulu.de/konfigurator/hose-kurz?hose=stoff-25" },
  { name: "hosekurz-uni", url: "https://bilulu.de/konfigurator/hose-kurz?hose=navy&bund=cream&buendchen=cream" },
  { name: "hose-stoff", url: "https://bilulu.de/konfigurator/hose?hose=stoff-15&bund=sage" },
  { name: "turban-uni", url: "https://bilulu.de/konfigurator/turban?turban=sage&schleife=cream" },
];
const ROUNDS = 2;
const LATE_MS = 3000;

mkdirSync(OUT, { recursive: true });

function lh(url, outPath) {
  const args = [
    LH, url,
    "--preset=perf",
    "--form-factor=mobile",
    "--screenEmulation.mobile",
    "--output=json",
    `--output-path=${outPath}`,
    "--chrome-flags=--headless=new --no-sandbox",
    "--quiet",
  ];
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, args, { stdio: ["ignore", "ignore", "ignore"] });
    // Exit-Code ist auf Windows kein Signal (chrome-launcher stirbt in destroyTmp
    // mit EPERM). Der Report ist der Beleg.
    p.on("exit", (code) => {
      try {
        const j = JSON.parse(readFileSync(outPath, "utf8"));
        if (j.categories?.performance?.score != null) return res(j);
      } catch {
        /* faellt durch */
      }
      rej(new Error(`exit ${code}, kein verwertbarer Report: ${outPath}`));
    });
  });
}

const rows = [];
const tasks = {};

for (let round = 1; round <= ROUNDS; round++) {
  for (const v of VARIANTS) {
    const key = `${v.name}-r${round}`;
    const file = resolve(OUT, `${key}.json`);
    process.stderr.write(`run ${key} ...\n`);
    const j = await lh(v.url, file);
    const a = j.audits;
    const longTasks = (a["long-tasks"]?.details?.items ?? []).map((i) => ({
      start: Math.round(i.startTime),
      dur: Math.round(i.duration),
      url: i.url,
    }));
    const lastEnd = longTasks.length
      ? Math.max(...longTasks.map((t) => t.start + t.dur))
      : 0;
    const late = longTasks.filter((t) => t.url === "Unattributable" && t.start > LATE_MS);
    const m = {
      variant: v.name,
      round,
      score: Math.round(j.categories.performance.score * 100),
      fcp: Math.round(a["first-contentful-paint"].numericValue),
      lcp: Math.round(a["largest-contentful-paint"].numericValue),
      tbt: Math.round(a["total-blocking-time"].numericValue),
      tti: Math.round(a["interactive"].numericValue),
      cls: Number(a["cumulative-layout-shift"].numericValue.toFixed(3)),
      lastLongTaskEnd: lastEnd,
      ttiMinusLastEnd: Math.round(a["interactive"].numericValue) - lastEnd,
      lateUnattributable: late.length,
      lateMs: late.reduce((s, t) => s + t.dur, 0),
      lateDurs: late.map((t) => t.dur).join(", ") || "—",
      // fetchTime, nicht der Dateiname: nur der belegt, welcher Lauf das war.
      fetchTime: j.fetchTime,
      lighthouseVersion: j.lighthouseVersion,
    };
    rows.push(m);
    tasks[key] = { url: v.url, fetchTime: j.fetchTime, longTasks };
    process.stderr.write(
      `  score ${m.score} tbt ${m.tbt} tti ${m.tti} lastLongTaskEnd ${m.lastEnd ?? lastEnd} ` +
        `spaete Unattributable ${m.lateUnattributable} (${m.lateDurs})\n`,
    );
  }
}

writeFileSync(resolve(OUT, "../summary.json"), JSON.stringify(rows, null, 2));
writeFileSync(resolve(OUT, "../long-tasks.json"), JSON.stringify(tasks, null, 2));

const keys = [
  "score", "fcp", "lcp", "tbt", "tti",
  "lastLongTaskEnd", "ttiMinusLastEnd", "lateUnattributable", "lateMs", "lateDurs",
];
const md = [
  "| Variante | Runde | " + keys.join(" | ") + " |",
  "|" + " --- |".repeat(keys.length + 2),
  ...rows.map((r) => `| ${r.variant} | ${r.round} | ` + keys.map((k) => r[k]).join(" | ") + " |"),
];
writeFileSync(resolve(OUT, "../summary.md"), md.join("\n") + "\n");
process.stderr.write("\n" + md.join("\n") + "\n");
