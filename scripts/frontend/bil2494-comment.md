## Galerie ist live — `main@6119df5` + `8e8978b`, verifiziert auf https://bilulu.de

Die PDP hatte tatsächlich keine Galerie-Komponente, nur `heroImage`. Neu:
`apps/storefront/src/components/product/product-gallery.tsx` — grosses Hero
plus anklickbare Thumbnails. Der Datenkontrakt aus dem Ticket hat gehalten,
am Fetch war nichts zu ändern.

### Was ich gebaut habe

- **Reihenfolge unangetastet.** `images[0]` bleibt das Titelbild, keine
  clientseitige Sortierung (Lehre aus BIL-2485). Das Thumbnail wird nur dann
  vorangestellt, wenn es gar nicht in `images` vorkommt — siehe Fund unten.
- **Umschalten ohne Nachladen.** Alle Bilder bleiben gemountet und werden per
  Opacity gekreuzt; nur Bild 1 ist `priority`, der Rest `lazy`. Klick auf ein
  Thumbnail zeigt das Bild sofort statt erst einen leeren Rahmen
  (Doherty <400ms). Messung unten belegt, dass der LCP-Slot beim Titelbild
  bleibt.
- **Ein Bild = unverändert.** Bei genau einem Bild wird keine Leiste
  gerendert; die zehn Einzel-Produkte sehen aus wie vorher (2 Kontrollen im
  Testlauf, Screenshot unten).
- **Layout.** Mobil Thumbnails unter dem Hero, ab `lg` als vertikale Leiste
  links daneben. Grund: bei 1440x900 landet ein Streifen unter dem quadratischen
  Hero **unter der Falz** — die Zweitbilder wären genau so unsichtbar geblieben
  wie vorher, nur eleganter. Jakob's Law: Leiste links ist das Muster, das
  Kund:innen aus anderen Shops kennen.
- **A11y.** Echte `<button>`s (64/80px, > 44px Fitts), `aria-current`,
  `aria-label` "Bild 2 von 3 anzeigen", `aria-live`-Statuszeile, inaktive
  Bilder `aria-hidden`, Pfeil links/rechts blättert mit Fokus-Mitführung,
  sichtbarer Fokusring, `motion-reduce:transition-none`.

### Belege (live, nicht lokal)

`node apps/e2e/scripts/bil2494-gallery-verify.mjs https://bilulu.de bil2494-live`
— 20/20 PASS auf **390x844 und 1440x900**:

| Produkt | Thumbnails | aktiv nach Klick auf letztes |
|---|---|---|
| Set Mütze + Loop "Boho-Regenbogen" | 3 | Ansicht 3 |
| Set Dreieckstuch + Halstuch "Schmetterlinge" | 2 | Ansicht 2 |
| Set Dreieckstuch + Halstuch "Kleiner Zoo" | 2 | Ansicht 2 |
| Turban "Aquarell-Blüten" bordeaux | 2 | Ansicht 2 |
| Turban "Bunte Wildblumen" | 2 | Ansicht 2 |
| Turban "Pastell-Aquarell" (Zusatzfund) | 5 | Ansicht 5 |
| Pumphose "Eukalyptus" / Mütze "Schneeflocken" (Kontrolle) | 0 | — |

Dazu je Viewport: axe WCAG 2.0/2.1 A+AA → **0 Violations**, Konsole → **0 Fehler**,
Hero-Seitenverhältnis 1.000 (Regression, siehe Tradeoffs).

Screenshots im Anhang (live, `reports/bil2494-live/`):
`set-muetze-loop-boho-mobile-3.png`, `set-muetze-loop-boho-desktop-1.png`,
`turban-wildblumen-desktop-2.png`, `set-schmetterlinge-hellblau-mobile-2.png`,
`pumphose-eukalyptus-desktop.png` (Kontrolle unverändert).

**Performance** (`bil2494-perf.mjs`, live, 390x844, 4x CPU + Fast 3G):
Galerie-PDP **LCP 1224 ms, CLS 0**, LCP-Element = das Titelbild — die drei
zusätzlichen Bilder verdrängen es also nicht. Einzelbild-PDP zum Vergleich
LCP 1188 ms. Kein Lighthouse-Binary in diesem Checkout; ich habe deshalb genau
die zwei Metriken gemessen, die diese Änderung riskiert, statt einen
Score zu behaupten. Route-JS `/product/[id]`: 0,15 kB → 1,68 kB
(+1,5 kB für die Client-Komponente), First Load 110 kB.

### Zwei Funde nebenbei

1. **Es sind sieben Produkte, nicht fünf.** `Turban-Mütze "Pastell-Aquarell"`
   (`prod_01KZ0VZR3GRE02ZXNAE1M1KJP0`) hat 4 Bilder, der Konfigurator-Artikel
   `Bilulu-Pumphose` 5. Beide profitieren automatisch mit.
2. **Pastell-Aquarell hat ein Thumbnail, das nicht in `images` steht**
   (`1786988873708-…jpg` vs. `photo-16…20.jpg`). Die Galerie stellt es deshalb
   voran → 5 Einträge. Das ist bewusst so: das Katalog-Kachelbild muss auf der
   PDP als erstes Bild auftauchen, sonst weicht die PDP vom Katalog ab. Falls
   das Thumbnail nur eine Re-Crop-Variante eines der vier Fotos ist, wäre das
   ein Daten-Aufräumer im Backend, kein Frontend-Fix — @Backend, mag das jemand
   beim nächsten Bild-Durchgang prüfen?

### Tradeoffs / Ehrlichkeit

- Beim Umbau auf die Leiste hatte ich zwischendurch eine echte Regression: als
  gestrecktes Flex-Kind wuchs der Hero auf Texthöhe, `aspect-square` verlor und
  `object-contain` hat das 1200x1200-Foto mit grauen Balken letterboxed. Gefixt
  mit `lg:items-start`; das Verify-Skript prüft das Seitenverhältnis jetzt bei
  jedem Lauf mit, damit es nicht stillschweigend zurückkommt.
- **Kein Swipe** auf Mobil — nur Thumbnails. Bei 2–3 Bildern ist die Leiste
  sichtbar und sofort erreichbar; eine Swipe-Carousel-Mechanik hätte mehr
  Fläche und mehr Code gekostet, als der Nutzen hier rechtfertigt. Wenn Sabine
  später Serien mit 5+ Bildern liefert, lohnt sich das neu zu bewerten.
- Direkt nach dem Deploy lieferten drei Requests 502 (Container noch im
  Hochfahren). Zwei komplette Nachläufe über alle sechs PDPs: 0 Fehler. Falls
  das erneut auftaucht, ist es DevOps/Deploy-Fenster, nicht die Galerie.
- Das Cookie-Banner ist ein Bottom-Sheet und verdeckt auf Mobil die
  Thumbnail-Leiste, bis man es wegklickt — vorbestehendes Verhalten des
  Banners, nicht Teil dieses Tickets, aber auf den Screenshots sichtbar.

### An QA

Zum Nachprüfen — Live-URLs, beide Viewports 390x844 + 1440x900:

- https://bilulu.de/product/prod_01KZ0VZMJWFC9Z00XVNDFYZ6M2 (3 Bilder)
- https://bilulu.de/product/prod_01KZ0VZSG4DBE6M148W1TK681B (2, Set)
- https://bilulu.de/product/prod_01KZ0VZP4NSTXGTYAT43J51ZTN (2, Set)
- https://bilulu.de/product/prod_01KZ0VZQ16YTDT81JT5WAFSSZ0 (2)
- https://bilulu.de/product/prod_01KZ0VZS1Y5TFKDJTV2KXERNJV (2)
- https://bilulu.de/product/prod_01KZ0VZSWB1BA91FBFGKDY6QKV (Kontrolle: 1 Bild,
  muss aussehen wie vorher — keine Leiste)

Schritte: Thumbnail anklicken → Hero wechselt sofort; Tab bis zur Leiste →
Fokusring sichtbar, Pfeil links/rechts blättert; Screenreader liest
"Bild 2 von 3". Reproduzierbar mit
`node apps/e2e/scripts/bil2494-gallery-verify.mjs https://bilulu.de bil2494-live`.
