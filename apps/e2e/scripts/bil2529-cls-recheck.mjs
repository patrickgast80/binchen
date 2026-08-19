// BIL-2529 — haelt die Sheet-Hoehen-Reservierung aus BIL-2526 (`main@743ad96`)
// den CLS live auf 0?
//
// Der Verursacher ist bekannt und steht im Report: `audits['layout-shifts']`
// gehoert zum `perf`-Preset dazu (anders als `layout-shift-elements`) und nennt
// das Element direkt — hier das Mobil-Palette-Sheet, das beim HTML-Streaming
// nach oben waechst.
//
// Wiederholungslaeufe sind der Punkt: der Ausschlag fiel in ungefaehr jedem
// zweiten Lauf. Zwei gruene Laeufe beweisen bei einem 50-%-Fehler nichts — die
// Chance, ihn zufaellig zu verpassen, liegt bei 25 %.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const LH =
  "C:/Users/Besitzer/AppData/Local/npm-cache/_npx/6ee2f8988123e994/node_modules/lighthouse/cli/index.js";
const URLS = {
  hose: "https://bilulu.de/konfigurator/hose?hose=stoff-15&bund=sage",
  turban: "https://bilulu.de/konfigurator/turban?turban=sage&schleife=cream",
};
const ROUNDS = Number(process.env.BIL2529_ROUNDS ?? 3);
const OUT = "apps/e2e/reports/bil2529";
mkdirSync(OUT, { recursive: true });

// Gate: ohne die Hoehenreservierung im Dokument misst man den alten Build.
const html = await (await fetch(URLS.hose)).text();
if (!/aria-label="Farbauswahl-Panel"[^>]*style="min-height/.test(html)) {
  throw new Error("Sheet-Hoehe steht nicht im Dokument — alter Build, nicht messen.");
}
process.stderr.write("Gate ok: min-height am Sheet vorhanden\n");

function lh(url, outPath) {
  return new Promise((res) => {
    const p = spawn(
      process.execPath,
      [LH, url, "--preset=perf", "--form-factor=mobile", "--screenEmulation.mobile",
        "--output=json", `--output-path=${outPath}`,
        "--chrome-flags=--headless=new --no-sandbox", "--quiet"],
      { stdio: "ignore" }
    );
    p.on("exit", () => {
      try {
        res(JSON.parse(readFileSync(outPath, "utf8")));
      } catch {
        res(null);
      }
    });
  });
}

const rows = [];
for (let i = 1; i <= ROUNDS; i += 1) {
  for (const [name, url] of Object.entries(URLS)) {
    const j = await lh(url, `${OUT}/${name}-r${i}.json`);
    if (!j) {
      console.log(`${name} r${i} FEHLER`);
      continue;
    }
    const cls = j.audits["cumulative-layout-shift"].numericValue;
    const items = j.audits["layout-shifts"]?.details?.items ?? [];
    const culprit = items[0]?.node?.snippet?.slice(0, 70) ?? "";
    rows.push({ route: name, round: i, cls: +cls.toFixed(4),
      perf: Math.round(j.categories.performance.score * 100),
      tbt: Math.round(j.audits["total-blocking-time"].numericValue), culprit });
    console.log(
      `${name.padEnd(7)} r${i}  CLS ${cls.toFixed(4)}  perf ${rows.at(-1).perf}  TBT ${rows.at(-1).tbt}` +
        (culprit ? `  <- ${culprit}` : "")
    );
  }
}

writeFileSync(`${OUT}/rows.json`, JSON.stringify(rows, null, 2));
const bad = rows.filter((r) => r.cls > 0.01);
console.log(
  bad.length
    ? `VERDIKT: ${bad.length}/${rows.length} Laeufe mit CLS > 0,01 — Restbefund bleibt`
    : `VERDIKT: OK — ${rows.length}/${rows.length} Laeufe CLS <= 0,01`
);
