// BIL-2527 — A/B zweier lokaler Production-Builds, verschraenkt gemessen.
//
// Warum verschraenkt und nicht "erst alle base, dann alle cut":
// Die Jitter-Kontrolle aus BIL-2526 lag bei bis zu 157 ms TBT auf derselben
// URL. Ein Effekt unter dieser Streuung ist mit zwei Laeufen nicht zu belegen.
// Zwei Gegenmittel, beide noetig:
//   * mehrere Runden pro Variante -> Median statt Einzelwert,
//   * base und cut ABWECHSELND in derselben Runde -> was der Rechner gerade
//     sonst noch tut (andere Agenten bauen hier parallel), trifft beide gleich.
// Das ersetzt hier die "unveraenderte Kontrollseite": die Aenderung haengt im
// Root-Layout, es GIBT keine unveraenderte Seite im selben Build. Die
// unveraenderte Groesse ist stattdessen der Basis-Build selbst.
//
// `catalog` laeuft als Nicht-Konfigurator-Route mit: die Aenderung ist
// seitenweit, also muss sie dort denselben Ausschlag zeigen. Tut sie es nur auf
// dem Konfigurator, misst man etwas anderes als das, was man geaendert hat.
//
// Lighthouse-Version ist gepinnt (12.8.2) — 13.x gewichtet anders und waere
// gegen alle frueheren Zahlen dieses Tickets nicht vergleichbar.
// chrome-launcher stirbt auf Windows gern mit EPERM in destroyTmp und liefert
// Exit 1, obwohl der Lauf durch ist: der Report ist der Beleg, nicht der Code.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../reports/bil2527/ab");
const LH =
  "C:/Users/Besitzer/AppData/Local/npm-cache/_npx/6ee2f8988123e994/node_modules/lighthouse/cli/index.js";

const VARIANTS = [
  { label: "base", origin: "http://127.0.0.1:3271", buildId: process.env.BIL2527_BASE_BUILD },
  { label: "cut", origin: "http://127.0.0.1:3272", buildId: process.env.BIL2527_CUT_BUILD },
];

const ROUTES = [
  { name: "turban", path: "/konfigurator/turban?turban=sage&schleife=cream" },
  { name: "hose", path: "/konfigurator/hose?hose=stoff-15&bund=sage" },
  // `/catalog`, nicht `/katalog` — letzteres ist 404, und die 404-Seite
  // antwortet mit 200-artigem HTML, das man beim Vergleichen glatt fuer den
  // Katalog haelt. Einmal reingefallen, hier festgeschrieben.
  { name: "catalog", path: "/catalog" },
];

const ROUNDS = Number(process.env.BIL2527_ROUNDS ?? 3);

// Server-Besitz zuerst. Auf diesem Host laufen fremde next-start-Prozesse; ein
// Lauf gegen einen fremden Build sieht aus wie ein Ergebnis (BIL-2523).
for (const v of VARIANTS) {
  const html = await (await fetch(v.origin + "/katalog")).text();
  const id = (html.match(/buildId\\":\\"([^\\"]+)/) || [])[1];
  if (v.buildId && id !== v.buildId) {
    throw new Error(`${v.label}: BuildId ${id} != erwartet ${v.buildId} — fremder Server auf ${v.origin}`);
  }
  process.stderr.write(`${v.label} @ ${v.origin} buildId=${id} ok\n`);
}

mkdirSync(OUT, { recursive: true });

// Warmlaufen. Die Konfigurator-Routen sind `force-dynamic`; der allererste
// Treffer auf einen frisch gestarteten `next start` laedt die Route-Module
// nach und ist kein Bild des Produktionszustands (dort laeuft der Prozess seit
// Stunden). Genau ein solcher Kaltstart hat in der ersten Runde einen
// einmaligen CLS-Ausschlag erzeugt, der sich weder wiederholen noch mit einem
// PerformanceObserver reproduzieren liess. Beide Varianten bekommen dieselbe
// Behandlung, sonst waere es ein Vorteil fuer eine Seite.
for (const v of VARIANTS) {
  for (const r of ROUTES) {
    for (let i = 0; i < 2; i += 1) await (await fetch(v.origin + r.path)).text();
  }
}
process.stderr.write("warmup ok\n");

function lh(url, outPath) {
  const args = [
    LH,
    url,
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
  return {
    perf: Math.round(j.categories.performance.score * 100),
    fcp: Math.round(a["first-contentful-paint"].numericValue),
    lcp: Math.round(a["largest-contentful-paint"].numericValue),
    si: Math.round(a["speed-index"].numericValue),
    tbt: Math.round(a["total-blocking-time"].numericValue),
    cls: +a["cumulative-layout-shift"].numericValue.toFixed(3),
    tti: Math.round(a["interactive"].numericValue),
    docKiB: Math.round(
      (a["network-requests"].details.items.find((i) => i.resourceType === "Document")?.transferSize ?? 0) / 1024
    ),
  };
}

const rows = [];
for (let round = 1; round <= ROUNDS; round += 1) {
  for (const r of ROUTES) {
    for (const v of VARIANTS) {
      const tag = `${v.label}-${r.name}-r${round}`;
      process.stderr.write(`=== ${tag}\n`);
      // Ein einzelner gescheiterter Lauf darf die Serie nicht abbrechen —
      // sonst verliert man die schon gemessenen Runden. Genau einmal
      // nachfassen, danach die Zelle als fehlend fuehren.
      let j = null;
      for (let attempt = 1; attempt <= 2 && j === null; attempt += 1) {
        try {
          j = await lh(v.origin + r.path, resolve(OUT, tag + ".json"));
        } catch (err) {
          process.stderr.write(`    Versuch ${attempt} gescheitert: ${err.message}\n`);
        }
      }
      if (j === null) {
        process.stderr.write(`    ${tag} UEBERSPRUNGEN\n`);
        continue;
      }
      const m = metrics(j);
      rows.push({ round, route: r.name, variant: v.label, ...m });
      process.stderr.write(`    perf ${m.perf} fcp ${m.fcp} lcp ${m.lcp} tbt ${m.tbt} cls ${m.cls}\n`);
    }
  }
}

writeFileSync(resolve(OUT, "rows.json"), JSON.stringify(rows, null, 2));

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

const KEYS = ["perf", "fcp", "lcp", "si", "tbt", "cls", "tti", "docKiB"];
console.log(`\nMedian aus ${ROUNDS} verschraenkten Runden (Lighthouse 12.8.2, mobil):\n`);
console.log("| Route | Variante | " + KEYS.join(" | ") + " | Spannweite TBT |");
console.log("| --- |".repeat(KEYS.length + 3));
for (const r of ROUTES) {
  for (const v of VARIANTS) {
    const sel = rows.filter((x) => x.route === r.name && x.variant === v.label);
    const tbts = sel.map((x) => x.tbt);
    const cells = KEYS.map((k) => median(sel.map((x) => x[k])));
    console.log(
      `| ${r.name} | ${v.label} | ${cells.join(" | ")} | ${Math.min(...tbts)}..${Math.max(...tbts)} |`
    );
  }
}

console.log("\nDelta cut - base (Median):\n");
console.log("| Route | Perf | FCP | LCP | TBT | CLS | Dokument |");
console.log("| --- | --- | --- | --- | --- | --- | --- |");
for (const r of ROUTES) {
  const g = (v, k) => median(rows.filter((x) => x.route === r.name && x.variant === v).map((x) => x[k]));
  const d = (k, unit = " ms") => {
    const x = g("base", k);
    const y = g("cut", k);
    const diff = y - x;
    return `${x} -> ${y} (${diff > 0 ? "+" : ""}${diff}${unit})`;
  };
  console.log(
    `| ${r.name} | ${d("perf", "")} | ${d("fcp")} | ${d("lcp")} | ${d("tbt")} | ${d("cls", "")} | ${d("docKiB", " KiB")} |`
  );
}
