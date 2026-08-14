# BIL-2462 Reshoot-Liste (automatisch generiert)

Generiert: 2026-08-14T15:50:12.949Z
Basis: 34 Live-Produkte, Bewertung nach Studio-Look-Standard (docs/design/STUDIO-LOOK.md).

## Zusammenfassung

- **reshoot**: 24
- **external**: 7
- **keep-with-warnings**: 2
- **ok**: 1

## Reshoot dringend (dunkler Backdrop / verkippt / off-centre)

| Produkt | Backdrop-L | Tilt | Off-centre | Corner-Drift |
|---|---:|---:|---:|---:|
| Set Mütze + Loop-Schal "Boho-Regenbogen" creme | 110 | 0 | 10 | 0 |
| Mütze "Winter-Kinder" marineblau | 71 | 9 | 6 | 0 |
| Mütze "Boho-Regenbogen" mint mit Schleife | 106 | 1 | 0 | 0 |
| Dreieckstuch "Kleiner Zoo" rosa | 96 | 0 | 0 | 0 |
| Turban-Mütze "Aquarell-Blüten" bordeaux | 111 | 267 | 10 | 0 |
| Baby-Mütze "Rosen" navy mit pinker Schleife | 88 | 0 | 23 | 0 |
| Turban-Mütze "Pastell-Aquarell" mit rosa Schleife | 127 | 0 | 1 | 0 |
| Set Mütze + Halstuch "Marienkäfer" blau-rot | 94 | 24 | 5 | 0 |
| Turban-Mütze "Bunte Wildblumen" | 98 | 1 | 1 | 0 |
| Dreieckstuch "Schmetterlinge & Pusteblumen" hellblau | 81 | 1 | 0 | 0 |
| Pumphose "Eukalyptus" creme | 111 | 0 | 1 | 0 |
| Pumphose "Regenbogen-Schmetterlinge" navy | 78 | 33 | 7 | 0 |
| Pumphose "Blätter-Aquarell" creme | 129 | 0 | 3 | 0 |
| Pumphose "Rosen" rosa mit türkiser Schleife | 109 | 0 | 0 | 0 |
| Pumphose "Wildblumen" creme mit Paperbag-Bund | 130 | 0 | 3 | 0 |
| Pumphose "Wale" marineblau | 96 | 0 | 2 | 0 |
| Pumphose "Anker & Sterne" marine-türkis | 51 | 158 | 7 | 0 |
| Pumphose "Pferde & Blumen" navy mit roten Bündchen | 70 | 19 | 7 | 0 |
| Pumphose "Regenbogen & Wolken" navy-rosa | 88 | 44 | 9 | 0 |
| Pumphose "Füchse im Wald" creme-oliv | 98 | 0 | 4 | 0 |
| Pumphose "Dinos" rosa mit türkisem Bund | 168 | 57 | 9 | 0 |
| Pumphose "Wale" altrosa | 103 | 1 | 1 | 0 |
| Pumphose "Erdbeeren" beere-türkis | 104 | 0 | 3 | 0 |
| Pumphose "Dinos" türkis mit orangen Bündchen | 91 | 1 | 1 | 0 |

## Behalten mit Warnung

- **Turban-Mütze "Rosen" lila mit Schleife** — grey-backdrop L=146
- **Pumphose "Vintage-Rosen" cream mit bordeaux Bund** — grey-backdrop L=151

## Bereits gut (Goldstandard fürs Wiedertreffen)

- **Pumphose "Dinos" rosa mit braunem Bund** — cornerDev=0, backdropL=171

## Externe Bilder (nicht in Medusa-Uploads → separate Behandlung)

- **Bilulu-Pumphose (Konfigurator)** — https://bilulu.de/products/pumphose/pumphose-01.jpg
- **Body** — https://bilulu.de/konfigurator/body-foto/base.webp
- **Bio-Baumwolle Strampler – Waldtiere** — https://bilulu.de/products/strampler-waldtiere.svg
- **Jersey Bodysuits Set – Regenbogen (2er-Pack)** — https://bilulu.de/products/bodysuit-regenbogen.svg
- **Musselinhose – Salbeigrün** — https://bilulu.de/products/musselinhose-salbei.svg
- **Wendejacke – Punkte & Streifen** — https://bilulu.de/products/wendejacke-punkte.svg
- **Spielanzug mit Füßen – Sternchen** — https://bilulu.de/products/spielanzug-sternchen.svg

## Metrik-Grenzwerte

- **backdropL** (mittlere Helligkeit der Innenzone 30–70% ohne Canvas-BG-Pixel): <140 = dunkler Backdrop sichtbar → reshoot; 140–165 = grauer Backdrop-Rest → Warnung; >165 = ok
- **cornerDev** (max. Abweichung der 4 Ecken vom Ziel-Grau 200/200/198): >30 = fail; 15–30 = Warnung
- **offCentre** (Schwerpunkt-Distanz zur Bildmitte in px auf 400px Preview): >80 = fail; 30–80 = Warnung
- **tilt** (Kanten-Schräge zwischen oberer und unterer Motiv-Region): >40 = Warnung; >100 = fail
