# BIL-2490 — Set-Gruppierung aus „bilder bearbeitet" (Vorschlag zur Freigabe)

Stand: 2026-08-17. Quelle: `C:\Users\Besitzer\Desktop\bilulu\bilder bearbeitet` (21 Dateien,
alle vom 17.08. 20:20–20:35 Uhr). Freigestellte Bilder normalisiert nach
`docs/design/STUDIO-LOOK.md` (1200 × 1200, Hintergrund `#F0EBE1`, 4 % Rand) mit
`apps/storefront/scripts/bil2490-checkerboard-normalize.mjs`.

## Befund an der Lieferung

Die Freistellungen selbst sind gut. **Aber:** die Dateien sind als **JPEG** exportiert,
und JPEG kann keine Transparenz speichern. Statt „kein Hintergrund" ist deshalb das
**Schachbrettmuster des Bildbearbeitungs-Programms als echte Pixel eingebrannt** — jede
Datei meldet `hasAlpha=false`. Zwei verschiedene Programme wurden benutzt: 19 Dateien mit
hellem Schachbrett (Grau 194–222 / Weiß 252), 2 mit dunklem (Schwarz 3–16 / Grau 102–149).

Das ist ohne Rückfrage lösbar und wurde gelöst: das Schachbrett ist ein synthetisches
Muster mit exakt zwei Grautönen, also messbar und deterministisch entfernbar —
21/21 Bilder sind rekonstruiert, Sabines eigene Schnittkanten bleiben unangetastet.

**Bitte für die nächste Lieferung:** als **PNG** exportieren (dann bleibt die Transparenz
echt erhalten), oder direkt auf einfarbigem Hintergrund speichern. Dann entfällt dieser
Schritt komplett.

## Gruppierung: gleicher Stoff = ein Produkt

15 Produkte aus 21 Fotos. Bild-Nr. = alphabetische Reihenfolge in `bil2490-out/`
(Kontaktabzug: `bil2490-sheet.jpg`).

| # | Produkt (Stoff) | Teile im Set | Bilder | Preis-Vorschlag | Bereits im Shop? |
|---|---|---|---|---|---|
| 1 | Pumphose kurz „Dinos" türkis/orange | 1 | 1 | 28,90 € | ja — Preis übernommen |
| 2 | Turban-Mütze „Aquarell-Blüten" creme/bordeaux | 1 | 13 (flach), 2 (am Kopf) | 19,90 € | ja — Preis übernommen |
| 3 | **SET** „Schmetterlinge & Pusteblumen" hellblau: Dreieckstuch + Halstuch | 2 | 3, 19 | **24,90 €** (bisher 15,90 € für ein Einzelteil) | ja, aber als Einzelteil |
| 4 | Mütze „Winter-Kinder Schneeflocken" navy | 1 | 4 | 16,90 € | ja — Preis übernommen |
| 5 | Pumphose kurz „Blätter-Aquarell" creme/lila | 1 | 5 | 26,90 € | ja — Preis übernommen |
| 6 | Mütze „Boho-Regenbogen" mint mit Schleife | 1 | 6 | 17,90 € | ja — Preis übernommen |
| 7 | **SET** „Boho-Regenbogen" creme: Mütze + Loop-Schal | 2 | 15 (flach), 7 + 16 (am Kopf) | 32,90 € | ja — Preis übernommen |
| 8 | **SET** „Kleiner Zoo / Dinos" rosa: Dreieckstuch + Halstuch | 2 | 17, 8 | **22,90 €** (bisher 14,90 € für ein Einzelteil) | ja, aber als Einzelteil |
| 9 | **SET** „Marienkäfer" blau: Turban + Dreieckstuch | 2 | 11 (beide Teile in einem Foto) | 34,90 € | ja — Preis übernommen |
| 10 | Pumphose kurz „Regenbogen-Schmetterlinge" navy | 1 | 12 | 28,90 € | ja — Preis übernommen |
| 11 | Turban-Mütze „Bunte Wildblumen" weiß | 1 | 10 (flach), 14 (am Kopf) | 19,90 € | ja — Preis übernommen |
| 12 | Pumphose kurz „Eukalyptus" hellblau | 1 | 18 | 27,90 € | ja — Preis übernommen (dort „creme" genannt) |
| 13 | Turban-Mütze „Rosen" weiß/lila | 1 | 20 | 18,90 € | ja — Preis übernommen |
| 14 | Mütze „Rosen" navy/pink | 1 | 21 | 17,90 € | ja — Preis übernommen |
| 15 | Mütze „Winter-Kinder Herzen" navy | 1 | 9 | **16,90 €** (neu, analog #4) | **nein — neu** |

Bestätigte Stoff-Paare (per Zoom-Vergleich, `bil2490-pairs.jpg`): 10↔14, 3↔19, 8↔17,
7↔15↔16. **#4 vs #9 sind NICHT derselbe Stoff** — beide navy mit Winter-Kind-Motiv, aber
einmal mit Schneeflocken (#4) und einmal mit rosa Herzen (#9), deshalb zwei Produkte.
**Unsicher: 2↔13** (beide creme mit Bordeaux-Schleife, #2 nur am Kopf und stark
angeschnitten) — bitte kurz bestätigen, sonst werden daraus zwei Produkte.

Mannequin-Fotos (2, 7, 14, 16) kommen als **Zweitbild** in die Galerie; Titelbild ist immer
das Flachfoto (Lehre aus BIL-2485).

## Wichtig: die 15 Gruppen decken sich fast komplett mit dem bestehenden Shop

Der Shop hat aktuell **34 Produkte**. 14 der 15 Gruppen existieren dort schon mit Titel und
Preis — Sabines neue Fotos sind dieselben Artikel, nur richtig freigestellt. Deshalb
schlage ich vor, für diese 14 **kein neues Produkt anzulegen, sondern die Bilder zu
ersetzen** (weniger Risiko, Preise/Handles/SEO bleiben, keine doppelten Karten).

Damit betrifft „alles andere wird gelöscht" **19 Produkte**:

- **6 Demo-Artikel aus der Erstbefüllung**, die nie Sabines Ware waren: Body,
  Bio-Baumwolle Strampler „Waldtiere", Jersey Bodysuits Set „Regenbogen", Musselinhose
  „Salbeigrün", Wendejacke „Punkte & Streifen", Spielanzug „Sternchen". → löschen,
  unstrittig.
- **13 echte Artikel ohne neues Foto**: 12 Pumphosen (Wale marineblau, Wale altrosa,
  Anker & Sterne, Pferde & Blumen, Regenbogen & Wolken, Dinos rosa/braun, Dinos
  rosa/türkis, Füchse im Wald, Erdbeeren, Vintage-Rosen, Wildblumen creme Paperbag, Rosen
  rosa/türkis) + Turban-Mütze „Pastell-Aquarell". Das sind echte Handmade-Artikel mit den
  alten (nicht freigestellten) Fotos.

**Entscheidung nötig (A oder B):**

- **A — wörtlich:** alle 19 löschen. Der Shop hat danach 15 Produkte, alle mit
  einheitlichem Look. Die 13 Pumphosen sind aus dem Shop verschwunden, bis Sabine dafür
  bearbeitete Fotos nachliefert.
- **B — nur Demo-Artikel löschen:** die 6 Demo-Artikel raus, die 13 Pumphosen bleiben mit
  ihren alten Fotos online (uneinheitlicher Look, aber die Ware ist verkaufbar), und
  Sabine liefert die Fotos nach.

Empfehlung: **A**, wenn die 13 Pumphosen tatsächlich nicht mehr verfügbar sind (Unikate,
evtl. verkauft) — dann ist Löschen sowieso richtig. **B**, wenn sie noch verkäuflich sind:
ein uneinheitliches Foto verkauft mehr als ein nicht existierendes Produkt.

**Nicht gelöscht wird in beiden Fällen** das Produkt „Bilulu-Pumphose (Konfigurator)"
(39 €) — daran hängen die Konfiguratoren (Hose/Mütze). Das ist kein Katalogartikel im
klassischen Sinn, sondern die Konfigurator-Bestellstrecke.

## Nächste Schritte nach Freigabe

1. Bilder in Medusa hochladen (`uploads/` liegt auf dem Bind-Mount, `/static`-Route beachten).
2. Für die 14 vorhandenen Produkte: Bilder ersetzen, Titel/Preis nur anpassen wo oben
   markiert (Sets #3 und #8 werden vom Einzelteil zum Set).
3. Produkt #15 neu anlegen (Bestand 1, Unikat).
4. Live-Verifikation auf Katalog, Startseite, PDPs, `/fruehchen` und den Konfiguratoren.
5. **Erst danach** löschen — und erst nachdem das nächtliche `pg_dump` (Hetzner-Host-Cron,
   `/home/deploy/bin/binchen-pg-backup.sh`) einen aktuellen Stand hat.
