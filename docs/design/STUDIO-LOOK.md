# Bilulu — Studio-Look Spezifikation

Verbindlicher Standard für alle Produktbilder auf bilulu.de. Gilt für Startseite,
Katalog, Produktdetailseite (PDP), Konfigurator-Vorschauen und Social-Media-Kacheln.
Ziel: die Produktfotos müssen wirken wie **eine professionelle Studio-Serie**,
nicht wie eine Sammlung von Zuhause-Schnappschüssen.

## Marke in einem Satz
Warm, familiennah, modernes Handmade — ehrliche Fotos, die den Charakter der
handgenähten Sachen zeigen, aber ohne den optischen Lärm einer Wohnzimmer-Kulisse.

## Bildformat
- **Auflösung:** 1200 × 1200 Pixel, quadratisch, JPEG (Qualität 88, Chroma 4:4:4).
- **Dateigröße-Zielkorridor:** 120 – 260 KB. Größer nur wenn ein Muster wirklich fein aufgelöst werden muss.
- **Farbraum:** sRGB. Kein AdobeRGB, kein ProPhoto.
- **EXIF-Orientierung:** in Pixel gebacken (Sharp `.rotate()` vor der weiteren Bearbeitung).

## Hintergrund
- **EINE Farbe für ALLE Bilder — Board-Direktive 2026-08-17 (BIL-2486), ersetzt die vorherige "foto-eigene Backdrop"-Regel vom selben Tag:** Board-Feedback auf BIL-1: "kann der designer die kleider nicht perfekt ausschneiden so dass überall die selbe farbe als hintergrund ist?" Jedes Produktfoto wird per echter KI-Segmentierung freigestellt (`@imgly/background-removal-node`, ONNX-Foreground-Segmentierung, lokal/offline, kein API-Key) und auf **RGB `240 / 235 / 225` (Hex `#F0EBE1`)** compositet — exakt `binchen.cream-dark` aus `apps/storefront/tailwind.config.*`, also identisch mit der Produktkarten-Hintergrundfarbe selbst (nahtloser Übergang Foto→Karte). Kein Original-Studiohintergrund bleibt sichtbar, unabhängig davon wie ungleichmäßig/dunkel/gemustert der tatsächliche Fotohintergrund war.
- **Kein Fallback-Grau mehr nötig:** die alte `200/200/198`-Fallback-Logik (`bil2462-studio-normalize.mjs`, Flood-Fill) galt nur für die alte Crop+Mat-Pipeline, die auf einen einigermaßen gleichmäßigen Fotorand angewiesen war. Echte ML-Segmentierung schneidet unabhängig von der Randfarbe/-gleichmäßigkeit.
- Pipeline-Skript: `apps/storefront/scripts/bil2486-segment-normalize.mjs`. Das alte `bil2462-studio-normalize.mjs` (Flood-Fill) bleibt im Repo als Referenz/Fallback, ist aber nicht mehr die Standard-Pipeline.

## Ränder & Komposition
- **Innenrand:** **4 %** freier Canvas rundum (`PAD_RATIO` in `bil2486-segment-normalize.mjs`; Verlauf: 6 % → 20 % → 12 % → 5 % → 4 %, s. Historie oben — mit echtem Cutout auf Einheitsfarbe ist der Rand rein kosmetisch minimal, das Produkt darf die Karte praktisch ausfüllen). Kein Kleidungsstück berührt die Bildkante.
- **Zentrierung:** Schwerpunkt des Produktes sitzt im **optischen Zentrum** (leicht oberhalb der geometrischen Mitte, ca. 48 % vom oberen Rand).
- **Ausrichtung:** senkrechte Kanten (Bündchen, Nahtlinien) sind visuell senkrecht — max. ±2° Kippen. Kein diagonales Präsentieren.
- **Produkt-Orientierung:** Mützen liegen mit der Öffnung (Bündchen/Saum) nach unten, Pumphosen mit dem Bund oben und den Beinabschlüssen nach unten — einheitlich über die ganze Serie (Board-Direktive 2026-08-17). Bei neuen Fotos direkt so ablegen; bei Nachbearbeitung per `--rotate` in `bil2462-studio-normalize.mjs`.
- **Falten:** flach ausgelegt, Bündchen glatt gezogen, keine Handmulden im Stoff. Wenn ein Kleidungsstück Volumen braucht (z. B. Turban), mit unsichtbarem Papier ausstopfen — nicht knautschen.

## Licht
- **Farbtemperatur:** **5200 – 5600 K** (Tageslicht / Neutralweiß). Kein warmes Glühlampenlicht (< 3500 K), kein kühles Neonlicht (> 6500 K).
- **Weißabgleich:** vor der Serie einmal auf einem echten weißen Blatt Papier setzen — Kamera oder Handy im **manuellen** WB-Modus fixieren, damit alle Bilder eines Shoots identisch sind.
- **Charakter:** weich, indirekt. Fenster-Nordlicht + weißer Reflektor gegenüber ist die günstigste Studio-Lösung. Direkte Sonne, Blitz oder Handy-Taschenlampe sind tabu.
- **Schatten:** dezent, unter dem Produkt bleibend, nicht schräg über das Bild. Wenn möglich: gar kein sichtbarer Schatten (Diffusor über dem Motiv).

## Farbe & Retusche
- **Nichts erfinden.** Kein Farbboost, der das Terracotta zu Neonorange dreht. Die Kundschaft muss bekommen, was sie sieht.
- **Nichts wegretuschieren**, was am realen Kleidungsstück existiert (sichtbare Overlock-Naht innen: entweder rausdrehen beim Fotografieren oder als Realität stehenlassen — nicht mit dem Stempel-Werkzeug ausblenden).
- **Zulässig:** Belichtung ±0,3 EV, Weißabgleich um ±150 K, sehr sanftes Nachschärfen (Radius 0,4 / Betrag 40), Fusselretusche (Staub, Fäden, Tierhaare vom Boden).
- **Nicht zulässig:** Hautglättung im Motiv, Sättigungs-Boost, kreative Grade (Filmlooks, Instagram-Filter).

## Marken-Wortmarke „made with love"-Label
- Wenn das Label sichtbar ist, muss es **lesbar oben rechts** oder **lesbar unten rechts** am Bündchen liegen — nicht kopfüber, nicht halb verdeckt.
- Bei Serienbildern in derselben Position, damit die Serie zusammenhält.
- Wenn das Fotografieren mit Label unruhig wirkt, Label vor der Aufnahme nach innen falten (weglassen ist erlaubt, verdrehen nicht).

## Serie & Konsistenz
Alle Bilder eines Shoot-Tags müssen zusammen einer Reihe angehören: gleicher WB,
gleiche Belichtung, gleicher Abstand, gleiche Höhe der Kamera. **Nicht** zwischen
Kacheln die Kamera bewegen — das Motiv wandert, die Kamera bleibt fix.

## Pipeline (was passiert nach dem Auslösen)
1. Sabine schießt in ihrem Home-Setup (siehe [FOTO-GUIDELINE-SABINE.md](./FOTO-GUIDELINE-SABINE.md)) und lädt die Rohbilder in einen Ordner hoch.
2. Design-Agent führt `apps/storefront/scripts/bil2486-segment-normalize.mjs` aus:
   - EXIF-Orientation gebacken
   - KI-Freisteller (`@imgly/background-removal-node`) trennt Produkt von Hintergrund — unabhängig von der tatsächlichen Backdrop-Farbe/-Gleichmäßigkeit
   - Trim auf die Alpha-Bounding-Box, skaliert auf die Canvas-Innenfläche
   - Zentriert auf 1200 × 1200 Canvas, Hintergrund immer `#F0EBE1`
   - **Kein separater `--rotate`-Schritt mehr in diesem Skript** — Ausrichtung (Mützen-Öffnung/Pumphosen-Beine nach unten) muss vor dem Lauf im Quellfoto stimmen, sonst vorher mit `sharp .rotate(deg)` einmalig drehen.
   - Achtung: `@imgly/background-removal-node` ist bewusst NICHT `apps/storefront/package.json`/pnpm-lock hinzugefügt (zieht `onnxruntime-node`, ~100 MB, das die Next.js-App nie braucht) — vor dem Lauf einmalig ad hoc installieren (siehe Kommentar im Skriptkopf).
3. **Einzelprüfung jedes Bildes** (nicht nur Stichprobe) auf Segmentierungsartefakte: abgeschnittene Bänder/Bommeln, ausgefranste Kanten, Mannequin-/Kopfform-Reste.
4. Ergebnis wird über Medusa-Admin (`POST /admin/uploads` → `PATCH product.thumbnail`) hochgeladen. Ausnahme: `apps/storefront/public/products/pumphose/pumphose-01.jpg` (Konfigurator-Anker-Produkt) hängt nicht an Medusa — direkt im Repo ersetzen und deployen.
5. QA prüft nach Deploy per URL-Vergleich Startseite / Katalog / PDP; Pipette-Stichprobe an mehreren Kartenrändern muss exakt `#F0EBE1` ergeben.

## Was das Foto NIE zeigen darf
- Backdrop-Kante (der Übergang vom Vinyl zur Wand)
- Kabel, Halterungen, Zange, Klammern
- Andere Kleidungsstücke im Anschnitt
- Zeitstempel, Wasserzeichen
- Rohes „made in EU"-Etikett — das gehört auf die PDP als Text, nicht ins Bild

## Reshoot-Kriterien (wann ist ein Bild nicht rettbar?)
Ein Bild muss **neu aufgenommen** werden, wenn eines dieser Merkmale zutrifft:
- Sichtbarer dunkler Backdrop-Rechteck-Rand nach Normalizer-Lauf (2-Tone-Effekt)
- Motiv um mehr als 5° verdreht (kann nicht ohne Zuschnitt-Verlust korrigiert werden)
- Falten im Stoff, die den Print verdecken
- Innensaum / Overlock-Naht sichtbar (Kleidungsstück lag falsch herum)
- Weißabgleich sichtbar warm/kalt gegenüber der Serie
- Motiv-Auflösung unter 900 × 900 nach Zuschnitt
- Öffnung/Bund nicht eindeutig erkennbar (z. B. Pumphose so gefaltet, dass weder Bund noch Beinabschlüsse sichtbar sind) — die Ausrichtung lässt sich dann nicht sicher korrigieren

## Änderungen dieses Standards
Bevor dieser Standard geändert wird: Rücksprache mit CEO + Board. Der Standard
bestimmt, wie professionell der ganze Shop wirkt — er darf nicht pro Shoot driften.
