# BIL-2508 — Systempruefung aller 35 Stoffe

Belege: sheets/grid-after-*.png (alle 35 gekachelt), sheets/changed-*.png (Vorher/Nachher der 12 geaenderten), sheets/*-SvQ.png (beide Kandidaten im Direktvergleich).

| Stoff | Methode | Kachel | Kohaerenz | Ergebnis |
|---|---|---|---|---|
| stoff-01 | quilt | 512x512 | 0.034 | ok, unveraendert |
| stoff-02 | quilt | 512x512 | 0.059 | ok, unveraendert |
| stoff-03 | straight | 373x703 | 0.007 | **nachgebessert** |
| stoff-04 | quilt | 512x512 | 0.032 | ok, unveraendert |
| stoff-05 | quilt | 512x512 | 0.049 | Naht ok, aber Wiederhol-Raster des Grundes sichtbar → Folgeticket |
| stoff-06 | quilt | 512x512 | 0.041 | Naht ok, aber Wiederhol-Raster des Grundes sichtbar → Folgeticket |
| stoff-07 | quilt | 512x512 | 0.075 | ok, unveraendert |
| stoff-08 | straight | 493x532 | 0.977 | **nachgebessert** |
| stoff-09 | straight | 456x575 | 0.784 | **nachgebessert** |
| stoff-10 | straight | 447x586 | 0.765 | **nachgebessert** |
| stoff-11 | straight | 571x459 | 0.979 | **nachgebessert** |
| stoff-12 | quilt | 512x512 | 0.089 | ok, unveraendert |
| stoff-13 | quilt | 512x512 | 0.042 | ok, unveraendert |
| stoff-14 | quilt | 512x512 | 0.036 | ok, unveraendert |
| stoff-15 | quilt | 512x512 | 0.143 | Naht ok, aber Wiederhol-Raster des Grundes sichtbar → Folgeticket |
| stoff-16 | straight | 518x506 | 0.145 | **nachgebessert** |
| stoff-17 | quilt | 512x512 | 0.024 | ok, unveraendert |
| stoff-18 | straight | 534x491 | 0.055 | **nachgebessert** |
| stoff-19 | quilt | 512x512 | 0.054 | Naht ok, aber Wiederhol-Raster des Grundes sichtbar → Folgeticket |
| stoff-20 | straight | 581x451 | 0.981 | **nachgebessert** |
| stoff-21 | quilt | 512x512 | 0.022 | ok, unveraendert |
| stoff-22 | straight | 419x625 | 0.065 | **nachgebessert** |
| stoff-23 | straight | 401x654 | 0.042 | **nachgebessert** |
| stoff-24 | quilt | 512x512 | 0.062 | ok, unveraendert |
| stoff-25 | straight | 511x513 | 0.595 | **nachgebessert** |
| stoff-26 | quilt | 512x512 | 0.04 | ok, unveraendert |
| stoff-27 | quilt | 512x512 | 0.059 | ok, unveraendert |
| stoff-28 | quilt | 512x512 | 0.012 | ok, unveraendert |
| stoff-29 | quilt | 512x512 | 0.105 | ok, unveraendert |
| stoff-30 | quilt | 512x512 | 0.062 | ok, unveraendert |
| stoff-31 | straight | 555x473 | 0.033 | **nachgebessert** |
| stoff-32 | quilt | 512x512 | 0.059 | ok, unveraendert |
| stoff-33 | quilt | 512x512 | 0.042 | ok, unveraendert |
| stoff-34 | quilt | 512x512 | 0.043 | ok, unveraendert |
| stoff-35 | quilt | 512x512 | 0.03 | ok, unveraendert |

35 geprueft, 12 nachgebessert, 4 mit Restbefund, 19 unveraendert ok.
