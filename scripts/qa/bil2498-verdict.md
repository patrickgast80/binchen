## QA-Verdikt: PASS — Live-Abnahme BIL-2493 (Stoff-Kacheln)

Alle sechs Schritte + Lighthouse live auf `bilulu.de` (nicht lokal) gegengeprüft, Stand main@8930425 (inkl. BIL-2497-Nahtlos-Kacheln, wie in der Beschreibung angekündigt). Skripte liegen unter `apps/e2e/scripts/bil2498-hose-live-verify.mjs` und `bil2498-chips-network-live.mjs`, Belege unter `apps/e2e/reports/bil2498-live/`.

### 1. Druck scharf? ✅
`live-stoff14-desktop-preview.png` / `live-stoff14-mobile-preview.png` (1440×900 und 390×844): Blütenkonturen klar, keine Weichzeichnung. (Die feinen Kachel-Nähte im Bild sind BIL-2497-Terrain, nicht Gegenstand hier — Schärfe ist grün.)

### 2. Palette (35 Chips) ✅
`chips-result.json`: 35/35 `-128.webp` → HTTP 200, Ø 5,6 kB, keine 404. `palette-full-desktop.png` zeigt alle 35 Kreise mit echtem Stoffdruck, kein flacher/leerer Chip.

### 3. Rotation ✅
`rot-{0,90,180,270}-{mobile,desktop}.png`: Druck dreht sichtbar (Blumen-Ausrichtung wechselt), Silhouette bleibt exakt stehen. Byte-Vergleich 0°/90°/180°/270° bestätigt: alle vier Screenshots sind paarweise unterschiedlich (kein stiller No-op).

### 4. Merken ✅
`saved-thumbnail-rot90.png`: Thumbnail zeigt Stoff 14 in 90°-Drehung. Gespeicherter Name „Hose — Petrol · Stoff 14 · Petrol · Muster 90°", Href trägt `rot=90`.

### 5. Teilen ✅
OG-Karte direkt geladen (nicht nur Status geprüft): `og-hose-rot0.png` / `og-hose-rot90.png`, beide `200 image/png`, Trace-Header `x-og-photo=fs:4L:1F:r{0,90}:388kb` — Fabric-Zone + Rotationswinkel sind im gerenderten Bild nachweisbar.

### 6. Netzwerk ✅
Seitenaufruf `?hose=stoff-14`: `stoff-14.webp` = **110 kB** (Ziel ~110 kB, nicht ~444 kB). Null `-256.webp`-Requests (Dateien liefern live korrekt 404). Alle 35 Chip-Requests grün.

### Lighthouse mobile, live, je 3 Läufe (Median)
| Case | URL | Perf-Läufe | Median |
| --- | --- | --- | --- |
| Kontrolle (uni) | `/konfigurator/hose` | 99 / 96 / 96 | 96 |
| **Stoff-14** (DoD-Ziel) | `?hose=stoff-14` | 91 / 94 / 97 | **94** |
| Stoff-14 + rot=90 | `?hose=stoff-14&rot=90` | 96 / 86 / 91 | **91** |

Beide Stoff-Fälle liegen im Median über der geforderten Schwelle **>= 90**. Der einzelne Ausreisser (86 bei rot90 Lauf 2) bestätigt genau das im Ticket erwähnte Messrauschen — Median bleibt stabil bei 91.

### Ergebnis
Definition of Done erfüllt: alle sechs Schritte grün, Lighthouse-Median >= 90 auf beiden relevanten URLs, Screenshots bei 390×844 und 1440×900 im Report-Ordner. Keine Regression durch den gleichzeitig live gegangenen BIL-2497-Stand.

BIL-2493 kann geschlossen werden.
