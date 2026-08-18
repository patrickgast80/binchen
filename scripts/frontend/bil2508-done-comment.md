## Erledigt — live auf bilulu.de, `main@03c381a`

Patricks Foto war richtig, und der Grund ist unangenehmer als "der Fix hat einen Stoff verpasst": **stoff-09 war von BIL-2497 erfasst, und die Metrik hat trotzdem grün gemeldet.**

### Warum BIL-2497 den Fehler nicht sehen konnte

Die Naht-Energie aus BIL-2497 vergleicht die **letzte Pixelspalte** der Kachel mit der **ersten**. Der Algorithmus blendet genau diese Grenze auf Gleichheit über. Die Metrik hat also das eine gemessen, was der Algorithmus garantiert — sie konnte per Konstruktion nicht fehlschlagen. stoff-09 stand mit 1.10 / 1.33 in der Tabelle und sah aus wie ein Erfolg.

Der sichtbare Schaden lag 30–60 px **im Band**. stoff-09 ist ein Medaillon auf handgemaltem senkrechtem Streifengrund. Der y-Durchlauf schneidet einen wandernden **waagerechten** Pfad quer durch die senkrechten Streifen; jede Spalte mischt dadurch zwei andere Streifenphasen. Ergebnis war ein Fächer aus Chevrons und eine große Raute — Formen, die es im Stoff nicht gibt. Dazu ein grau gewaschener Grund statt Weiß.

Beleg: `apps/e2e/reports/bil2508/diag/tile-09-big.webp` (die ausgelieferte Kachel groß) gegen `diag/source-09.webp` (das Originalfoto).

### Was jetzt anders ist

**1. Die Naht bleibt gerade.** Eine gerade Naht kann keinen Streifen verbiegen; schlimmstenfalls geistert sie zwei Streifen über das Blendband, und das sieht immer noch nach Stoff aus. Schärfe im Band ist der Preis — deutlich billiger als erfundene Geometrie.

**2. Der Crop-Offset wird mitgesucht.** BIL-2497 nahm das zentrierte Quadrat und suchte nur die Kachelgröße, also eine Freiheit pro Achse. Die Fotos sind 2040×1530 — ein kleineres Fenster kann ~500 px wandern und eine Stelle finden, an der die beiden Nahtbänder wirklich zusammenpassen. Erst diese zweite Freiheit macht die gerade Naht bezahlbar.

**3. Welcher Stoff welche Methode bekommt, entscheidet die Quelle, nicht das Ergebnis.** Ich habe zuerst versucht, die beiden Kandidaten gegeneinander zu bewerten (Naht-Band gegen Kachel-Inneres). Das funktioniert nicht: bei stoff-09 ist das Nahtband reiner Streifen und das Innere das Medaillon, also bewertet jede solche Metrik die *saubere* Kachel schlechter als die kaputte. Entschieden wird deshalb über **Richtungs-Kohärenz bei niedriger Frequenz**: bei voller Auflösung liegt stoff-09 bei 0.29, weil die dichte Strichzeichnung isotrop ist und das Gradienten-Budget frisst; auf 96 px verschwindet die Strichzeichnung, die Streifen bleiben, und derselbe Stoff liegt bei **0.78**. Die 35 Stoffe fallen damit in zwei Gruppen mit **4×-Abstand** (0.60–0.98 gegen 0.00–0.15); die Schwelle sitzt in der Lücke, nicht am Ergebnis.

Der Quilt-Schnitt aus BIL-2497 ist **nicht** gelöscht — bei Streublümchen auf einfarbigem Grund ist er echt besser, weil er um die Blüten herumfahren kann, wo die gerade Naht eine durchscheinende Doppelblüte hinterlässt. Er ist nur bei gerichteten Drucken zerstörerisch.

### Ergebnisliste — alle 35 Stoffe, alle 5 Konfiguratoren

Alle Konfiguratoren lesen dieselbe Datei (`textureSrc`), deshalb gilt die Prüfung auf Kachelebene für Hose, kurze Hose, Turban, Mütze, Dreieckstuch, Body **und** OG-Karte und Merken-Thumbnail gleichzeitig — die drei Renderpfade teilen sich die Datei, kein Code-Change nötig.

| | Stoffe | Ergebnis |
|---|---|---|
| **nachgebessert (12)** | 03, 08, 09, 10, 11, 16, 18, 20, 22, 23, 25, 31 | gerade Naht; Streifen/Waschgrund laufen durch |
| **unverändert ok (19)** | 01, 02, 04, 07, 12, 13, 14, 17, 21, 24, 26, 27, 28, 29, 30, 32, 33, 34, 35 | Quilt-Schnitt trägt, kein sichtbares Raster |
| **Restbefund (4)** | 05, 06, 15, 19 | Naht sauber, aber der ausgewaschene **Grund** wiederholt sich sichtbar → **BIL-2514** |

Volle Tabelle mit Messwerten: `apps/e2e/reports/bil2508/audit-table.md`. Kachelbelege aller 35: `sheets/grid-after-{0,1,2}.webp`. Vorher/Nachher der 12 geänderten: `sheets/changed-{0,1}.webp`.

Davon waren 6 (03, 16, 18, 22, 23, 31) **keine** Richtungsdrucke — ausgewaschene Jeans- und Aquarellgründe, die dem Min-Error-Schnitt keinen sauberen Weg lassen, sodass sein Pfad als diagonale Schlieren und als Rahmen um jede Kachel sichtbar wird. Die stehen als ausgeschriebene Liste im Build-Skript, nicht in der Formel: ein Urteil, das man an `sheets/mottled-SvQ.webp` und `sheets/round2-SvQ.webp` nachprüfen kann, ist ehrlicher als eine Schwelle, die man biegt bis sie passt.

### Verifikation

`apps/e2e/scripts/bil2508-live-verify.mjs`, zwei unabhängige Prüfungen:

1. **Byte-Vergleich vor allem anderen.** Jede der 12 neuen Kacheln wird von bilulu.de geladen und gegen die gebaute Datei gehalten. Ein Screenshot eines veralteten Deploys sieht genauso aus wie einer des Fixes (die BIL-2492-Falle), also zählt nichts, bevor die deployte Datei identisch ist. **Nach 13 Proben alle 12 byte-identisch.**
2. **Echtes Chromium**, 390×844 und 1440×900, je bei **0/90/180/270°** — die Rotation liegt auf der Kachel-Ebene, eine Naht kann winkelabhängig auftauchen. **0 Konsolenfehler.**

Das mobile Options-Sheet ist `position: fixed` und verdeckt die Vorschau; der Zoom-Ausschnitt wird deshalb an der Sheet-Oberkante abgeschnitten und **ganz verworfen**, wenn zu wenig Druck übrig bleibt, statt einen wertlosen Beleg zu liefern.

Belege: `apps/e2e/reports/bil2508/live/leg-rot{0,90,180,270}.webp` — das Hosenbein exakt an der Stelle aus Patricks Foto, in allen vier Drehungen. Streifen laufen durch, keine Chevrons, keine Raute. Dazu `mobile-rot*-zoom.webp` und `desktop-rot*.webp`.

### Sackgasse, dokumentiert damit sie niemand zweimal läuft

Die naheliegende Vermutung beim Restbefund — "das ist Beleuchtung, ein stärkeres Flat-Field bügelt es weg" — habe ich geprüft: Polynom-Ordnung 2 gegen 4 gegen 6, `sheets/flatorder-stoff-18.webp` und `-stoff-31.webp`. **Ändert nichts.** Die Wolken sind Teil des Drucks, nicht der Ausleuchtung; eine Beleuchtungskorrektur kann sie per Konstruktion nicht entfernen. Steht so auch im Kind-Ticket.

### Tradeoffs

- **Kacheln sind nicht mehr quadratisch.** Sie behalten das Seitenverhältnis des Ausschnitts (stoff-09 ist 456×575) und werden auf *gleiche Fläche* wie die alten 512×512 skaliert. Eine quadratische Kachel aus einem rechteckigen Ausschnitt müsste den Druck stauchen — die Gesichter wären verzerrt.
- **Bytes:** 2403 kB über alle 35 gegen 2390 kB vorher. Auf dem LCP-Pfad byte-neutral. `manifest.json`, `fabrics.generated.ts` und die 128er Chips bleiben unberührt, damit die BIL-2493-Perf-Arbeit unangetastet bleibt.
- **Nur 12 Dateien geändert.** Der Quilt-Pfad im neuen Skript ist bit-genau der von BIL-2497 nachgebaut, gegengeprüft gegen einen frischen Lauf des alten Skripts — deshalb musste ich die 23 unveränderten Kacheln nicht anfassen, und der Diff ist einer, den man prüfen kann.
- **Kein `next build` gelaufen.** Geändert haben sich ausschließlich Assets unter `public/` und Build-Skripte; nichts davon geht durch den Compiler, und ein paralleler Build im geteilten Checkout wäre ein echtes Risiko gewesen. Der Beweis ist stattdessen der Byte-Vergleich der deployten Dateien plus die Live-Screenshots.

### Übergabe

@QA zur E2E-Abnahme:

- **URL:** `https://bilulu.de/konfigurator/hose?hose=stoff-09&rot=180` (Patricks Fall), dazu `&rot=0`, `&rot=90`, `&rot=270`
- **Viewports:** 390×844 und 1440×900
- **Erwartung:** senkrechte Streifen laufen ohne Versatz durch das ganze Hosenbein; keine diagonalen Keile, keine Raute, kein hart abgeschnittenes Gesicht an einer Kante
- **Stichprobe zusätzlich:** `?hose=stoff-20`, `?hose=stoff-23`, `?hose=stoff-31` sowie derselbe Stoff in `/konfigurator/muetze` und `/konfigurator/turban` (gleiche Datei, anderer Renderpfad)
- **Bekannt und bewusst offen:** stoff-05/06/15/19 zeigen ein Wiederhol-Raster des Grundes → **BIL-2514**, kein Blocker für dieses Ticket
