// BIL-2528 — was kostet die Relief-Ebene WO?
//
// BIL-2527 hat `hose?hose=stoff-15&bund=sage` gegen `turban?turban=sage` gemessen
// und daraus "hose startet auf einem Stoff" gelesen. Das stimmt fuer diese URL,
// aber nicht fuer die Route: alle fuenf Konfiguratoren starten per Default auf
// UNI-Farben (hose: bund=petrol, hose=cream, buendchen=petrol), und die
// Relief-Ebene rendert ueberhaupt nur Zonen mit `textureSrc`. Auf der nackten
// Route hat sie also nichts zu tun.
//
// Diese Messung trennt beides sauber. Die staerkste Kontrolle ist nicht `turban`
// (andere Route, andere Assets, andere Zonenzahl), sondern **dieselbe Route mit
// und ohne Stoff** — gleiches Bundle, gleiches DOM, gleiche Bilder, einziger
// Unterschied ist die Query. `turban` laeuft als Anschluss an BIL-2527 mit.
//
// Zwei verschraenkte Runden, damit paralleler Maschinenlaerm alle Varianten
// gleich trifft, und weil eine einzelne LH-Runde auf dieser Seite bis zu 157 ms
// TBT Streuung zeigt (BIL-2526). Wer die Streuung nicht mitliefert, verkauft sie
// als Effekt.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../reports/bil2528/lh");
const LH =
  "C:/Users/Besitzer/AppData/Local/npm-cache/_npx/6ee2f8988123e994/node_modules/lighthouse/cli/index.js";

const VARIANTS = [
  // Der Einstieg, so wie ihn ein Besucher ueber Katalog/PDP bekommt.
  { name: "hose-default", url: "https://bilulu.de/konfigurator/hose" },
  // Exakt die URL aus BIL-2527 — der Deep-/Teilen-Link mit gewaehltem Stoff.
  { name: "hose-stoff", url: "https://bilulu.de/konfigurator/hose?hose=stoff-15&bund=sage" },
  // Anschluss an BIL-2527, damit die Zahlen dort vergleichbar bleiben.
  { name: "turban-uni", url: "https://bilulu.de/konfigurator/turban?turban=sage&schleife=cream" },
];
const ROUNDS = 2;

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

function metrics(j) {
  const a = j.audits;
  const work = a["mainthread-work-breakdown"]?.details?.items ?? [];
  const byGroup = Object.fromEntries(work.map((i) => [i.groupLabel, Math.round(i.duration)]));
  return {
    score: Math.round(j.categories.performance.score * 100),
    fcp: Math.round(a["first-contentful-paint"].numericValue),
    lcp: Math.round(a["largest-contentful-paint"].numericValue),
    tbt: Math.round(a["total-blocking-time"].numericValue),
    tti: Math.round(a["interactive"].numericValue),
    cls: Number(a["cumulative-layout-shift"].numericValue.toFixed(3)),
    scriptEval: byGroup["Script Evaluation"] ?? null,
    styleLayout: byGroup["Style & Layout"] ?? null,
    rendering: byGroup["Rendering"] ?? null,
    longTasks: (a["long-tasks"]?.details?.items ?? []).length,
  };
}

const rows = [];
for (let round = 1; round <= ROUNDS; round++) {
  for (const v of VARIANTS) {
    const file = resolve(OUT, `${v.name}-r${round}.json`);
    process.stderr.write(`run ${v.name} r${round} ...\n`);
    const j = await lh(v.url, file);
    const m = metrics(j);
    rows.push({ variant: v.name, round, url: v.url, ...m });
    process.stderr.write(
      `  score ${m.score} tbt ${m.tbt} tti ${m.tti} scriptEval ${m.scriptEval}\n`,
    );
  }
}

writeFileSync(resolve(OUT, "../summary.json"), JSON.stringify(rows, null, 2));

const keys = ["score", "fcp", "lcp", "tbt", "tti", "cls", "scriptEval", "styleLayout", "longTasks"];
const lines = ["| Variante | Runde | " + keys.join(" | ") + " |", "| --- |".repeat(keys.length + 3)];
for (const r of rows) lines.push(`| ${r.variant} | ${r.round} | ` + keys.map((k) => r[k]).join(" | ") + " |");
writeFileSync(resolve(OUT, "../summary.md"), lines.join("\n") + "\n");
process.stderr.write("\n" + lines.join("\n") + "\n");
