# BIL-2528 — Entscheidung zur Relief-Ebene

**Designer, 2026-08-19. Lighthouse 12.8.2, mobil, live gegen bilulu.de.**

Gefragt war: Option 1 (später starten), Option 2 (weniger rechnen) oder
Option 3 (so lassen). Die Antwort ist **Option 3 für die Bildqualität — ohne
Kompromiss —, weil die Zahl, die in BIL-2527 wehtut, gar nicht aus dem Rechnen
kommt.**

Die Messung hat zwei Annahmen des Tickets widerlegt. Beide sind belegt, nicht
argumentiert.

---

## 1. Auf der Einstiegsseite kostet die Relief-Ebene nichts. Sie läuft dort nicht.

BIL-2527 hat `hose?hose=stoff-15&bund=sage` gegen `turban?turban=sage` gemessen
und daraus gelesen: „`hose` startet auf einem Stoff". Das gilt für **diese URL**,
nicht für die Route.

Alle fünf Konfiguratoren starten per Default auf **Uni-Farben**
(`hose`: bund=petrol, hose=cream, buendchen=petrol). Die Relief-Ebene rendert
ausschließlich Zonen mit `textureSrc` und gibt sonst `null` zurück — auf der
nackten Route existiert das `<canvas>` überhaupt nicht.

Am DOM gemessen (`bil2528-relief-presence.mjs`, Pixel 5, live):

| Route (ohne Query) | Relief-Canvas vorhanden |
| --- | --- |
| `/konfigurator/hose` | **nein** |
| `/konfigurator/hose-kurz` | **nein** |
| `/konfigurator/muetze` | **nein** |
| `/konfigurator/turban` | **nein** |
| `/konfigurator/dreieckstuch` | **nein** |
| `/konfigurator/hose?hose=stoff-15&bund=sage` | ja (900x1006, 311 CSS px breit) |

Auch die Startseite und `/fruehchen` rendern die Hose-Vorschau nur mit
Uni-Hex-Farben. **Kein Einstiegspfad in den Konfigurator — Startseite,
Frühchen-Seite, Katalog, PDP — trägt einen Stoff-Parameter.** Stoff-URLs
entstehen erst durch Teilen/Merken und durch den Fehler-Redirect aus dem
Warenkorb.

Und die Scores dazu, dieselbe Route, einziger Unterschied ist die Query:

| Variante | Runde | Score | TBT | TTI | scriptEvaluation |
| --- | --- | --- | --- | --- | --- |
| `hose` **Default (uni)** | 1 | **82** | 678 | 3664 | 1034 |
| `hose` **Default (uni)** | 2 | **79** | 885 | 3602 | 964 |
| `hose` **Stoff (Deep-Link)** | 1 | 75 | 1123 | 6982 | 3903 |
| `hose` **Stoff (Deep-Link)** | 2 | 73 | 1244 | 8268 | 4196 |
| `turban` uni (Kontrolle BIL-2527) | 1 | 76 | 918 | 3879 | 1256 |
| `turban` uni (Kontrolle BIL-2527) | 2 | 86 | 403 | 3304 | 833 |

Die Einstiegsseite von `hose` liegt bei **79–82** und damit im selben Band wie
`turban` (76–86). Der Satz aus dem Ticket, `hose` bleibe bei ~75–79, gilt für den
Deep-Link.

---

## 2. Die 2,4 s Rechnen sind nicht das, was TTI schiebt. Drei ungeschnittene Blöcke sind es.

Das ist der Kern. In **allen sechs** Läufen gilt exakt:

| Variante | Ende des letzten Long Task | TTI | Differenz |
| --- | --- | --- | --- |
| hose-default r1 | 3664 | 3664 | **0** |
| hose-default r2 | 3602 | 3602 | **0** |
| turban-uni r1 | 3879 | 3879 | **0** |
| turban-uni r2 | 3304 | 3304 | **0** |
| hose-stoff r1 | 6982 | 6982 | **0** |
| hose-stoff r2 | 8268 | 8268 | **0** |

**TTI ist auf die Millisekunde das Ende des letzten Long Task.** Nicht die Menge
der Arbeit, sondern deren Körnigkeit entscheidet.

Und die Long Tasks der Stoff-Variante sind zählbar. Späte, nicht zuordenbare
Tasks (`Unattributable`, Start > 3 s):

| Variante | Anzahl | Dauern | Summe |
| --- | --- | --- | --- |
| hose-default r1 / r2 | **0** / **0** | — | 0 ms |
| turban-uni r1 / r2 | **0** / **0** | — | 0 ms |
| hose-stoff r1 | **3** | 130, 161, 251 ms | 542 ms |
| hose-stoff r2 | **3** | 106, 145, 223 ms | 474 ms |

Drei Stück, in beiden Runden, ausschließlich auf der Stoff-Variante. Ihre Summe
(474–542 ms) deckt sich mit dem gesamten TBT-Aufschlag (+402 ms Median).

Das gemalte Bild ist an diesen Tasks unschuldig. Die Malschleife ist seit
BIL-2522 nach der Uhr geschnitten und liefert **keinen einzigen** Long Task —
zwischen dem zweiten und dem dritten Block liegen in r1 rund 600 ms
Relief-Malerei, in denen nichts über 50 ms läuft. Was übrig bleibt, sind die
Schritte in `relief-layer.tsx`, die **außerhalb** der Schleife am Stück laufen:

1. `loadImageData(relief.webp)` — Decode 900x1006, `drawImage`, `getImageData`.
2. `loadImageData(mask-*.webp)` + die Alpha-Kopierschleife über **905 400**
   Einträge (`maskAlpha[p] = mask.data[p*4+3]`).
3. `loadTile(...)` → `buildTile` resampelt die Kachel.
4. `ctx.putImageData(layer, 0, 0)` — 905 400 Pixel in einem Rutsch, ganz am Ende.

Die Signatur im Trace passt: zwei Blöcke dicht hintereinander (Aufbau), dann
~600 ms saubere Malerei ohne Long Task, dann der dickste Block (251/223 ms) am
Schluss — genau dort, wo `putImageData` steht, und genau dort, wo TTI fällt.

Das ist ein Körnigkeitsfehler in meiner eigenen BIL-2522-Ebene, kein
Kunst-gegen-Tempo-Kompromiss. **Er ist ohne jede sichtbare Änderung behebbar.**

---

## Die Entscheidung

**Option 3 gilt: an der Bildqualität wird nichts zurückgenommen.** Weder
Auflösung noch Ebenenzahl noch ein späterer Start.

Das ist ausgesprochen und nicht implizit, wie im Ticket verlangt. Die Begründung
ist aber nicht „Fotorealismus war eine Board-Entscheidung, also zahlen wir":

- Auf der **Einstiegsseite** gibt es nichts zu bezahlen. Die Ebene läuft nicht.
- Auf dem **Deep-Link** ist die Vorschau auf einem echten Gerät nach
  **722–891 ms** fertig (Pixel 5, ungedrosselt, `swap.json`), mit **null**
  Long Tasks nach `load`. Die Seite ist die ganze Zeit bedienbar.
- Die schlechte Zahl kommt von drei ungeschnittenen Blöcken, nicht vom Rechnen.

**Option 1 ist ein No-Op.** Die Ebene startet bereits in `requestIdleCallback`.
Noch später zu starten entfernt keine Arbeit, es verlängert nur das Fenster, in
dem der Besucher die flache Version sieht — also genau das, wogegen die
Board-Direktive vom 19.08. gerichtet ist.

**Option 2 wäre bezahlt und unnötig.** Sie kauft Score gegen den ersten
Eindruck, und sie zielt auf die Malschleife, die gemessen **null** Long Tasks
erzeugt. Weniger zu malen macht die drei Blöcke nicht kürzer.

**Stattdessen abgegeben (BIL-2531, Frontend):** die vier ungeschnittenen
Schritte scheiben. Erwartung, direkt aus der Tabelle oben: keine Long Tasks nach
~3,5 s mehr, also **TTI von 6,98/8,27 s auf das `hose-default`-Niveau von
~3,6 s**, TBT −400 ms, Score des Deep-Links vom 73–75er ins 79–82er Band. Am
gerenderten Bild ändert sich dabei **kein Pixel** — das ist die Abnahmebedingung.

---

## Nebenbefund, nicht in diesem Ticket

Auf 393 px (Pixel 5) verdeckt das Paletten-Sheet rund zwei Drittel der
Vorschau — sichtbar in `swap/mobile-before-flat-css.png`. Der Stoff, um dessen
Echtheit es hier geht, steht auf dem Telefon also in einem Streifen. Das ist eine
Layout-Frage, keine Render-Frage, und gehört nicht hierher — aber es relativiert
jeden weiteren Aufwand an der Auflösung der Vorschau auf Mobil.

---

## Belege

- `summary.md` / `summary.json` — die sechs Lighthouse-Läufe, zwei verschränkte
  Runden über drei Varianten (Jitter-Kontrolle durch die Wiederholung).
- `long-tasks.json` — alle Long Tasks je Lauf mit Start, Dauer, Herkunft.
- `relief-presence.json` — Canvas-Existenz je Route, am DOM.
- `swap/` — Vorschau vor und nach dem Relief-Swap, Desktop 1440x900 und Pixel 5.
  Die beiden `desktop-after-*` sind byte-identisch (md5
  `8bbba053254b38326091ce4abd1bf014`), der Vergleich misst also den Effekt und
  nicht das Rauschen.
- Skripte: `apps/e2e/scripts/bil2528-entry-vs-deeplink.mjs`,
  `bil2528-relief-presence.mjs`, `bil2528-swap-visual.mjs`.
- Die vollständigen Lighthouse-Reports (2,7 MB) bleiben lokal unter
  `apps/e2e/reports/bil2528/lh/`, wie in BIL-2526/2527 auch — committed ist der
  Auszug.
