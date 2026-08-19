## Abschluss: der Schnitt ist live, die Bytes sind weg — der TBT nicht

`main@1291444` (Änderung) und `main@dd5bd77` (Belege), beide live seit dem
Auto-Deploy.

### Was geändert wurde

`GlobalStyles` ist jetzt eine Client-Komponente. Damit steht im RSC-Flight-
Payload nur noch die Modul-Referenz statt der kompletten 32,6 KiB CSS-Kopie.
Das SSR-HTML ist unverändert — Client-Komponenten rendert der Server ja auch —
also bleibt der Inline-`<style>` aus BIL-2526 genau da, wo er ist. Damit die
Bytes nicht bloß in einen JS-Chunk umziehen, ersetzt `next.config.mjs` das
Modul `generated/inline-css.ts` im **Client**-Compiler durch eine leere
Fassung. Server: voller Text → HTML. Client: leer → nichts zu parsen.

### Hydration: geprüft, nicht angenommen

Der riskante Teil war die Frage, ob React beim Hydrieren den vorhandenen
`<style>`-Tag mit dem leeren Client-Text überschreibt. Täte es das, wäre die
Seite nach der Hydration komplett unstyled — und ein zu früh geschossener
Screenshot würde trotzdem die richtige Seite zeigen, weil das SSR-HTML ja
korrekt war. Deshalb misst `bil2527-hydration-check.mjs` **nach** der Hydration
am CSSOM, nicht am Aussehen, und läuft gegen beide Builds:

| Build | Route | CSS-Regeln | `<style>` Zeichen | Dokumenthöhe | Hydration-Fehler |
| --- | --- | --- | --- | --- | --- |
| base | turban / hose / catalog | 427 | 33016 | 3030 / 2761 / 8564 px | 0 |
| cut | turban / hose / catalog | 427 | 33016 | 3030 / 2761 / 8564 px | 0 |

Identisch auf jeder Zeile. React behandelt `<style precedence href>` als
Float-Ressource und adoptiert den Tag über sein `data-href`.

### Das Ergebnis, ohne Schönfärberei

**Die Bytes gehen weg — deterministisch, auf jeder Route:**

| Route | Dokument-Transfer vorher → nachher |
| --- | --- |
| `turban` / `catalog` / `home` | 25,3 → 18,3 KiB gzip |
| `hose` | 25,0 → 17,9 KiB |
| `checkout` | 19,5 → 12,5 KiB |

Roh sind das 32,5 KiB weniger pro Dokument, rund **−28 % Dokument-Transfer**.
Lokal und live exakt derselbe Wert.

**Der TBT geht nicht weg.** Das kontrollierte A/B (zwei lokale
Production-Builds, 4 **verschränkte** Runden pro Route, damit paralleler
Maschinenlärm beide Seiten gleich trifft):

| Route | TBT Median base → cut | Spannweiten |
| --- | --- | --- |
| `turban` | 674 → 757 ms | 618..751 gegen 672..770 |
| `hose` | 870 → 855 ms | 740..979 gegen 819..999 |
| `catalog` | 377 → 416 ms | 174..403 gegen 191..525 |

Die Spannweiten überlappen vollständig. Der Effekt liegt unter der Streuung —
in beide Richtungen. Ehrlicher Schluss: **der als DOCUMENT attribuierte
TBT-Posten ist nicht das Parsen dieses Strings.** Er ist die Hydration selbst,
die Lighthouse dem Dokument zuschreibt, weil sie aus dem Inline-Bootstrap
startet. 32 KiB weniger Text zu parsen ändert daran nichts.

Die Live-Zahlen gegen die BIL-2526-Baseline sind **kein** A/B, und ich führe sie
nicht als eins: die Baseline ist von gestern, und im selben Lauf wurde
`checkout` um 65 ms besser, während `home` sich von 622 auf 1208 ms
verdoppelte. 32 KiB können den Hauptthread nicht verdoppeln. Das ist ein
Tagesunterschied, kein Effekt. Vollständige Tabelle in
`apps/e2e/reports/bil2527/live-summary.md`.

### Sichtprüfung

390x844 und 1440x900 auf `turban`, `hose`, `catalog`, `home` —
`apps/e2e/reports/bil2527/live-shots/`. Alle acht Ansichten: 427 CSS-Regeln,
korrekte Hintergrundfarbe, 0 Konsolenfehler. LCP `turban` 2621 gegen 2617 ms,
`hose` 2040 gegen 2109 ms — die BIL-2526-Werte fallen nicht zurück.

### Die Lücke zu 95, benannt statt weggerundet

Aus der gefitteten TBT-Score-Kurve (Details im ersten Kommentar):

- **95 verlangt TBT ≤ 150 ms.** `checkout` ist die schlankeste Route der
  ganzen Seite und liegt bei 215–280 ms — ohne jedes Konfigurator-JS, mit 240
  DOM-Elementen. Das ist der Sockel aus App-Router-Hydration und
  React-Framework-Chunk, den jede Seite zahlt.
- **Selbst bei TBT = 0 wäre bei 96,5 Schluss**, weil LCP mit 2617 ms nur 0,87
  punktet.
- Der konfigurator-*eigene* Anteil ist gemessen **115 ms**. Ihn vollständig zu
  eliminieren bringt `turban` auf ~85–87.

**≥ 95 ist auf den Konfigurator-Routen mit den Mitteln dieses Tickets nicht
erreichbar.** Nicht "noch nicht" — die Rechnung geht nicht auf. Wer 95 will,
muss an den App-Router-Hydrations-Sockel oder an den LCP, und beides ist eine
andere Baustelle als "Konfigurator-Bundle splitten".

### Abgegeben

- **BIL-2528** (Designer) — die Relief-Ebene ist mit **+2424 ms**
  scriptEvaluation und TTI 6,8 s statt 3,4 s der mit Abstand größte Posten der
  ganzen Seite, Faktor 20 gegenüber allem, was hier zu holen war. Drei
  Optionen mit Preis sind im Ticket ausformuliert; „so lassen" ist eine davon
  und eine legitime.
- **BIL-2529** (ich) — sporadischer CLS 0,10–0,24 auf den Konfigurator-Routen,
  in ~jedem zweiten Lauf. Steht auf **beiden** Builds, auch dem unveränderten,
  ist also älter als BIL-2526/2527. Ist mir bisher durch jede Abnahme
  gerutscht, weil zwei grüne Läufe bei einem 50-%-Fehler nichts beweisen.

Punkt 3 des Tickets (Chip-Decoding staffeln) verfolge ich nicht weiter: die
Palette kostet gemessen ~43 ms styleLayout (`catalog` 240 Elemente/673 ms gegen
`turban` 580/716 ms). Das liegt unter der Streuung und wäre nicht belegbar.

### Für QA

Die Änderung ist für Nutzer unsichtbar, betrifft aber die Auslieferung des
globalen Stylesheets auf **jeder** Seite. Ein Fehler hier wäre eine komplett
unstylte Seite. Bitte gegenprüfen:

- `https://bilulu.de/` , `/catalog`, `/konfigurator/turban?turban=sage&schleife=cream`,
  `/konfigurator/hose?hose=stoff-15&bund=sage`, `/checkout`
- auf 390x844 und 1440x900, jeweils **nach** vollständigem Laden,
- Erwartung: Seite vollständig gestylt, keine Konsolenfehler, kein
  `<link rel="stylesheet">` im Dokument und **kein**
  `self.__next_f.push([1,"*,:after,:before{…"])`,
- Gegenprobe für "wirklich hydriert": `document.styleSheets[0].cssRules.length`
  muss 427 sein (nicht 0 und nicht undefined).

`apps/e2e/scripts/bil2527-hydration-check.mjs` und
`bil2527-live-shots.mjs` machen genau das automatisiert, falls das schneller
geht als von Hand.
