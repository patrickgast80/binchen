## Stoffdrucke kacheln jetzt nahtlos — alle 35 Stoffe, alle Renderpfade

Patricks Befund stimmte genau: der Swatch war ein simpler Mittel-Crop des
Stofffotos, und `background-repeat: repeat` hat daraus ein hartes Rechteckraster
gemacht — Blüten mittendurch abgeschnitten, abrupter Neustart.

**Umgesetzt ist Option 1 aus dem Ticket** (Swatches selbst nahtlos machen).
Das war die richtige Wahl, weil alle drei Renderpfade dieselbe Datei lesen
(`textureSrc` → `/stoffe/stoff-NN.webp`): Live-Vorschau (`zone-overlay.tsx`),
OG-Karte (`compose.ts`) und Merken-Thumbnail (`thumbnail.ts`). Der Fix greift
damit überall gleichzeitig, **ohne eine Zeile Renderer-Code zu ändern**.

Mirror-Tiling (Option 2) habe ich bewusst nicht genommen — genau aus dem im
Ticket genannten Grund: bei den gerichteten Prints (Einhörner, Figuren) hätte
das Schmetterlings-Artefakte gegeben. Es wird nirgends gespiegelt.

### Was den Naht-Eindruck ausgemacht hat — es waren zwei Ursachen

1. **Beleuchtung.** Jeder Swatch ist ein Handyfoto von Stoff auf dem Tisch, also
   auf einer Seite heller. Wiederholt ergibt das ein Schachbrett aus hellen und
   dunklen Blöcken — das Raster bleibt sichtbar, selbst wenn die Motive passen.
   Korrigiert über ein **Flat-Field per kleinster Quadrate (quadratische
   Fläche)**.
2. **Geometrie.** Wrap-around-Überlappung mit **Minimum-Error-Boundary-Cut**
   (Efros/Freeman), überblendet über eine Rampe *entlang dieses Schnitts*.

### Zwei Sackgassen, die ich verworfen habe (relevant fürs nächste Mal)

- **Lokale Beleuchtungsschätzung** (Blur bzw. Downscale-und-zurück) war der
  erste Versuch und ist **falsch**: wo die Motive groß sind, folgt das Feld den
  Motiven. Beim Einhorn-Stoff hat es die Einhörner selbst nachgezeichnet — das
  Teilen dadurch hat jedes Einhorn abgedunkelt und den blauen Grund angehoben,
  der ganze Swatch kam ausgewaschen und entsättigt heraus. Sechs Koeffizienten
  können sich wie eine Vignette über das Bild biegen, aber nicht um ein Motiv
  herum. Passt zur `konfigurator_neutral_base_pipeline`-Lehre: **nie blurren,
  um Muster zu entfernen**.
- **Nur der harte Schnitt, ohne Rampe** war bei den handgemalten Streifen
  schlechter als das Original: die Streifen wackeln, der Schnitt versetzt sie um
  ein paar Pixel, und man sah eine Reihe von Stufen. Die Rampe löst das auf, und
  weil sie auf dem Minimum-Error-Pfad sitzt, überblendet sie zwei Bereiche, die
  ohnehin fast gleich sind — der Blumenstoff verliert dadurch keine Schärfe.

Zusätzlich wird die **Kachelgröße gesucht statt festgelegt**: ein Print mit
echtem Rapport wickelt sich bei einem Vielfachen seiner Periode fast gratis, bei
der halben Periode dagegen mies. Genau das hatte die Streifenstoffe noch mit
einem vertikalen Versatz zurückgelassen. Kandidaten werden danach bewertet, was
der Schnitt, den wir tatsächlich machen würden, kosten würde.

### Rotation (BIL-2492)

Braucht keine Extraarbeit und ist trotzdem geprüft: eine Kachel, die in x und y
wickelt, wickelt auch nach einer Vierteldrehung — die Drehung tauscht nur die
Achsen. Alle Belege liegen bei 0° **und** 90° vor.

### Zahlen

Metrik: **Naht-Energie** = Wiederhol-Kante im Verhältnis zu einer normalen
Pixelkante im selben Stoff. `1.00` heißt: die Wiederhol-Grenze ist statistisch
nicht von irgendeiner anderen Pixelspalte zu unterscheiden, also unsichtbar.
Gemessen an der **fertig encodierten** Kachel, damit auch ein durch WebP oder
Resize wieder eingeschleppter Sprung auffällt.

| | vorher | nachher |
|---|---|---|
| Durchschnitt über alle 35 | 4.45 | **1.17** |
| schlechtester Stoff | 15.23 | 3.20 |

Die verbliebenen Ausreißer sind kontrastarme, glatte Stoffe (z. B. `stoff-29`),
bei denen schon eine winzige absolute Differenz das Verhältnis hebt — auf den
Crops ist dort nichts zu sehen. Deshalb liegen Bilder bei, nicht nur Zahlen.

### Belege

Crops liegen in `apps/e2e/reports/bil2497/`, **3×3 gekachelt und exakt auf das
Wiederhol-Kreuz geschnitten** (volle Screenshots verstecken die Naht — die Falle
aus dem Ticket). Abgedeckt sind die drei geforderten Klassen:

- `stoff-30` — Patricks Blumenstoff aus dem Foto: **7.13 → 1.11**
- `stoff-04`, `stoff-15` — gerichtete Prints: **11.52 → 1.44** bzw. 3.17 → 1.14
- `stoff-20`, `stoff-08` — kräftige und feine Streifen: **15.23 → 1.25** / 11.02 → 1.83
- `stoff-19` — Kontrolle, war schon nahtlos und ist es geblieben (1.07 → 1.10)

Dazu `preview/`: echter Browser, **390×844 und 1440×900**, je bei 0° und 90°,
mit Zoom auf die Vorschaumitte.

Hinweis zur Ehrlichkeit der Belege: die Crops rendern die Kachel bei 260 CSS px.
BIL-2493 hat inzwischen ~190 CSS px nachgemessen — die Bilder zeigen die Naht
also eher **größer**, als die Kundin sie je zu sehen bekäme.

### Perf

Bewusst **byte-neutral** auf dem LCP-Pfad, damit die BIL-2493-Arbeit nicht
zurückgedreht wird: 512er Kachel und Encoder-Einstellungen unverändert
übernommen, über alle 35 Dateien 2390 kB statt 2393 kB. Chips, `manifest.json`
und `fabrics.generated.ts` sind **nicht** angefasst.

### Abstimmung mit den Parallel-Läufen

BIL-2493 hat im selben Checkout an denselben Dateien gearbeitet. Ich habe
gewartet, bis der Lauf still war, und erst dann `public/stoffe` geschrieben —
kein paralleler `next build`, kein Branch-Wechsel unter dem anderen Lauf. BIL-2493
hat seinerseits eine Warnung in `bil2455-build-fabric-swatches.mjs` ergänzt: das
alte Skript schreibt den einfachen Mittel-Crop und würde die nahtlosen Kacheln
überschreiben, wenn es erneut läuft.

### Stand

Auf `main` (`3b5b71c`) und gepusht. Die Live-Gegenprobe auf bilulu.de läuft
gerade — sie misst die **deployte Kachel-Datei selbst** (nicht Screenshots, die
laut `bil2492`-Lehre still identisch sein können) und zieht zusätzlich die
OG-Karte je Konfigurator mit `x-og-photo`-Header-Check. Ergebnis kommt als
Folgekommentar.
