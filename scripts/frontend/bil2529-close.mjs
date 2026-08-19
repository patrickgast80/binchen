// BIL-2529 schliessen: das Ticket war beim Anlegen bereits ueberholt.
const API = process.env.PAPERCLIP_API_URL || "http://localhost:3100";
const AUTH = { Authorization: `Bearer ${process.env.PAPERCLIP_API_KEY}`, "content-type": "application/json" };
const ID = "3952f7fa-0602-4c0f-801d-59a12ae0f685";

const body = `## Zurueckgezogen — beim Anlegen schon geloest

Ich habe dieses Ticket aus BIL-2527 heraus aufgemacht, weil mir der CLS-Flake
im A/B aufgefallen ist und ich die Quelle nicht kannte. Beides in der
Beschreibung ist falsch:

**Die Quelle war bekannt.** Es ist das Mobil-Palette-Sheet, das beim
HTML-Streaming nach oben waechst — \`fixed inset-x-0 bottom-0\`, die Oberkante
wandert hoch, waehrend die Chips noch nachkommen. Gefunden und gefixt in
BIL-2526 (\`main@d391ab6\` Scroller, \`main@743ad96\` ganze Sheet-Hoehe).
\`743ad96\` ist erst **nach** meinem Messlauf deployt worden, deshalb stand in
meinen Zahlen noch der alte Zustand.

**Und \`--preset=perf\` liefert den Verursacher sehr wohl.** Ich hatte nach
\`layout-shift-elements\` gesucht — das fehlt im perf-Preset. Der richtige Audit
heisst \`layout-shifts\`, gehoert dazu und nennt das Element direkt. In meinen
eigenen Reports stand es die ganze Zeit drin:

\`\`\`
live/hose.json        CLS 0.1141  <- <div class="md:hidden fixed inset-x-0 bottom-0 …" aria-label="Farbauswahl-Panel">
ab/base-turban-r3.json CLS 0.2441  <- dasselbe Element
\`\`\`

Ich habe im Report nach dem falschen Audit-Namen gesucht und daraus geschlossen,
die Information sei nicht da. Der PerformanceObserver-Umweg
(\`bil2527-cls-probe.mjs\`) war deshalb ueberfluessig.

## Live nachgemessen, nach dem Deploy von 743ad96

Gate zuerst: \`min-height\` steht am Sheet im Dokument, es ist also wirklich der
neue Build.

| Route | r1 | r2 | r3 |
| --- | --- | --- | --- |
| \`hose\` | 0,0000 | 0,0000 | 0,0000 |
| \`turban\` | 0,0000 | 0,0000 | 0,0000 |

**6/6 Laeufe CLS 0.** Bei einem Fehler, der vorher in etwa jedem zweiten Lauf
fiel, liegt die Wahrscheinlichkeit, ihn sechsmal zufaellig zu verpassen, bei
1,6 %. Das ist belastbar.

Skript: \`apps/e2e/scripts/bil2529-cls-recheck.mjs\`, Reports unter
\`apps/e2e/reports/bil2529/\`.

## Nebenbefund fuer alle, die heute noch live messen

Der TBT auf der Live-Seite driftet ueber den Tag erheblich: \`turban\` lag
heute frueh bei 555 ms (BIL-2526-Baseline), mittags bei 790 ms und in diesen
Laeufen bei 921–1339 ms. Dieselbe URL, dieselbe Lighthouse-Version, dieselben
Flags. Wer heute eine Live-Messung gegen eine Baseline von gestern stellt,
misst den Tag und nicht seine Aenderung. Fuer Effekte unter ~200 ms braucht es
ein verschraenktes A/B gegen einen Kontrollbuild, nicht ein Vorher/Nachher.

Status: \`done\`, weil geloest — nicht, weil abgearbeitet. Die Abnahme der
Sheet-Hoehe selbst haengt an BIL-2526 bei QA.`;

await fetch(`${API}/api/issues/${ID}/comments`, { method: "POST", headers: AUTH, body: JSON.stringify({ body }) })
  .then((r) => console.log("comment -> " + r.status));
await fetch(`${API}/api/issues/${ID}`, { method: "PATCH", headers: AUTH, body: JSON.stringify({ status: "done" }) })
  .then((r) => console.log("status -> " + r.status));
