## Realismus-Pass: Ursache gefunden, 3 von 6 Konfiguratoren umgestellt

**Commits:** `699f42e` (Hose + Hose kurz), `6535307` (Mütze) — beide auf `main`, Auto-Deploy läuft.

### Warum es „ausgemalt" aussah

Ich habe zuerst gemessen statt geraten. Die Basis jedes Konfigurators ist ein **glatter Ballon** — hier die ausgelieferte `base.webp` der kurzen Hose als PNG:

Das ist kein Bug, sondern genau das, was die Pipeline bauen sollte: `estimateIllumination` glättet die entdruckte Vorlage mit **Radius 40–70**, und das ist breit genug, um die Falten zusammen mit dem Druck zu löschen. Die Stofflichkeit wurde danach **synthetisch neu erfunden** (periodische Faltenfächer, Rippen). Regelmäßige Falten liest das Auge als *Dekor auf einer Form*, nicht als *Fall* — und der gekachelte Druck liegt dann zwangsläufig plan darauf.

### Was jetzt anders ist

Neue Stufe `scripts/lib/konfigurator-folds.mjs`:

- **`foldsFromPhoto`** — Motive werden als **Chroma-Ausreißer** erkannt und aus der Umgebung inpainted, danach Bandpass gegen denselben Radius, den die Beleuchtung ohnehin nutzt. Der Trick: eine Falte ändert, *wie viel Licht* der Stoff zurückgibt, nicht *welche Farbe* er hat. Anders als max/median/blur hat das **keine Skalengrenze** — die Falte drei Pixel neben einem Motiv behält ihre echte Luminanz.
- **`applyRealFolds`** — schreibt den Faltenanteil in die Multiply-Basis, pro Zone mit deren eigener `span` skaliert. Kämme werden bei `ceiling 246` gekappt, der Rest geht auf die **Screen-Ebene** — 255 unter multiply wäre die reine Swatch-Farbe und damit exakt die Ridge-Clipping-Outline aus BIL-2461. Täler bekommen Extra-Gewicht, weil multiply Schatten besser kann als Licht.
- Schattenboden **178/172 → 160/156**, Silhouetten-Occlusion **0.16/16px → 0.24/22px**. Die tiefste Falte konnte den Stoff vorher nur auf 67–70 % abdunkeln.
- Synthetische Rippen auf den Zonen mit echten Falten **halbiert** — periodische Wale auf gemessenen Falten ist Cord auf Latex (die BIL-2473-Beschwerde).

### Messung (σ auf Faltenskala, lokales Mittel abgezogen)

| Zone | vorher | nachher |
|---|---|---|
| hose-kurz/bund | 6.78 | **10.96** |
| hose-kurz/hose | 4.76 | **6.50** |
| hose-kurz/buendchen | 8.99 | **14.32** |
| hose/bund | 9.24 | **13.06** |
| hose/hose | 6.33 | **8.35** |
| hose/buendchen | 12.64 | **16.71** |
| muetze/futter | 12.54 | **14.23** |
| muetze/muetze | 6.68 | **7.96** |

### Was ich bewusst NICHT gemacht habe

**Der bedruckte Korpus bekommt keine „echten" Falten** — weil es dort keine gibt, die man herausrechnen kann. Bei der kurzen Hose deckt der Dino-Druck ~64 % der Fläche; ich habe vier Trennskalen durchprobiert (`fine/broad` = 5/46, 14/46, 22/60, 30/80) und **jede** liefert Dinosaurier statt Falten (`scripts/bil2509-band-probe.mjs`). Das würde einen Geister-Dino unter *jeden* Stoff prägen, den eine Kundin auswählt. Der Korpus behält deshalb den synthetischen Faltenwurf — mit längerer Reichweite, weil das Originalfoto den Fächer viel weiter herunterlaufen zeigt.

Das automatisch zu entscheiden habe ich **dreimal versucht und verworfen** (Deckungsgrad-Schwelle, Chroma-Korrelation, Energie-Verhältnis) — alle drei haben Zonen falsch einsortiert, die ich schon per Auge geprüft hatte. Am deutlichsten die lange Pumphose: ihre blassen Blüten reißen nur im Kern die Chroma-Schwelle, worauf der Fill den Kern aus seinem eigenen dunklen Hof zieht und **Blumen in die Basis prägt**. Deshalb steht jetzt pro Konfigurator explizit drin, welche Zone vertraut wird, mit Begründung. Was automatisch bleibt, ist der **Guard**: wird eine Trust-Zone je mit bedrucktem Stoff nachfotografiert, **bricht der Build ab**, statt still Geister auszuliefern.

### Die restlichen 3 sind ein anderes Problem — bitte hier entscheiden

Beim Durcharbeiten kam heraus, dass „alle 5" drei verschiedene Architekturen sind:

1. **Turban + Dreieckstuch** — deren Basis ist gar keine entdruckte Shading-Map, sondern **die rohe Foto-Luminanz** (`gray = 60 + lum/255*175`). Sie haben also schon echte Falten — aber **der Original-Druck ist mit eingebrannt**. Beim Turban liegen die grauen Rosen sichtbar in der Basis und multiplizieren sich unter *jeden* gewählten Stoff. Das ist ein größerer Mangel als die Flachheit und braucht eine Entdruck-Stufe, nicht diesen Faltenpass.
2. **Body** — die Basis ist **komplett gezeichnet** (`gray = 150` plus handgeschriebene Verläufe), kein Foto. σ auf Faltenskala 2.07, mit Abstand der flachste Wert. Da hilft kein Algorithmus; dafür braucht es ein Foto des echten Bodys von Sabine.

Ich lege dafür zwei Kind-Tickets an, statt sie hier stillschweigend offenzulassen.

### Verifikation

- Belege (links = live, rechts = neu): `apps/e2e/reports/bil2509/hose-kurz-patrick-config.png` (Patricks Konfiguration `hose=stoff-04&bund=mustard&rot=90`), `hose-hell.png`, `hose-dunkel.png`, `muetze.png`, Messtabelle in `measurements.txt`.
- **Dunkler Stoff gegengeprüft** (`stoff-30` + navy): mehr Faltenschatten, Druck bleibt lesbar, kein Absaufen.
- **Masken unverändert** — die Nahtlos-Kachelung aus BIL-2497 und die Label-Zusage sind nicht berührt. `bil2499-label-proof`: **PASS**, 0/255 Delta über 5 Kombinationen.
- Neues Werkzeug `scripts/bil2509-composite.mjs` bildet den Browser-Blend-Stack offline nach (inkl. gekachelter Stoffe und `?rot=`), damit so ein Vergleich nicht jedes Mal einen Dev-Server braucht.

**Offen in diesem Heartbeat:** Der Auto-Deploy war beim Schreiben noch nicht durch (live liegt noch die alte `base.webp`, 24682 B). Live-Abnahme am echten Viewport plus Lighthouse gehen an QA — die Assets sind reine Bild-Dateien, gleiche Anzahl, gleiche Maße, also erwarte ich kein Budget-Thema, aber gemessen ist gemessen.
