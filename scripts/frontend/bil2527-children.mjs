// BIL-2527 — die zwei Befunde abgeben, die nicht auf diese Oberflaeche gehoeren.
//
// Kinder werden ueber die company-scoped Route angelegt (`POST /api/issues` ist
// 404), mit `parentId` im CREATE-Body — ein nachtraegliches Self-Assign wuerde
// einen Geschwister-Run starten statt eines Kindes.
const API = process.env.PAPERCLIP_API_URL || "http://localhost:3100";
const COMPANY = process.env.PAPERCLIP_COMPANY_ID;
const AUTH = { Authorization: `Bearer ${process.env.PAPERCLIP_API_KEY}`, "content-type": "application/json" };

const DESIGNER = "3ebe70b9-26f7-4a8a-b57d-7ef29cbd8916";
const FRONTEND = "55d15751-05e6-4e51-9239-caa3e5223520";

const parent = await (await fetch(`${API}/api/issues/BIL-2527`, { headers: AUTH })).json();

const CHILDREN = [
  {
    title:
      "Konfigurator hose: Relief-Ebene kostet 2,5 s Hauptthread und schiebt TTI auf 6,8 s — groesster Einzelposten der Seite",
    assigneeAgentId: DESIGNER,
    priority: "medium",
    description: `## Woher das kommt

Aus BIL-2527, Schritt 1 (Aufschluesselung der Long Tasks nach Herkunft). Das
Ticket dort durfte die Relief-Ebene nicht anfassen — sie haengt an der
Designer-Entscheidung aus BIL-2522. Hier stehen die Zahlen, damit die
Entscheidung nicht im Bauchgefuehl getroffen werden muss.

## Die Messung (Lighthouse 12.8.2, mobil, live)

\`turban\` startet in einer Uni-Zone und hat deshalb praktisch keine
Relief-Arbeit. \`hose\` startet auf einem Stoff und hat sie voll. Sonst sind die
beiden Routen baugleich — dieselbe Komponente, dasselbe Bundle, dieselbe
Palette.

| | \`turban\` Uni | \`hose\` Stoff | Differenz |
| --- | --- | --- | --- |
| scriptEvaluation | 865 ms | **3289 ms** | **+2424 ms** |
| TTI | 3436 ms | **6846 ms** | **+3410 ms** |
| TBT | 555 ms | 825 ms | +270 ms |
| davon "Unattributable" | 0 ms | **284–316 ms** | — |

Die Canvas-Arbeit selbst ist sauber nach der Uhr geschnitten — sie erzeugt fast
keine eigenen Long Tasks, das Time-Slicing aus BIL-2522 funktioniert. Der
Schaden entsteht indirekt:

**Solange die Relief-Arbeit laeuft, gilt die Seite als nicht interaktiv.** TTI
liegt bei 6,8 s statt 3,4 s. TBT wird im Fenster FCP..TTI gemessen — das
Fenster ist damit doppelt so breit wie auf \`turban\`, und es faengt 284–316 ms
Long Tasks ein, die auf \`turban\` schlicht ausserhalb der Messung liegen.

Das ist derselbe Fenster-Effekt, der in BIL-2526 aufgetreten ist (frueheres
Malen machte vorhandene Arbeit sichtbar), nur eine Ebene tiefer.

## Warum das jetzt der groesste Hebel ist

BIL-2527 hat nachgerechnet, was auf den Konfigurator-Routen ueberhaupt noch zu
holen ist:

- Konfigurator-eigenes JS aus dem Hydrations-Pfad nehmen: **max. 115 ms**
  (\`turban\` gegen \`catalog\`, gemessen).
- Relief-Ebene: **2424 ms** Hauptthread-Arbeit, 270 ms TBT.

Der Faktor liegt bei 20. Alles andere auf dieser Seite ist Rundung dagegen.

## Zu entscheiden (Designer, nicht Frontend)

Die Frage ist nicht "wie macht man es schneller", sondern **wann es laufen
muss**. Drei Optionen, alle mit Preis:

1. **Spaeter starten.** Relief erst nach dem Settle der Seite rechnen. Der
   Nutzer sieht dann kurz die flache Farbversion und danach den echten Stoff.
   TTI faellt Richtung 3,5 s. Preis: die Vorschau ist ein paar Sekunden lang
   nicht die "taeuschend echte", die die Board-Direktive verlangt.
2. **Weniger rechnen.** Aufloesung oder Anzahl der Ebenen fuer den ERSTEN
   Render senken, volle Qualitaet erst bei Interaktion. Preis: der erste
   Eindruck ist der schlechtere.
3. **So lassen.** Dann bleibt \`hose\` bei ~75–79 und \`turban\` bei ~78–82, und
   der Perf-Score der Konfigurator-Routen ist damit abgeschlossen.

Option 3 ist eine legitime Antwort — Fotorealismus war eine bewusste
Board-Entscheidung. Sie sollte nur ausgesprochen werden statt implizit zu
gelten.

## Fertig ist es, wenn

- entschieden ist, welche der drei Optionen gilt,
- und bei 1 oder 2: \`hose\` gemessen gegen \`turban\` als Kontrolle im selben
  Lauf, mit Jitter-Kontrolle, und die Vorschau visuell abgenommen ist.

Belege: \`apps/e2e/reports/bil2527/\`, Aufschluesselung im ersten Kommentar von
BIL-2527.`,
  },
  {
    title:
      "Konfigurator: sporadischer Layout-Shift (CLS 0,10–0,24 in ~jedem zweiten Lauf) — aelter als BIL-2526/2527",
    assigneeAgentId: FRONTEND,
    priority: "medium",
    description: `## Der Befund

Beim A/B fuer BIL-2527 ist aufgefallen, dass die Konfigurator-Routen einen
**sporadischen** Layout-Shift haben. Er taucht in ungefaehr jedem zweiten Lauf
auf, sonst ist CLS sauber 0 — deshalb ist er bisher durch jede Abnahme
gerutscht, inklusive meiner eigenen in BIL-2523 und BIL-2526.

| Lauf | Build | Route | CLS |
| --- | --- | --- | --- |
| BIL-2526 live2 | vor BIL-2527 | \`hose-jitter\` | **0,105** |
| BIL-2526 live2 | vor BIL-2527 | \`hose\` | 0 |
| BIL-2527 live | nach BIL-2527 | \`hose\` | **0,114** |
| BIL-2527 live | nach BIL-2527 | \`hose-jitter\` | 0 |
| BIL-2527 lokal A/B r1 | **unveraenderter Basis-Build** | \`turban\` | 0 |
| BIL-2527 lokal A/B r3 | **unveraenderter Basis-Build** | \`turban\` | **0,244** |
| BIL-2527 lokal A/B r2 | Basis-Build | \`turban\` | 0,051 |

Wichtig: er steht auf **beiden** Builds, auch auf dem unveraenderten. Das ist
also kein Rueckfall aus BIL-2526 oder BIL-2527, sondern ein aelterer, latenter
Fehler, den erst die Wiederholungslaeufe sichtbar gemacht haben.

0,244 liegt deutlich ueber der "good"-Schwelle von 0,1 und kostet im
Lighthouse-Score bis zu 25 Punkte Gewicht — auf \`turban\` war das in einem Lauf
der Unterschied zwischen 80 und 70.

## Warum das schwer zu fassen ist

Zwei Sackgassen, die man nicht wiederholen muss:

- **\`--preset=perf\` liefert die Quelle nicht mit.** \`layout-shift-elements\`
  gehoert nicht zu den Performance-Audits, der Report sagt nur DASS, nicht WAS.
- **Ein PerformanceObserver auf \`layout-shift\` hat ihn nicht reproduziert.**
  \`apps/e2e/scripts/bil2527-cls-probe.mjs\` (390x844, CPU 4x, Netz gedrosselt
  wie Lighthouse, kein Consent vorgesetzt, damit der Cookie-Banner wie im
  LH-Lauf da ist) meldete auf beiden Varianten 0 Verschiebungen. Das Skript
  ist der Startpunkt, nicht der Beweis — es braucht Wiederholungslaeufe, bis
  der Ausschlag faellt.

## Verdaechtige, ungeprueft

- Der Cookie-Banner. Er rendert per \`useState(true)\` sofort, aber ein
  \`readStored()\` im Effekt kann ihn direkt danach wieder ausblenden — genau
  das Muster, das je nach Timing schiebt oder nicht.
- Die Stoff-Chips. Sie starten seit BIL-2526 erst nach dem \`load\`-Event; das
  ist genau das Zeitfenster, in dem der Shift auftritt.
- Der Mobile-Palette-Sheet misst seine Hoehe per \`ResizeObserver\` und schreibt
  sie in eine CSS-Variable, auf die die Seite ihren unteren Rand stuetzt.

## Fertig ist es, wenn

- die Quelle benannt ist (Element + Zeitpunkt, aus einem Lauf, in dem der
  Shift tatsaechlich faellt),
- der Fix live ist,
- und **mindestens 6 Wiederholungslaeufe** pro Route CLS 0 zeigen. Bei einem
  Fehler, der in jedem zweiten Lauf auftritt, beweisen zwei gruene Laeufe
  nichts — die Wahrscheinlichkeit, ihn zufaellig zu verpassen, liegt bei 25 %.

Belege: \`apps/e2e/reports/bil2527/ab/rows.json\`,
\`apps/e2e/reports/bil2526/live2/\`, \`apps/e2e/reports/bil2527/live/rows.json\`.`,
  },
];

for (const child of CHILDREN) {
  const res = await fetch(`${API}/api/companies/${COMPANY}/issues`, {
    method: "POST",
    headers: AUTH,
    body: JSON.stringify({ ...child, parentId: parent.id }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.log(`FEHLER ${res.status}: ${text.slice(0, 400)}`);
    continue;
  }
  const j = JSON.parse(text);
  console.log(`angelegt ${j.key || j.id} -> ${child.title.slice(0, 70)}`);
}
