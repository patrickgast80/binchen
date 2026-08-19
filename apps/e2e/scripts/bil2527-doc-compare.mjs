// BIL-2527 — misst, was im Dokument steht: Style-Tag, Flight-Payload, Skripte.
//
// Der Punkt der Uebung ist die Kopie des Stylesheets im RSC-Flight-Payload.
// Sie ist nicht an einem einzelnen Zaehler zu erkennen, sondern nur daran, dass
// derselbe Text zweimal im selben Dokument steht — einmal als `<style>` und
// einmal als `self.__next_f.push([1,"..."])`. Deshalb vergleicht das Skript die
// Bytes der Inline-Skripte gegen die Bytes der Style-Tags, statt bloss die
// Dokumentgroesse zu melden.
//
// Ausserdem prueft es die BuildId gegen die erwartete: auf diesem Host laufen
// regelmaessig fremde `next start`-Prozesse auf Standardports, und ein
// EADDRINUSE-Server, den man nicht bemerkt, liefert stillschweigend die Zahlen
// eines fremden Builds (vgl. BIL-2523, "prove you own the server first").
//
// Aufruf: node bil2527-doc-compare.mjs <label>=<origin>[:<erwartete-buildId>] ...
import { readFileSync } from "node:fs";

const targets = process.argv.slice(2).map((raw) => {
  const [label, rest] = raw.split("=");
  const at = rest.lastIndexOf("@");
  return {
    label,
    origin: at === -1 ? rest : rest.slice(0, at),
    expectBuildId: at === -1 ? null : rest.slice(at + 1),
  };
});

const PATHS = [
  ["turban", "/konfigurator/turban?turban=sage&schleife=cream"],
  ["hose", "/konfigurator/hose?hose=stoff-15&bund=sage"],
  ["catalog", "/catalog"],
];

function measure(html) {
  let scriptBytes = 0;
  for (const m of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) scriptBytes += m[1].length;
  let styleBytes = 0;
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) styleBytes += m[1].length;
  const buildId = (html.match(/buildId\\":\\"([^\\"]+)/) || [])[1] ?? null;
  // Der Flight-Payload haelt das CSS als escapten String. Ein Treffer auf ein
  // Tailwind-Praeambel-Fragment INNERHALB eines push() ist der Beweis.
  const cssInFlight = /__next_f\.push\(\[1,"\*,:after,:before\{/.test(html);
  return {
    docKiB: +(html.length / 1024).toFixed(1),
    inlineScriptKiB: +(scriptBytes / 1024).toFixed(1),
    styleKiB: +(styleBytes / 1024).toFixed(1),
    styleTags: (html.match(/<style[^>]*>/g) || []).length,
    cssLinks: (html.match(/rel="stylesheet"/g) || []).length,
    cssInFlight,
    buildId,
  };
}

const rows = [];
for (const t of targets) {
  for (const [name, path] of PATHS) {
    const res = await fetch(t.origin + path);
    const html = await res.text();
    const m = measure(html);
    const owned = t.expectBuildId ? m.buildId === t.expectBuildId : null;
    rows.push({ variant: t.label, route: name, ...m, owned });
    if (owned === false) {
      throw new Error(
        `${t.label} ${name}: BuildId ${m.buildId} != erwartet ${t.expectBuildId} — ` +
          `da antwortet ein fremder Server. Messung abgebrochen.`
      );
    }
  }
}

for (const r of rows) {
  console.log(
    `${r.variant.padEnd(6)} ${r.route.padEnd(8)} doc ${String(r.docKiB).padStart(6)}KiB  ` +
      `inline-script ${String(r.inlineScriptKiB).padStart(5)}KiB  ` +
      `style ${String(r.styleKiB).padStart(5)}KiB (${r.styleTags})  ` +
      `cssLinks ${r.cssLinks}  css-im-flight ${r.cssInFlight ? "JA" : "nein"}  ` +
      `owned=${r.owned}`
  );
}

const out = process.env.BIL2527_OUT;
if (out) {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(rows, null, 2));
  console.log("-> " + out);
}
void readFileSync;
