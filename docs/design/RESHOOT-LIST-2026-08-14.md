# Bilulu Reshoot-Liste — Stand 2026-08-14 (verifizierter Apply-Lauf)

Ersetzt die zweite Fassung vom selben Tag (Nachbearbeitungs-Update,
~19:00 UTC). Diese Version folgt auf den tatsächlichen **Live-Einsatz** von
`bil2462-studio-normalize.mjs` gegen alle 27 Medusa-Produktfotos (Upload +
`PATCH product.thumbnail` via des neuen `bil2462-apply-normalizer.mjs`) und
eine erneute, automatisierte Prüfung mit `bil2462-image-grader.mjs` gegen die
tatsächlich live geschalteten Bilder — nicht mehr nur eine Stichproben-Sichtprüfung.

## Korrektur zur zweiten Fassung

Die zweite Fassung behauptete: „13 Bilder wurden erfolgreich normalisiert
(sichtbarer Grauton-Repaint), nur 2 echte Reshoot-Kandidaten." Das war
**nicht zutreffend** — der Normalizer wurde damals nie tatsächlich hochgeladen
und live geschaltet, nur lokal gegen eine Kopie getestet, und die
Erfolgsmeldung wurde nicht gegen echte Vorher/Nachher-Pixel geprüft.

Beim tatsächlichen Live-Einsatz heute Abend kam heraus:

1. **Bug im Normalizer:** Die Border-seeded-Flood-Fill lief gegen das schon
   von BIL-2455 hinzugefügte, gleichmäßige Studio-Grau-Passepartout um jedes
   Foto — nicht gegen den eigentlichen Original-Hintergrund. Der Sprung
   zwischen dem sauberen Passepartout-Grau und dem eigentlichen Foto-Rand war
   für den Flood-Fill-Toleranzwert zu groß, sodass die Pipeline nur das
   ohnehin schon saubere Passepartout "gefunden" hat. Das erzeugte in ~8
   Fällen ein `[segmented]`-Log mit angeblichem Erfolg, das visuell aber
   **keine sichtbare Änderung** bewirkte (Pixel-Diff bestätigt: 0.9–4.6 % der
   Fläche geändert, alles im Passepartout-Randbereich, nicht im Foto).
   → Gefixt in `bil2462-studio-normalize.mjs` (neuer Schritt: Passepartout
   zuerst abschneiden, bevor auf dem echten Originalfoto segmentiert wird).
2. **Nach dem Fix:** Alle 27 Bilder laufen ehrlich durch die Pipeline. Kein
   einziges davon erfüllt aktuell die eingebauten Sicherheits-Checks für einen
   automatischen Hintergrund-Repaint (siehe „Nichts wegretuschieren" in
   STUDIO-LOOK.md) — bei allen 27 füllt entweder das Kleidungsstück fast den
   ganzen Rahmen, oder der Original-Hintergrund ist zu dunkel/zu ungleichmäßig,
   um ohne Risiko für echten Stoff automatisch ersetzt zu werden. Die Pipeline
   verweigert dann korrekt den Eingriff und behält nur den bewährten
   Crop-/Zentrier-Schritt (BIL-2455) bei — kein Bild wurde beschädigt oder
   verschlechtert, aber auch keins bekam einen echten Hintergrund-Repaint.

## Ergebnis der `bil2462-image-grader.mjs`-Prüfung gegen die live geschalteten Bilder

(27 Medusa-Produktfotos, nach dem Apply-Lauf von heute Abend, ~19:17 UTC)

| Verdikt | Anzahl |
|---|---:|
| **reshoot** (dark-backdrop / tilt) | 24 |
| **keep-with-warnings** (grey-backdrop, grenzwertig) | 2 |
| **ok** | 1 |

Die 24 "reshoot"-Fälle zeigen im Live-Katalog (Screenshot
`bilulu.de/catalog`, 2026-08-14 ~19:15 UTC) einen klar sichtbaren, vom
Studio-Grau abweichenden Hintergrund — das ist **kein Messfehler des
Graders**: bei mehreren Fällen (z. B. „Winter-Kinder", „Kleiner Zoo", „Bunte
Wildblumen", „Marienkäfer") habe ich das bei voller Auflösung visuell
gegengeprüft, der dunkle Hintergrund ist eindeutig im ganzen Bild sichtbar,
nicht nur eine Fehlmessung an bedrucktem Stoff in der Bildmitte.

**Konkret betroffen** (dark-backdrop, `backdropL` je nach Bild 51–130 statt
Ziel 200): Boho-Regenbogen Mütze + Loop-Schal, Winter-Kinder Mütze,
Boho-Regenbogen Mütze mint, Kleiner Zoo Dreieckstuch, Aquarell-Blüten
Turban-Mütze (+ Schräglage), Rosen Baby-Mütze navy, Pastell-Aquarell
Turban-Mütze, Marienkäfer Set, Bunte Wildblumen Turban-Mütze, Schmetterlinge
& Pusteblumen Dreieckstuch, Eukalyptus Pumphose, Regenbogen-Schmetterlinge
Pumphose, Blätter-Aquarell Pumphose, Rosen Pumphose, Wildblumen Pumphose,
Wale marineblau Pumphose (+ Schräglage), Anker & Sterne Pumphose (+
Schräglage), Pferde & Blumen Pumphose, Regenbogen & Wolken Pumphose (+
Schräglage), Füchse im Wald Pumphose, Dinos türkis-Bund Pumphose (nur
Schräglage), Wale altrosa Pumphose, Erdbeeren Pumphose, Dinos
orange-Bündchen Pumphose.

**Grenzwertig** (grey-backdrop, akzeptabel aber nicht perfekt): Rosen
Turban-Mütze lila (L=146), Vintage-Rosen Pumphose (L=151).

**Bereits gut:** Dinos rosa mit braunem Bund Pumphose.

## Was das für den Shop bedeutet

Der Katalog hat aktuell KEINE einheitliche Hintergrundfarbe über alle
Produktfotos hinweg — rund 24 von 27 echten Produktfotos zeigen noch ihren
Original-Studio-Hintergrund (mal dunkelgrau, mal navy, mal mit
Belichtungs-Verlauf) statt des Ziel-Grautons `200/200/198`. Das ist der
sichtbare Bruch im „eine professionelle Foto-Serie"-Eindruck, den das Board
angesprochen hat.

## Was automatisiert NICHT sicher lösbar ist

Die Sicherheits-Checks in `bil2462-studio-normalize.mjs` sind absichtlich so
konservativ, dass sie lieber gar nichts tun als riskieren, echten Stoff zu
löschen (z. B. ein dunkles Muster mit dem Hintergrund zu verwechseln). Für
alle 24 "reshoot"-Fälle braucht es entweder:

- **Reshoot** auf dem neuen Studio-Grau-Hintergrund (bevorzugt — siehe
  FOTO-GUIDELINE-SABINE.md), oder
- **Manuelle Nachbearbeitung durch einen Menschen** (Lasso-Auswahl +
  Grauton-Fläche in einem Bildbearbeitungsprogramm) für Fotos, die nicht neu
  geschossen werden können.

Eine weitere automatische Iteration (z. B. Uniformitäts- statt
Helligkeits-Schwellenwert für die Hintergrunderkennung) könnte einen Teil
davon zusätzlich lösen, ist aber ein eigenständiges, riskanteres
Bildverarbeitungs-Projekt (Gefahr: echten dunklen Stoff fälschlich als
Hintergrund zu löschen) und wird hier nicht ungeprüft nachgeschoben.

## Externe Bilder (unverändert, separates Ticket nötig)

- Bilulu-Pumphose (Konfigurator) — `bilulu.de/products/pumphose/pumphose-01.jpg`
- Body — `bilulu.de/konfigurator/body-foto/base.webp`
- Bio-Baumwolle Strampler – Waldtiere (SVG-Platzhalter)
- Jersey Bodysuits Set – Regenbogen (SVG-Platzhalter)
- Musselinhose – Salbeigrün (SVG-Platzhalter)
- Wendejacke – Punkte & Streifen (SVG-Platzhalter)
- Spielanzug mit Füßen – Sternchen (SVG-Platzhalter)

Die SVG-Platzhalter sind kein Fotografie-Problem, sondern fehlende
Produktfotos — eigenes Ticket, kein Reshoot im klassischen Sinn.

## Update 2026-08-17 — Ursache für "immer noch uneinheitlich" gefunden + behoben

QA hat am 2026-08-17 live nachgewiesen, dass der Katalog trotz des
20%-Fixes vom 16.08. weiter uneinheitlich aussah. Zwei getrennte Ursachen:

1. **Der 20%-Fix vom 16.08. lief nur gegen die 6 Karten aus dem damaligen
   WhatsApp-Foto**, nicht gegen alle 34 Katalog-Produkte. Die übrigen 21
   Produktfotos liefen noch mit dem alten `PAD_RATIO=0.06` (praktisch
   unsichtbares Passepartout). Heute erneut korrigiert: **alle 27
   Medusa-gehosteten Produktfotos** liefen erneut durch
   `bil2462-apply-normalizer.mjs`, diesmal katalogweit (nicht stichprobenhaft),
   mit einem auf **`PAD_RATIO=0.12`** reduzierten Wert (20% erzeugte laut
   Board-Feedback vom 17.08. zu viel Leerraum — 12% ist der Kompromiss:
   deutlich sichtbarer als die alte unsichtbare 6%-Variante, aber das Produkt
   füllt wieder den Großteil der Karte). Alle 27 laufen weiterhin im
   `fallback`-Modus (kein Hintergrund-Repaint, siehe Sicherheits-Checks oben)
   — aber jetzt mit identischem Rahmenverhältnis, nicht mehr gemischt
   6%/20%/unbearbeitet.
2. **Frontend-Ursache, wichtiger als die Bild-Pipeline selbst:** Alle
   Produktkarten (Katalog `catalog/page.tsx:116`, Startseite `page.tsx:238`,
   PDP `product/[id]/page.tsx:78`, Warenkorb `cart/page.tsx:112`) rendern das
   Bild in einem Container mit `bg-gradient-to-br from-binchen-cream
   to-binchen-cream-dark` **plus** zusätzlichem `object-contain p-3`/`p-4`/`p-6`
   Padding — obendrauf auf das bereits im Bild eingebackene Grau-Passepartout.
   Das erzeugt einen sichtbaren Doppelrahmen (innen Studio-Grau aus dem Bild,
   außen Creme-Verlauf aus dem Card-Container) und unterläuft den
   einheitlichen Studio-Look strukturell, unabhängig davon wie gut die
   Bild-Nachbearbeitung ist. Fix-Vorschlag an Frontend siehe BIL-2462-Kommentar
   / Child-Issue: Card-Hintergrund auf `#C8C8C6` (Studio-Grau, identisch zum
   Bild-Canvas) statt Creme-Verlauf, `object-contain`-Padding entfernen (das
   Passepartout ist schon im Bild), da die 1200×1200-Canvas das Padding
   bereits mitbringt.

Ergebnis: Bild-Pipeline ist jetzt katalogweit konsistent (12% Grau bei allen
27 echten Fotos + Pumphose-Konfigurator-Sonderfall unten). Der Card-Wrapper
braucht noch den Frontend-Fix, um den Doppelrahmen-Effekt zu beseitigen.

### Pumphose-Konfigurator-Karte (Sonderfall, kein Medusa-Upload)

`pumphose-01.jpg` liegt als Storefront-Static-Asset vor (nicht im
Medusa-Upload-Pipeline-Pfad), daher übersprang der Batch-Lauf sie
automatisch (`SKIP_NON_STATIC`). Manuell durch denselben Normalizer
geschickt: das Ausgangsfoto hat bereits einen **echten weißen
Studio-Hintergrund** (kein Passepartout-Nachtrag), und die weißen
Bündchen des Kleidungsstücks sind vom weißen Hintergrund farblich nicht
sicher unterscheidbar — die Segmentierung verweigert hier zurecht den
Eingriff (sonst würde sie echte weiße Stoffdetails mitlöschen, siehe
„nichts wegretuschieren"). Ergebnis: Grau-Passepartout jetzt im gleichen
12%-Verhältnis wie alle anderen Karten, aber der weiße Innenrand um das
Foto bleibt sichtbar (Doppelrahmen-Effekt bei dieser einen Karte). Braucht
einen echten Reshoot auf Studio-Grau-Hintergrund, um das vollständig zu
lösen — bis dahin ist das der beste sichere Zwischenstand.
