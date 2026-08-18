## Erledigt — live auf bilulu.de, `main@d380a5b`

Der Original-Druck ist bei beiden Konfiguratoren aus der Basis raus, die echten Falten sind geblieben. Belege unten sind Vorher/Nachher aus derselben Offline-Reproduktion des Browser-Blend-Stacks, ein Unterschied im Sheet ist also ein Unterschied in den Assets und sonst nichts.

**Surfaces:** `/konfigurator/turban`, `/konfigurator/dreieckstuch`

### Was der Auftrag verlangt hat, und was rauskam

`foldsFromPhoto` macht die Trennung schon — sie steckte aber verschraubt in der Faltenberechnung. Ich habe die Entdruck-Stufe als `deprintByChroma` herausgelöst und exportiert; `foldsFromPhoto` ist jetzt ein dünner Wrapper (deprint + Bandpass). Die drei Konfiguratoren an der geteilten Shading-Pipeline bauen danach **byte-identisch** weiter — `md5sum -c` für hose und muetze, beide OK. Für turban/dreieckstuch läuft der Deprint jetzt auf die **Basis selbst** und nicht auf den Faltenanteil, weil deren Basis gar keine Shading-Map ist, sondern die rohe Foto-Luminanz.

Zwei Dinge musste ich dafür ergänzen, beide aus konkreten Artefakten und nicht auf Verdacht:

**1. Morphologisches Schließen der Druckmaske (`close`).** Erster Durchlauf sah gut aus, bis auf **dunkle Rechtecke** mitten in den entfernten Rosen. Ursache gemessen, nicht geraten: fast schwarze Motivkerne tragen kaum Chroma, und JPEG-4:2:0 verschmiert den Rest über einen 8px-Block — der Kern landet zurück bei der Chromatizität des Stoffs und überlebt die Maske. Ein Loch in einem Motiv ist Teil des Motivs, also Maske schließen bevor sie wächst.

**2. `protect` für Konstruktion.** Overlock-Naht und Stichlinie sind kein Druck und dürfen nicht weginpaintet werden. Erste Fassung hat die Naht über „niedrige Sättigung" geschützt — und damit auch die dunklen Rosenkerne. Die Helligkeitsgrenze (`lum >= 120`) ist deshalb tragend: Naht hell, Motivkerne dunkel.

**`absFloor` hängt am Grund, nicht am Motiv.** Beim Dreieckstuch überlebte mit dem Default 0.05 die komplette anthrazitfarbene Strichzeichnung — Blattranken, Streifen, Punkte. Der Grund ist blasses Rosa und liegt damit nah an neutral, die Tuschelinien liegen knapp innerhalb der Schwelle. Verteilung über das Kleidungsstück ausgemessen: Grund unter 0.02, Motive ab 0.037 → 0.03 gewählt, also in die Lücke dazwischen.

### Deckungsgrad-Prüfung: das Urteil fiel diesmal anders als beim Dino-Korpus

Der Auftrag sagt zu Recht, erst prüfen, ob es der Deckungsgrad hergibt. Gemessen: Turban-Korpus **33,4%**, Dreieckstuch **24,2%** — beides über der Default-Grenze von 22%. Trotzdem grün, und zwar aus einem anderen Grund als beim Dino-Korpus rot: dort war das Problem nie die Zahl allein, sondern dass der Rapport (~150–200px) *größer* war als die gesuchten Falten und jede Bandpass-Skala Dinosaurier rekonstruierte. Hier sind die Motive chromatisch weit weg vom Grund (Lavendel auf Creme, Aqua/Koralle auf Rosa) und der Grund ist zwischen den Motiven durchgehend sichtbar — es gibt also sauberen Stoff zum Auffüllen. Entschieden habe ich das wie in BIL-2509 vorgeschrieben: am gedumpten `base.webp`, per Auge. Die `maxPrint`-Grenzen stehen jetzt knapp über den gemessenen Werten, damit ein Nachfotografieren mit dichterem Druck den Build **abbricht** statt still Geister auszuliefern.

### Nebenbefund — der eigentliche Grund, warum der erste Rebuild kaputt war

Beide Build-Skripte lasen ihr Quellfoto aus `public/products/…`. Commit `b576357` („BIL-2455 followup — uniform product-photo backgrounds") hat genau diese Dateien auf eine einheitliche 1200×1200-Leinwand umgesetzt. Der Hintergrund-Flood-Fill keyt auf das originale kühle Studiograu und trifft die neue Matte nicht — **Ergebnis: nichts wird freigestellt, `base.webp` kommt als graues Vollquadrat heraus, Exit-Code 0.** Aufgefallen nur an `crop {cropW: 1200, cropH: 1200}` statt 1054×932. Wer immer als nächstes ein Konfigurator-Asset neu baut, wäre da reingelaufen.

Gefixt: Quellfotos gepinnt unter `apps/storefront/scripts/sources/` (+ README mit der Begründung). Liegt unter `scripts/`, also nicht im Next-Bundle, kostet zur Laufzeit nichts.

**Der Beleg, dass die gepinnte Quelle die richtige ist**, ist nicht „sieht gleich aus": alle **Masken** bauen byte-identisch zum Ausgelieferten neu, nur `base.webp` ändert sich — also genau die eine Datei, die sich ändern sollte. `hose` und `muetze` habe ich mitgeprüft: unkritisch, die wurden in BIL-2509 nach `b576357` neu gebaut und bauen byte-identisch nach. Offen bleibt `hose-kurz`, dessen Quelle nur auf einem lokalen Desktop-Pfad liegt → **BIL-2515** angelegt (low, nichts kaputt, aber außerhalb dieser Maschine nicht baubar).

### Messung — und warum „FLATTER" hier das Ziel ist

`scripts/bil2509-detail-probe.mjs`, σ auf Faltenskala:

| Zone | vorher | nachher |
| --- | --- | --- |
| turban/turban | 23.08 | **12.28** |
| turban/schleife | 25.45 | 26.20 |
| dreieckstuch/tuch | 26.21 | **8.03** |

Das Tool labelt die beiden Abfälle als „FLATTER" — **hier ist genau das der Erfolg.** Diese σ war Druck-Restsignal, keine Stofflichkeit; das steht so schon im Ticket. Zum Vergleich: BIL-2509 hat hose/buendchen auf 16.71 gebracht, turban liegt mit 12.28 jetzt in derselben Familie. Das Dreieckstuch ist mit 8.03 flacher, weil das Tuch flach liegt und real wenig Wurf hat. Die Zahl entscheidet nichts — entschieden wurde an den Sheets.

Nebeneffekt: `base.webp` turban 93 KB → 64 KB, dreieckstuch 46 KB → 29 KB (entdruckt komprimiert besser), also 46 KB weniger auf dem LCP-Pfad.

### Belege

Vorher/Nachher-Sheets (links ausgeliefert, rechts jetzt), je ein heller und ein dunkler Stoff wie verlangt:
- `apps/e2e/reports/bil2512/evidence/turban-hell.png` — Stoff 01 auf Turban, Terrakotta-Schleife
- `apps/e2e/reports/bil2512/evidence/turban-dunkel.png` — Marineblau/Senfgelb
- `apps/e2e/reports/bil2512/evidence/ds-hell.png` — Stoff 01
- `apps/e2e/reports/bil2512/evidence/ds-dunkel.png` — Marineblau

Basis als PNG gedumpt und angesehen (der eigentliche Prüfschritt):
- `.../evidence/turban-base-before.png` / `-after.png`
- `.../evidence/dreieckstuch-base-before.png` / `ds-base-after.png`

Live-Screenshots 390×844 und 1440×900, je hell und dunkel: `apps/e2e/reports/bil2512/live/` (Skript: `apps/e2e/scripts/bil2512-shots.mjs`, Consent vorgesetzt statt geklickt).

### Verifikation

- `next build` sauber.
- Deploy verifiziert per **Byte-Vergleich** der live ausgelieferten Assets, nicht per Screenshot: `curl https://bilulu.de/konfigurator/turban-foto/base.webp | md5sum` = lokaler Build (`613ce409…`), dreieckstuch ebenso (`68c5a89b…`).
- Lighthouse mobil live auf `/konfigurator/turban`: **Performance 94, Accessibility 100**, LCP 2.6 s, CLS 0.
- 0 Console-Errors auf allen acht Live-Aufnahmen.

### Tradeoffs, ehrlich

- **Restrauschen.** In dicht bedruckten Bereichen bleibt eine schwache blockige Textur, wo inpaintet wurde — sichtbar im gedumpten `base.webp`, unter einem gewählten Stoff praktisch nicht. Kein Motiv mehr erkennbar, aber es ist auch nicht makellos.
- **turban/schleife unverändert.** Die Schleife ist einfarbig dunkelviolett, da war nichts zu entdrucken. Ihr σ verschiebt sich minimal (25.45 → 26.20), weil die Aufhellung der Schleife am Mittelwert des jetzt entdruckten Korpus hängt.
- **LCP 2.6 s** liegt knapp über dem 2,5-s-Ziel. Das ist der Bestandswert der Seite über echtes Netz gemessen und wird von dieser Änderung nur besser (46 KB weniger), nicht schlechter — kein Regress, aber auch nicht gelöst.
- **Nicht angefasst:** Nahtlos-Kachelung aus BIL-2497/2508 liegt über dem Druck und wurde nicht berührt; kein Blur zum Entdrucken; Masken nicht gegen die Silhouette gefedert.

Weiterhin offen und **nicht** aus diesem Ticket: auf 390×844 verdeckt das Paletten-Sheet die untere Hälfte der Vorschau (schon in BIL-2509 gemeldet, in den Mobile-Screenshots wieder zu sehen).

Übergabe an [QA](/BIL/agents/qa) für die E2E-Abnahme: `https://bilulu.de/konfigurator/turban?turban=navy&schleife=mustard` und `https://bilulu.de/konfigurator/dreieckstuch?tuch=stoff-01`, Viewports 390×844 und 1440×900, jeweils einen hellen und einen dunklen Stoff durchklicken. Prüffrage: ist unter irgendeinem Stoff noch eine Rose oder ein Zootier zu erkennen, und sind Naht und Faltenwurf noch da.
