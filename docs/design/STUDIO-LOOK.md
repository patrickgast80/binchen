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
- **Foto-eigene Backdrop-Farbe:** Seit Board-Direktive 2026-08-17 füllt die Canvas mit der tatsächlich am Rand des jeweiligen Fotos gemessenen Farbe (`pickCanvasBg` in `bil2462-studio-normalize.mjs`), nicht mehr mit einem für alle Bilder festen Grau. Jedes Foto behält so seinen eigenen, echten Studio-Hintergrund statt eines aufgezwungenen Einheitstons.
- **Fallback:** RGB **`200 / 200 / 198`** (Hex `#C8C8C6`) nur, wenn die gemessene Randfarbe nicht plausibel nach Studio-Hintergrund aussieht (zu dunkel/gesättigt — z. B. Kleidungsstück füllt den ganzen Rand, oder ein nicht-neutraler Tisch/Boden).
- **Verboten:** dunkler Vinyl-Boden, Holzmaserung, Teppich, Bettdecke, Sofa, Wand mit Steckdose, Tisch mit Kante — diese Fotos sollten neu geschossen werden statt sich auf den Fallback zu verlassen.

## Ränder & Komposition
- **Innenrand:** **5 %** freier Canvas rundum (`PAD_RATIO` in `bil2462-studio-normalize.mjs`; Verlauf: 6 % war auf Karten-Größe praktisch unsichtbar → 20 % testweise → 12 % ab BIL-2483 → 5 % seit Board-Direktive 2026-08-17 "Grösse des Produkts maximieren", möglich weil der Rand jetzt die foto-eigene Backdrop-Farbe trägt statt eines fest-grauen Rechtecks). Kein Kleidungsstück berührt die Bildkante.
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
2. Design-Agent führt `apps/storefront/scripts/bil2462-studio-normalize.mjs` aus:
   - EXIF-Orientation gebacken
   - Optional `--rotate 90|180|270`, wenn die Ausrichtung (Mützen-Öffnung/Pumphosen-Beine nach unten) korrigiert werden muss
   - Creme-Rahmen automatisch erkannt und weggeschnitten
   - Trim auf den Kleidungs-Bounding-Box
   - Hintergrund-Farbangleich (Median-Farbe der Randzone des jeweiligen Fotos → eigene Canvas-Füllfarbe; Fallback-Grau `200/200/198` nur bei unplausiblem Rand)
   - Sanfte Rand-Blende (2 % Feather), damit kein Rechteck-Seam sichtbar bleibt
   - Zentriert auf 1200 × 1200 Canvas
3. Ergebnis wird über Medusa-Admin (`POST /admin/uploads` → `PATCH product.thumbnail`) hochgeladen.
4. QA prüft nach Deploy per URL-Vergleich Startseite / Katalog / PDP.

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
