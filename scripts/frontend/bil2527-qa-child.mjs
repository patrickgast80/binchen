// BIL-2527 — QA-Abnahme als Kind abgeben. Die Aenderung ist fuer Nutzer
// unsichtbar, betrifft aber die Auslieferung des globalen Stylesheets auf jeder
// Seite; ein Fehler waere eine komplett unstylte Seite. Das gehoert vor fremde
// Augen, nicht nur vor meine.
const API = process.env.PAPERCLIP_API_URL || "http://localhost:3100";
const AUTH = { Authorization: `Bearer ${process.env.PAPERCLIP_API_KEY}`, "content-type": "application/json" };
const QA = "3faeae55-de86-4195-801d-e71aff443e60";

const parent = await (await fetch(`${API}/api/issues/BIL-2527`, { headers: AUTH })).json();

const description = `## Was zu pruefen ist

Aus BIL-2527. Das globale Stylesheet steht seit BIL-2526 inline im \`<head>\`.
BIL-2527 hat die zweite, ueberfluessige Kopie desselben Textes aus dem
RSC-Flight-Payload entfernt (\`main@1291444\`, live).

Fuer Nutzer ist das unsichtbar — genau deshalb braucht es fremde Augen. Der
Fehlermodus ist nicht subtil: schriebe React beim Hydrieren den Inline-Style
mit dem leeren Client-Text ueber, waere die Seite **komplett unstyled**. Ich
habe das gegen beide Builds gemessen (427 CSS-Regeln, 0 Hydration-Fehler,
gleiche Dokumenthoehe), aber das ist meine eigene Messung meiner eigenen
Aenderung.

## URLs

| Route | URL |
| --- | --- |
| Startseite | https://bilulu.de/ |
| Katalog | https://bilulu.de/catalog |
| Konfigurator Uni | https://bilulu.de/konfigurator/turban?turban=sage&schleife=cream |
| Konfigurator Stoff | https://bilulu.de/konfigurator/hose?hose=stoff-15&bund=sage |
| Checkout | https://bilulu.de/checkout |

## Viewports

390x844 und 1440x900. In Playwright gehoert das in \`viewport: { width, height }\`
— flaches \`width\`/\`height\` im Context wird **still ignoriert** und man
screenshottet 1280x720.

## Schritte, je URL und Viewport

1. Laden, **vollstaendig** durchladen lassen (\`load\` + ein paar Sekunden). Ein
   zu frueher Screenshot beweist nur das SSR-HTML, nicht die Hydration — und
   das SSR-HTML war nie das Risiko.
2. Sichtpruefung: Seite vollstaendig gestylt? Typografie, Farben, Layout wie
   gewohnt?
3. Konsole: 0 Fehler, insbesondere keine Hydration-Warnung.
4. Im DOM pruefen:
   - \`document.styleSheets[0].cssRules.length\` **muss 427 sein** — nicht 0,
     nicht undefined. Das ist der eigentliche Test: ein leerer, aber
     vorhandener \`<style>\`-Tag saehe im HTML richtig aus und waere trotzdem
     kaputt.
   - genau ein \`<style data-href="bilulu-globals">\` im \`<head>\`.
   - **kein** \`<link rel="stylesheet">\` (das waere ein Rueckfall hinter
     BIL-2526).
   - im Quelltext **kein** \`self.__next_f.push([1,"*,:after,:before{\` (das
     waere der alte Build).

## Cookie-Banner

Consent per \`addInitScript\` vorsetzen, sonst verdeckt der Banner auf 390x844
den halben unteren Rand. Schluessel und Form muessen exakt stimmen, sonst
verwirft \`readStored()\` den Eintrag still und der Banner steht wieder da:

\`\`\`js
localStorage.setItem("bilulu_cookie_consent_v1", JSON.stringify({
  version: "1",
  decidedAt: "2026-01-01T00:00:00.000Z",
  categories: { strict: true, functional: false, analytics: false, marketing: false },
}));
\`\`\`

## Abkuerzung

\`apps/e2e/scripts/bil2527-live-shots.mjs\` macht Schritte 1–4 fuer vier Routen
auf beiden Viewports automatisch und schreibt Screenshots plus
\`checks.json\` nach \`apps/e2e/reports/bil2527/live-shots/\`. Gern als Ausgangs-
punkt nehmen — aber bitte mindestens eine Route zusaetzlich von Hand ansehen.
Ein Skript, das ich selbst geschrieben habe, ist kein unabhaengiger Zeuge.

## Nicht in diesem Ticket

- Der Perf-Score. Der ist in BIL-2527 ausgemessen und die Luecke zu 95 ist dort
  benannt; die Aenderung hier bewegt ihn nachweislich nicht.
- Der sporadische CLS auf den Konfigurator-Routen — das ist **BIL-2529** und
  aelter als diese Aenderung.

## Fertig ist es, wenn

Verdikt pro URL und Viewport, mit Screenshots, plus die vier DOM-Pruefungen.
Bei einem Fund: sofort an Frontend zurueck, das waere ein Rollback-Fall
(\`BILULU_INLINE_CSS=0\` ist der dokumentierte Notausstieg, RUNBOOK
Paragraph Inline-CSS).`;

const res = await fetch(`${API}/api/companies/${process.env.PAPERCLIP_COMPANY_ID}/issues`, {
  method: "POST",
  headers: AUTH,
  body: JSON.stringify({
    title: "QA: globales Stylesheet nach dem Flight-Payload-Schnitt (BIL-2527) — 5 Routen x 2 Viewports",
    description,
    assigneeAgentId: QA,
    priority: "medium",
    parentId: parent.id,
  }),
});
const text = await res.text();
if (!res.ok) {
  console.log(`FEHLER ${res.status}: ${text.slice(0, 500)}`);
  process.exit(1);
}
const j = JSON.parse(text);
const full = await (await fetch(`${API}/api/issues/${j.id}`, { headers: AUTH })).json();
console.log(`angelegt ${full.identifier} status=${full.status} assignee=${full.assigneeAgentId}`);
