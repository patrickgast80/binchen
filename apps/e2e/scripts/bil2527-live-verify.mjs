// BIL-2527 — Live-Nachmessung nach dem Deploy.
//
// Gemessen wird gegen `reports/bil2526/live2` — gleiche Lighthouse-Version
// (12.8.2), gleiche Flags, gleiche URLs. Alles andere waere kein Vergleich.
//
// Die Jitter-Kontrolle laeuft mit, weil sie in BIL-2526 auf derselben URL bis
// zu 157 ms TBT Streuung gezeigt hat. Wer die Streuung nicht mitliefert,
// verkauft sie als Effekt. `catalog`, `checkout` und `home` sind hier keine
// Beiwerk-Zeilen: die Aenderung haengt im Root-Layout, sie MUSS dort denselben
// Byte-Ausschlag zeigen. Tut sie es nur auf dem Konfigurator, misst man etwas
// anderes als das, was man geaendert hat.
//
// Deploy-Gate: solange das Dokument die CSS-Kopie im Flight-Payload traegt,
// laeuft der alte Build. Dann NICHT messen — eine Messung gegen den alten Build
// sieht aus wie "kein Effekt" und ist der teuerste stille Fehlschluss hier.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../reports/bil2527/live");
const BEFORE_DIR = resolve(HERE, "../reports/bil2526/live2");
const LH =
  "C:/Users/Besitzer/AppData/Local/npm-cache/_npx/6ee2f8988123e994/node_modules/lighthouse/cli/index.js";

const RUNS = [
  { name: "turban", url: "https://bilulu.de/konfigurator/turban?turban=sage&schleife=cream" },
  { name: "turban-jitter", url: "https://bilulu.de/konfigurator/turban?turban=sage&schleife=cream" },
  { name: "hose", url: "https://bilulu.de/konfigurator/hose?hose=stoff-15&bund=sage" },
  { name: "hose-jitter", url: "https://bilulu.de/konfigurator/hose?hose=stoff-15&bund=sage" },
  { name: "catalog", url: "https://bilulu.de/catalog" },
  { name: "checkout", url: "https://bilulu.de/checkout" },
  { name: "home", url: "https://bilulu.de/" },
];

const CSS_IN_FLIGHT = /__next_f\.push\(\[1,"\*,:after,:before\{/;

const gateHtml = await (await fetch("https://bilulu.de/")).text();
if (CSS_IN_FLIGHT.test(gateHtml)) {
  throw new Error("Deploy noch nicht durch: CSS steht weiterhin im Flight-Payload. Nicht messen.");
}
if (!/<style[^>]*data-href="bilulu-globals"/.test(gateHtml)) {
  throw new Error("Deploy-Gate: kein Inline-<style> im Dokument — das waere ein Rueckschritt hinter BIL-2526.");
}
process.stderr.write("Deploy-Gate ok: Inline-<style> da, Flight-Kopie weg\n");

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
    // Exit-Code ist auf Windows kein Signal (chrome-launcher stirbt in
    // destroyTmp mit EPERM). Der Report ist der Beleg.
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
  const doc = a["network-requests"].details.items.find((i) => i.resourceType === "Document");
  return {
    perf: Math.round(j.categories.performance.score * 100),
    fcp: Math.round(a["first-contentful-paint"].numericValue),
    lcp: Math.round(a["largest-contentful-paint"].numericValue),
    si: Math.round(a["speed-index"].numericValue),
    tbt: Math.round(a["total-blocking-time"].numericValue),
    cls: +a["cumulative-layout-shift"].numericValue.toFixed(3),
    tti: Math.round(a.interactive.numericValue),
    docKiB: Math.round(((doc?.transferSize ?? 0) / 1024) * 10) / 10,
  };
}

function before(name) {
  try {
    return metrics(JSON.parse(readFileSync(resolve(BEFORE_DIR, name + ".json"), "utf8")));
  } catch {
    return null;
  }
}

const rows = [];
for (const r of RUNS) {
  process.stderr.write(`=== ${r.name}\n`);
  let j = null;
  for (let attempt = 1; attempt <= 2 && j === null; attempt += 1) {
    try {
      j = await lh(r.url, resolve(OUT, r.name + ".json"));
    } catch (err) {
      process.stderr.write(`    Versuch ${attempt}: ${err.message}\n`);
    }
  }
  if (!j) {
    process.stderr.write(`    ${r.name} UEBERSPRUNGEN\n`);
    continue;
  }
  const m = metrics(j);
  rows.push({ name: r.name, ...m });
  process.stderr.write(`    perf ${m.perf} fcp ${m.fcp} lcp ${m.lcp} tbt ${m.tbt} cls ${m.cls} doc ${m.docKiB}KiB\n`);
}

writeFileSync(resolve(OUT, "rows.json"), JSON.stringify(rows, null, 2));

console.log("\n| Route | Perf | FCP | LCP | SpeedIndex | TBT | CLS | TTI | Dokument |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const r of rows) {
  console.log(
    `| ${r.name} | ${r.perf} | ${r.fcp} ms | ${r.lcp} ms | ${r.si} ms | ${r.tbt} ms | ${r.cls} | ${r.tti} ms | ${r.docKiB} KiB |`
  );
}

console.log("\nGegen BIL-2526 (`reports/bil2526/live2`, gleiche LH-Version und Flags):\n");
console.log("| Route | Perf | FCP | LCP | TBT | CLS | Dokument |");
console.log("| --- | --- | --- | --- | --- | --- | --- |");
for (const r of rows) {
  const b = before(r.name);
  if (!b) continue;
  const d = (k, unit = " ms") => {
    const diff = r[k] - b[k];
    return `${b[k]} -> ${r[k]} (${diff > 0 ? "+" : ""}${Math.round(diff * 10) / 10}${unit})`;
  };
  console.log(
    `| ${r.name} | ${d("perf", "")} | ${d("fcp")} | ${d("lcp")} | ${d("tbt")} | ${d("cls", "")} | ${d("docKiB", " KiB")} |`
  );
}
