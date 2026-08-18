### Nachtrag — gegengemessen auf dem konvergierten Stand

[BIL-2497](/BIL/issues/BIL-2497) hat um 09:35 seine nahtlosen Kacheln mit `--apply` ausgerollt, während ich gemessen habe. Der jetzt auf Platte liegende Stand ist also: **nahtlose 512er Kacheln (BIL-2497) + die 128er Chips und der Code aus diesem Ticket**. Damit meine Zahlen nicht für einen Zwischenstand gelten, habe ich nachgemessen (3 Läufe):

| Seite | Performance | LCP |
| --- | --- | --- |
| `/konfigurator/hose` (uni) | 99 / 98 / 99 | 1.9 s |
| `?hose=stoff-14` | 93 / 95 / **96** (Median 95) | 2.7 s |
| `?hose=stoff-14&rot=90` | 95 / 94 / 95 (Median 95) | 2.7 s |

Unverändert gegenüber meiner Messung. Die nahtlose Aufbereitung kostet ~2.6 % mehr Bytes pro Kachel (110 kB → 113 kB bei `stoff-14`, 376 → 378 kB Seitengewicht), was im Rauschen liegt. `public/stoffe` bleibt bei 2.8 MB.

Die 35 geänderten `stoff-NN.webp` im Working Tree gehören zu BIL-2497 und werden dort committet — ich fasse sie nicht an. Die Chips (`-128.webp`) sind davon nicht betroffen.
