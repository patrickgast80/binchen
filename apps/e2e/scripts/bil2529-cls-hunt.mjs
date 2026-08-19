// BIL-2529 — Wiederholungslaeufe gegen den sporadischen Layout-Shift.
//
// Der Fehler faellt in ungefaehr jedem zweiten Lauf. Zwei gruene Laeufe sind
// deshalb kein Beleg (25 % Zufallschance, ihn zu verpassen); ab sechs sind es
// unter 2 %. Dieses Skript ist beides: die Reproduktion (vorher) und der
// Beweis (nachher).
//
// Warum Lighthouse und keine eigene Sonde: der `layout-shifts`-Audit IST im
// `--preset=perf`-Report enthalten (das Ticket vermutete das Gegenteil, weil
// der frueher `layout-shift-elements` hiess). Er nennt Element, Snippet und
// Score. Damit sagt der Report nicht nur DASS, sondern auch WAS — die
// Verdaechtigen muessen nicht geraten werden.
//
// Mehrere Origins werden ABWECHSELND gemessen (base, cut, base, cut, …), damit
// Fremdlast auf diesem Host — hier bauen andere Agenten parallel — beide
// Varianten gleich trifft.
//
// Lighthouse-Version gepinnt auf 12.8.2 wie in BIL-2523/2526/2527, sonst sind
// die Zahlen gegen die frueheren Laeufe nicht vergleichbar.
//
// Loest `bil2529-cls-recheck.mjs` ab (nur live, nur CLS, kein Verursacher):
// hier sind mehrere Origins, beliebige Routen und die Shift-Quelle je Lauf
// dabei. Die Zahlen des Rechecks bleiben damit reproduzierbar.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LH =
  "C:/Users/Besitzer/AppData/Local/npm-cache/_npx/6ee2f8988123e994/node_modules/lighthouse/cli/index.js";

// `label=origin` je Variante, z. B. `live=https://bilulu.de`.
const VARIANTS = process.argv.slice(2).map((raw) => {
  const at = raw.indexOf("=");
  return { label: raw.slice(0, at), origin: raw.slice(at + 1) };
});
if (VARIANTS.length === 0) {
  throw new Error("Aufruf: node bil2529-cls-hunt.mjs <label>=<origin> [<label>=<origin> …]");
}

const OUT = resolve(HERE, "../reports/bil2529", process.env.BIL2529_TAG || "hunt");
const RUNS = Number(process.env.BIL2529_RUNS ?? 6);

const ROUTES = (process.env.BIL2529_ROUTES || "turban,hose,muetze").split(",").map((n) => {
  const known = {
    turban: "/konfigurator/turban?turban=sage&schleife=cream",
    hose: "/konfigurator/hose?hose=stoff-15&bund=sage",
    "hose-kurz": "/konfigurator/hose-kurz?hose=stoff-15&bund=sage",
    muetze: "/konfigurator/muetze?muetze=stoff-09&bund=cream",
    tuch: "/konfigurator/dreieckstuch?tuch=stoff-15",
    catalog: "/catalog",
  };
  if (!known[n]) throw new Error(`unbekannte Route ${n}`);
  return { name: n, path: known[n] };
});

mkdirSync(OUT, { recursive: true });

// Server-Besitz zuerst (BIL-2523): auf diesem Host laufen fremde
// next-start-Prozesse, ein Lauf gegen einen fremden Build sieht aus wie ein
// Ergebnis. Der buildId wird protokolliert, damit hinterher nachweisbar ist,
// welcher Build gemessen wurde.
for (const v of VARIANTS) {
  const html = await (await fetch(v.origin + ROUTES[0].path)).text();
  v.buildId = (html.match(/buildId\\":\\"([^\\"]+)/) || [])[1] || "?";
  // Warmlaufen: die Konfigurator-Routen sind `force-dynamic`, der erste
  // Treffer auf einen frisch gestarteten Server laedt Module nach und ist kein
  // Bild des Produktionszustands.
  for (const r of ROUTES) await (await fetch(v.origin + r.path)).text();
  process.stderr.write(`${v.label} @ ${v.origin} buildId=${v.buildId} warm\n`);
}

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
    // Exit-Code ist auf Windows kein Signal (chrome-launcher stirbt in
    // destroyTmp mit EPERM). Der Report ist der Beleg.
    p.on("exit", (code) => {
      try {
        const j = JSON.parse(readFileSync(outPath, "utf8"));
        if (j.audits?.["cumulative-layout-shift"]) return res(j);
      } catch {
        /* faellt durch */
      }
      rej(new Error(`exit ${code}, kein verwertbarer Report: ${outPath}`));
    });
  });
}

function shiftRows(j) {
  const items = j.audits["layout-shifts"]?.details?.items ?? [];
  return items.map((i) => ({
    score: i.score,
    selector: i.node?.selector ?? "?",
    snippet: (i.node?.snippet ?? "").slice(0, 110),
    rect: i.node?.boundingRect,
  }));
}

const rows = [];
for (let run = 1; run <= RUNS; run += 1) {
  for (const route of ROUTES) {
    for (const v of VARIANTS) {
      const file = `${OUT}/${v.label}-${route.name}-r${run}.json`;
      const j = await lh(v.origin + route.path, file);
      const cls = j.audits["cumulative-layout-shift"].numericValue;
      const row = {
        run,
        variant: v.label,
        route: route.name,
        buildId: v.buildId,
        cls,
        perf: Math.round((j.categories?.performance?.score ?? 0) * 100),
        sources: shiftRows(j),
      };
      rows.push(row);
      const src = row.sources.map((s) => `${s.selector} ${s.score.toFixed(3)}`).join(" | ") || "-";
      process.stderr.write(
        `r${run} ${v.label}/${route.name}  CLS ${cls.toFixed(4)}  perf ${row.perf}  ${src}\n`,
      );
      writeFileSync(`${OUT}/rows.json`, JSON.stringify(rows, null, 2));
    }
  }
}

// Zusammenfassung: pro Variante x Route wie oft nicht 0, und der schlechteste
// Lauf. "Bestanden" heisst hier: JEDER Lauf 0 — ein Mittelwert wuerde einen
// Ausreisser von 0,24 unter fuenf Nullen verstecken.
const summary = {};
for (const r of rows) {
  const k = `${r.variant}/${r.route}`;
  summary[k] ??= { runs: 0, nonZero: 0, max: 0, worstSources: [] };
  const s = summary[k];
  s.runs += 1;
  if (r.cls > 0) s.nonZero += 1;
  if (r.cls > s.max) {
    s.max = r.cls;
    s.worstSources = r.sources;
  }
}
writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
process.stderr.write("\n=== Zusammenfassung\n");
for (const [k, s] of Object.entries(summary)) {
  process.stderr.write(
    `${k.padEnd(22)} ${s.runs} Laeufe, ${s.nonZero} mit Shift, max ${s.max.toFixed(4)}` +
      (s.worstSources.length ? `  <- ${s.worstSources.map((x) => x.selector).join(", ")}` : "") +
      "\n",
  );
}
