## BIL-2493 erledigt — Stoff-Kacheln auf die real gerenderte Größe gebracht

**Surface:** `/konfigurator/hose` (und damit body / turban / muetze / dreieckstuch, die dieselbe Palette und denselben `ZoneOverlay` teilen).

### Ergebnis

Lighthouse mobile, lokaler **Production**-Build, 5 Läufe je Fall, Median:

| Seite | vorher | nachher | LCP vorher → nachher | Seitengewicht |
| --- | --- | --- | --- | --- |
| `/konfigurator/hose` (uni, Kontrolle) | 99 | **99** | 2.0 s → 2.0 s | 260 kB (unverändert) |
| `?hose=stoff-14` | 82 | **95** | 4.4 s → 2.8 s | 702 → **376 kB** |
| `?hose=stoff-14&rot=90` | 83 | **95** | 4.4 s → 2.8 s | 702 → **376 kB** |

Einzelläufe nachher: `fabric` [95, 95, 96, 92, 87], `rot90` [93, 95, 94, 95, 95]. Der 87er hatte TBT 389 ms statt ~150 ms — Hintergrundlast auf der Maschine, nicht die Seite. CLS überall 0.000.

Die Baseline reproduziert eure Messung fast exakt (82 / LCP 4.4 s gegen eure 82 / 4.7 s), also ist der Vergleich belastbar.

`public/stoffe`: **11 MB → 2.8 MB**. `stoff-14.webp`: 444 kB → 110 kB, dazu 7 kB Chip.

### Was gemacht wurde

1. **Kachel 1024 → 512.** Nachgemessen am ausgelieferten Layout, nicht geschätzt: die Vorschau ist bei 1440 px Desktop ~450 CSS px breit, die Kachel also ~190 CSS px — ~380 Geräte-Pixel bei DPR 2. 512 deckt das mit Reserve ab. 384 habe ich verworfen: bei Mobile DPR 3 (~500 Geräte-Pixel) wäre das eine echte Hochskalierung.
2. **Eigener Chip, 128×128** (~5.5 kB im Schnitt statt bis zu 444 kB). `Swatch.chipSrc`, `swatchChipStyle` nimmt `chipSrc ?? textureSrc`. Gilt automatisch auch für die mobile Palette-Sheet.
3. **Generator neu gefahren**, nicht die Assets von Hand angefasst — `bil2455-build-fabric-swatches.mjs`, jetzt mit `effort: 6`, Prune alter Chip-Größen (die 35 `-256.webp` sind weg) und Byte-Report. Qualität bleibt bei q80: von q80 auf q72 spart bei 512 px nur noch ~15 %, das Gewicht kam aus der Auflösung, nicht aus der Kompression.
4. `fabrics.generated.ts` führt jetzt beide Quellen, `hex`/`id`/`name` sind byte-identisch geblieben.

### Wichtiger Befund für die Nachverfolgung

Der Engpass war **nicht nur** das Gewicht. Das LCP-Element ist `base.webp` (37 kB), und der größte Posten ist die **Render Delay** — die gekachelte, maskierte `multiply`-Ebene rastert im selben Frame. Deshalb wirkt die kleinere Kachel doppelt (weniger Bytes *und* weniger Rasterfläche), und deshalb bringt weiteres Verkleinern kaum noch etwas: uni ohne Stoff liegt bei LCP 2.0 s, mit Stoff bei 2.8 s. Die verbleibenden 0.8 s sind Rasterkosten, kein Netzwerk.

Nebenbei: die 34 nicht sichtbaren Chips lädt Chrome ohnehin erst beim Scrollen. Punkt 2 rettet also nicht das LCP, sondern die ~9.5 MB, die beim Scrollen durch die Palette nachgeladen wurden.

### Optisch unverändert (DoD)

- Vorschau-Diff 1440 px Desktop: **PSNR 37.8 dB**, max. Abweichung 37/255, 3.6 % der Pixel über Delta 8. Mobil 48.7 dB. Bei 2× Zoom auf den Druck (also 4× Bildschirmgröße) ist kein Unterschied zu sehen — `diff-stoff14-desktop-zoom.png`.
- Gegenprobe mit `stoff-20` (feiner, hochfrequenter Streifendruck, der am ehesten matschen würde): 39.9 dB.
- **OG-Karte**: `composeKonfigPhoto` direkt nachgerechnet (`next/og` lässt sich auf Windows/Node 24 nicht importieren, ein Status-Check würde also nichts beweisen). PSNR 42 dB gegen vorher, rot0/rot90 weiterhin unterschiedlich. Die Karte komponiert bei 447×500 — die Kachel landet dort bei ~190 px, 512 ist also reichlich.
- **Merken-Thumbnail**: Canvas-Pfad gefahren, Stoff und Rotation korrekt — `saved-thumbnail-rot90.png`.
- axe: **0 Violations** (desktop / uni / mobile-sheet), keine Console-Errors.

### Screenshots

`apps/e2e/reports/bil2493/` — `after-*-{mobile,desktop}.png` (390×844 / 1440×900, DSF 2), `before-*` zum Vergleich, `after-chips-desktop.png` für die Palette, `diff-og-zoom.png`, `saved-thumbnail-rot90.png`.

### Tradeoffs / Hinweise

- **Commit-Provenienz:** der eigentliche Inhalt liegt in `f24396e`, das ein Parallel-Run mit `git add -A` unter dem BIL-2496-Betreff mitcommittet hat. Inhalt stimmt und ist verifiziert, nur der Betreff passt nicht. Nachtrag + Erklärung in `23ae2a3`.
- **Berührung mit [BIL-2497](/BIL/issues/BIL-2497):** beide schreiben `public/stoffe/stoff-NN.webp`. Kein Konflikt — BIL-2497 hat die 512 bereits übernommen und fasst die Chips bewusst nicht an. Ich habe eine Warnung in den bil2455-Generator gesetzt, dass ein erneuter Lauf die nahtlosen Kacheln überschreibt. Wenn BIL-2497 seine Kacheln mit `--apply` ausrollt, sind die Chips weiterhin aus dem alten Mittel-Crop — bei 44 px unsichtbar, aber erwähnt sei es.
- Gemessen wurde lokal. Die ersten Läufe dieses Durchgangs gingen versehentlich gegen einen fremden Dev-Server auf Port 3311 und waren wertlos; alle Zahlen oben stammen von einem eigenen `next start` auf 3399 mit gehashten Prod-Chunks.

### Übergabe an QA

@qa — bitte E2E gegen die Live-Seite, sobald deployt:

- **URLs:** `/konfigurator/hose?hose=stoff-14`, `…&rot=90`, `/konfigurator/hose` als Kontrolle
- **Viewports:** 390×844 und 1440×900
- **Schritte:** Stoff wählen → Druck scharf? · Palette durchscrollen → alle 35 Chips zeigen Stoff, keine leeren/flachen Kreise · „Muster drehen" 0/90/180/270 → Druck dreht, Silhouette nicht · „Merken" → Thumbnail zeigt den gewählten Stoff · Link teilen → OG-Karte zeigt denselben Stoff
- **Perf:** Lighthouse mobile auf `?hose=stoff-14` soll ≥ 90 liefern. Bitte mehrfach laufen lassen und den Median nehmen — ein Einzellauf schwankt hier um mehrere Punkte.

Skripte liegen bei: `apps/e2e/scripts/bil2493-lighthouse.mjs` (braucht `LIGHTHOUSE_CLI` + `CHROME_PATH`), `bil2493-shots.mjs`, `bil2493-swap-assets.mjs` (Vorher/Nachher-Assets ohne Rebuild tauschen).
