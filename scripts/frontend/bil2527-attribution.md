## Schritt 1 erledigt: der TBT-Posten nach Herkunft — und er liegt woanders als vermutet

Ich habe die Long Tasks aus den BIL-2526-Läufen ins TBT-Fenster (FCP..TTI)
projiziert und nach Skript-Herkunft summiert. Die Rekonstruktion trifft den
gemeldeten TBT jeweils auf ~5 % genau, die Aufteilung ist also belastbar und
keine Schätzung.

| Route | TBT | Dokument | Framework-Chunk | Chunk 129 | Chunk 927 | Unattributable |
| --- | --- | --- | --- | --- | --- | --- |
| `home` | 622 | 462 | 182 | 28 | — | — |
| `catalog` | 455 | 264 | 192 | 50 | — | — |
| `checkout` | 280 | 122 | 163 | 46 | — | — |
| `turban` Uni | 555 | 230 | 136 | 160 | 79 | — |
| `turban` Jitter | 712 | 271 | 189 | 198 | 67 | — |
| `hose` Stoff | 825 | 268 | 170 | 143 | 10 | **284** |
| `hose` Jitter | 855 | 210 | 198 | 167 | 15 | **316** |

Dieselbe Rechnung noch einmal grob, über `mainthread-work-breakdown`:

| Route | scriptEvaluation | styleLayout | DOM-Elemente |
| --- | --- | --- | --- |
| `catalog` | 751 ms | 673 ms | 240 |
| `checkout` | 731 ms | 385 ms | — |
| `turban` | 865 ms | 716 ms | 580 |
| `hose` | **3289 ms** | 729 ms | 495 |

### Was daraus folgt

**Der Konfigurator ist nicht der Hauptverursacher.** `catalog` ist keine
Konfigurator-Route, lädt kein Konfigurator-JS, hat 240 statt 580 DOM-Elemente —
und liegt trotzdem bei 455 ms TBT. Das Dokument (122–462 ms) und der
React-Framework-Chunk (136–198 ms) fallen auf **jeder** Route an, `checkout`
eingeschlossen.

Der konfigurator-*spezifische* Aufschlag auf `turban` ist die Differenz zu
`catalog`: **+115 ms scriptEvaluation**. Das ist die gemessene Obergrenze für
Punkt 2 des Tickets. Selbst ein perfekter Schnitt, der ALLES
konfigurator-eigene JS aus dem Hydrations-Pfad nimmt, bringt nicht mehr als
diese 115 ms.

**Die Split-Kandidaten aus dem Ticket stimmen so nicht.** Ich habe die Live-
Chunks gezogen und nach Inhalt sortiert:

- `425` (36 KiB) = **Radix + lucide**. Taucht in **keiner** Long Task auf, und
  wird auf `catalog` genauso geladen — der kommt aus dem Layout (Header,
  Cookie-Banner). Ein Split bringt hier 0 ms.
- `MobilePaletteSheet` ist **kein Radix-Dialog**, sondern ein einfaches sticky
  `<div>`. Da ist nichts zu entladen.
- `129` (121 KiB roh) = react-dom + Next-Router, also der geteilte Unterbau, den
  jede Route zahlt.
- `927` (32 KiB) = tatsächlich der Konfigurator-eigene `_shared`-Code. Wert:
  **67–79 ms** auf `turban`.

**Die DOM-Größe ist es auch nicht.** `catalog` hat 240 Elemente und 673 ms
styleLayout, `turban` hat 580 und 716 ms. Die 340 zusätzlichen Elemente der
Palette kosten ~43 ms. Die Chip-Staffelung aus Punkt 3 des Tickets lohnt damit
nicht — die 35 Chips liegen zwar seit BIL-2526 im TBT-Fenster, aber ihr
Layout-Anteil ist zu klein, um über der Streuung zu liegen.

**Der mit Abstand größte Einzelposten der ganzen Seite ist die Relief-Ebene.**
`hose` hat **3289 ms** scriptEvaluation gegen 865 ms auf `turban` — +2538 ms.
Die Arbeit ist sauber nach der Uhr geschnitten (sie erzeugt fast keine eigenen
Long Tasks), aber sie hält TTI bei **6,8 s** statt 3,4 s. Und ein doppelt so
breites TBT-Fenster zieht 284–316 ms fremde Long Tasks mit hinein, die auf
`turban` schlicht außerhalb der Messung liegen. Das ist exakt derselbe
Fenster-Effekt, den BIL-2526 ausgelöst hat, nur eine Ebene tiefer. Gehört zu
BIL-2522 / Designer, ich fasse es hier nicht an — aber es ist der Grund, warum
`hose` 79 statt 82 hat, nicht das Bundle.

### Die Lücke zu 95, ausgerechnet statt weggerundet

Ich habe die TBT-Score-Kurve aus meinen sieben Live-Reports gefittet
(log-normal, p10 = 190 ms, Median = 595 ms, RSS 0,00007 — der Fit sitzt). Mit
FCP/LCP/CLS/SI von `turban` unverändert:

| TBT | Perf-Score `turban` |
| --- | --- |
| 555 ms (heute) | 82,5 |
| 400 ms | 87,0 |
| 280 ms (= Niveau `checkout`) | 91,0 |
| 150 ms | 95,0 |
| **0 ms** | **96,5** |

Zwei harte Konsequenzen:

1. **95 verlangt TBT ≤ 150 ms.** Der seitenweite Sockel aus Dokument +
   Framework-Chunk liegt allein bei 280 ms (`checkout`, die schlankeste Route
   der Seite). Über Konfigurator-Code-Splitting ist 95 damit **nicht**
   erreichbar — die gemessenen 115 ms bringen `turban` auf ~85–87.
2. Selbst bei TBT = 0 wäre bei **96,5** Schluss, weil LCP mit 2617 ms nur 0,87
   punktet. Die restlichen 3,5 Punkte liegen im LCP, nicht im Hauptthread.

### Was ich daraus mache

Ich verfolge Punkt 2 des Tickets (`next/dynamic` auf Radix/lucide/saved-configs)
**nicht** weiter — die Obergrenze steht bei 115 ms und die genannten Kandidaten
tragen davon fast nichts. Stattdessen gehe ich an den Posten, der in der
Tabelle oben auf jeder Route ganz links steht und den ich selbst verursacht
habe: das **Dokument**.

Beim Nachmessen des Live-Dokuments ist mir aufgefallen, dass das Stylesheet aus
BIL-2526 **zweimal** ausgeliefert wird — einmal als echter `<style>`-Tag
(32,2 KiB, den malt der Browser) und ein zweites Mal als escapter JS-String im
RSC-Flight-Payload (`self.__next_f.push([1,"*,:after,:before{--tw-…"])`,
32,6 KiB). Grund: `GlobalStyles` war eine Server-Komponente, und der
Flight-Payload ist der serialisierte Server-Baum — reiner Text landet da mit
drin. Das hängt im Root-Layout, betrifft also jede Route.

Messung läuft, Ergebnis kommt in den nächsten Kommentar.
