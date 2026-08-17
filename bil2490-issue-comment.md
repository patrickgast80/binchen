## Bilder gefunden, alle 21 aufbereitet, Gruppierung liegt dem Board vor

**Bilder-Pfad (kein CEO-Handoff nötig, selbst gefunden):** `C:\Users\Besitzer\Desktop\bilulu\bilder bearbeitet` — 21 Dateien, alle vom 17.08. 20:20–20:35 Uhr lokal.

### Befund an der Lieferung (wichtig fürs nächste Mal)

Die Freistellungen sind gut, aber die Dateien sind **JPEG**, und JPEG speichert keine Transparenz. Statt „ohne Hintergrund" ist deshalb das **Transparenz-Schachbrett des Bildeditors als echte Pixel eingebrannt** — `hasAlpha=false` auf allen 21. Zwei verschiedene Editoren: 19 Dateien hell (Grautöne 194–222 / 252), 2 dunkel (3–16 / 102–149).

Kein Blocker: das Schachbrett ist ein synthetisches 2-Ton-Muster, also messbar und deterministisch entfernbar — und das ist der bessere Weg als erneute ML-Segmentierung, weil Sabines eigene Schnittkanten dabei unangetastet bleiben (genau die Kantenqualität an Strick war der Grund, warum BIL-2486 gestoppt wurde).

### Was gebaut wurde — `main@b2029f2`

`apps/storefront/scripts/bil2490-checkerboard-normalize.mjs`: Grautöne aus dem Randband messen → Kachelgröße als Median der Ton-Wechsel → Pixel gilt als Hintergrund, wenn neutral + auf einem der beiden Töne + beide Töne innerhalb einer Kachel vorhanden → Flood-Fill vom Rand → Halo-Dilatation 2 px → Ausgabe nach `docs/design/STUDIO-LOOK.md` (1200 × 1200, `#F0EBE1`, 4 % Rand, optische Mitte 48 %).

**Ergebnis: 21/21 normalisiert.** Kontaktabzug `assets/bil2490/bil2490-sheet.jpg`, Stoff-Vergleichszooms `assets/bil2490/bil2490-pairs.jpg`, Assets in `assets/bil2490/normalized/`.

Drei Dinge, die dabei schiefgingen und am Pixel-Befund korrigiert wurden — dokumentiert, weil jede davon still falsche Bilder produziert hätte:

1. **Globales Perioden-Modell funktioniert NICHT.** Erst als Schachbrett mit Periode + Phase modelliert; auf `09712b22` springt das Muster über die Bildhöhe dreimal um eine ganze Kachel (Lücken von 32 px statt 16 px). Das Modell läuft dadurch aus der Phase und klassifiziert das halbe Bild als Kleidungsstück. Klassifikation ist deshalb rein lokal.
2. **`sharp` sortiert `extract()` vor `joinChannel()`** innerhalb einer Pipeline. Die Vollbild-Alpha landete verschoben auf dem bereits zugeschnittenen RGB → dunkle Balken quer über dem Kleidungsstück. Jetzt zwei getrennte Pipelines.
3. **Eingeschlossenes Schachbrett** (Turban-Knoten, Mützen-Höhlung, Lücke zwischen zwei Teilen eines Sets) ist vom Rand aus nicht erreichbar und braucht einen eigenen Durchgang; kleine Komponenten (< 1 Kachel²) bleiben opak, damit echte helle Stellen im Stoff nicht wegfallen.

Zusätzlich: `sharp.trim()` ist hier unbrauchbar (es geht vom Farbwert des Eckpixels aus, und der transparente Bereich trägt weiter die zwei Schachbrett-Töne) — Bounding-Box wird selbst aus der Alpha-Maske gerechnet.

### Gruppierung: 15 Produkte aus 21 Fotos

Vollständige Tabelle: `docs/BIL2490-SET-GRUPPIERUNG.md`. Vier Sets nach Stoff (Pusteblumen hellblau, Zoo/Dinos rosa, Boho-Regenbogen creme, Marienkäfer blau) + 11 Einzelstücke. Stoff-Paare per Zoom bestätigt: 10↔14, 3↔19, 8↔17, 7↔15↔16. **#4 und #9 sind NICHT derselbe Stoff** (beide navy Winter-Kind, aber Schneeflocken vs. rosa Herzen) → zwei Produkte.

### Zentraler Fund für den Löschauftrag

Der Live-Shop hat **34 Produkte, und 14 der 15 neuen Gruppen existieren dort schon mit Titel und Preis** — Sabines neue Fotos sind dieselben Artikel, nur richtig freigestellt. Vorschlag: bei diesen 14 nur die Bilder ersetzen statt neue Produkte anzulegen (Preise/Handles/SEO bleiben, keine Doppelkarten). Nur ein Produkt ist neu.

Damit betrifft „alles andere wird gelöscht" 19 Produkte — aber davon sind nur 6 Demo-Artikel aus der Erstbefüllung; die anderen 13 sind echte Handmade-Artikel ohne neues Foto (12 Pumphosen + 1 Turban). Das wörtlich auszuführen würde 13 verkaufbare Artikel aus dem Shop nehmen, ohne dass das Board das so gemeint haben muss → **Board-Entscheidung A/B**, statt still zu entscheiden.

### Vorbedingung für Schritt 4 schon geprüft

Nächtliches `pg_dump` läuft und ist aktuell: `binchen-20260816T231501Z.dump` (460 477 Bytes) auf `deploy@188.245.40.74:/home/deploy/backups/bilulu-postgres/`, Host-Cron `15 1 * * *`, 4 Generationen vorhanden. Vor dem Löschen wird trotzdem ein frischer Dump gezogen.

### Status

`blocked` auf die Board-Antwort — Interaktion `dab560fd-9ed3-478b-b331-87c4278c03fa` (`ask_user_questions`, `wake_assignee`) hängt an diesem Ticket, Zusammenfassung als Kommentar auf BIL-1. Drei Fragen: (1) Löschumfang A oder B, (2) ob `8dc754d4` und `1b63320f` derselbe Artikel sind, (3) ob die beiden neuen Set-Preise passen.

Ohne Antwort auf (1) darf ich nicht löschen (Shop-Inhalt, nicht umkehrbar), und ohne (2) wäre die Produktzahl 15 oder 16. Sobald die Antwort da ist, läuft in einem Zug: Upload nach Medusa (`uploads/` auf Bind-Mount, `/static`-Route), 14 Produkte re-imagen, 2 Einzelteile zu Sets machen, 1 Produkt neu, Live-Check auf Katalog/Startseite/PDPs/`/fruehchen`/Konfiguratoren, dann Löschen.

**Rollback:** Der Commit fügt nur ein Skript, ein Dokument und Assets hinzu — nichts davon ist im Shop live, `git revert b2029f2` genügt. An Medusa wurde noch nichts verändert.

**Nächster Reviewer:** Board (CEO) für die Freigabe; QA erst nach dem Live-Rollout.
