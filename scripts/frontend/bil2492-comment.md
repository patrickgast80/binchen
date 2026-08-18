## Umgesetzt — `main@e5c0cf9`

Der Hauptstoff lässt sich jetzt in 90°-Schritten drehen (0/90/180/270), und zwar in **allen fünf** Konfiguratoren: Hose, Body, Turban, Mütze, Dreieckstuch. Punkt 1 des Auftrags („wenn es mit wenig Mehraufwand für alle Stoff-Zonen geht") ist damit vollständig — Stoffdrucke sind laut Board-Regel ohnehin nur auf der Hauptzone erlaubt (`allowsFabrics` steht in jeder `palette.ts` genau einmal), deshalb deckt **ein** Query-Parameter `?rot=` alle drehbaren Zonen ab. Kein Follow-up nötig.

### Rendering

Die Drehung liegt — wie im Ticket vorgegeben — auf der **Musterkachel vor dem Tiling**, nicht auf der fertigen Komposition. Silhouette, Masken und Zonen stehen exakt still, nur der Druck dreht sich:

- 0°/180°: die Kachel-Ebene ist so groß wie das Foto.
- 90°/270°: die Kachel-Ebene tilet in einer Box mit **vertauschter Breite/Höhe**, damit die gedrehte Fläche das Foto randlos deckt. `background-size` ist ein Prozentwert *dieser* Box, skaliert also mit dem Seitenverhältnis mit — sonst wäre die Kachel nach der Drehung sichtbar größer. Deshalb bekommt `ZoneOverlay` jetzt ein `ratio`-Prop aus den `ASSET_W/ASSET_H` des jeweiligen Fotos.

**Beleg** (Anhänge `hose-desktop-rot0.png` / `hose-desktop-rot90.png`): die Denim-Streifen laufen bei 0° waagerecht, bei 90° senkrecht — Bund, Bündchen und Hosenform sind Pixel für Pixel identisch. Alle vier Winkel sind separat geschossen und byte-unterschiedlich.

### Save/Share (BIL-2454)

Der Winkel steht in der URL wie jede Farbwahl, also tragen geteilte Links und gemerkte Konfigurationen ihn automatisch — verifiziert, nicht angenommen:

```
og:image  → /api/og/konfig/hose?hose=stoff-14&rot=90
og:title  → Hose-Konfigurator — Petrol · Stoff 14 · Petrol · Muster 90°
saved href → /konfigurator/hose?hose=stoff-14&rot=90
saved name → Hose — Petrol · Stoff 14 · Petrol · Muster 90°
```

**Beim Prüfen der OG-Karte kam ein älterer Fehler hoch, der nichts mit Rotation zu tun hatte:** OG-Karte und Merken-Thumbnail haben bisher *überhaupt keinen* Stoffdruck gezeigt, sondern nur die Durchschnittsfarbe des Swatches. Eine gemerkte „Stoff 14"-Karte war von einem Pastellblau-Uni nicht zu unterscheiden, und die geteilte Karte spiegelte die Vorschau schlicht nicht. Da Punkt 3 des Auftrags genau das verlangt, habe ich beide nachgezogen: der sharp-Kompositor (OG) und der Canvas-Renderer (Thumbnail) kacheln jetzt die echte Textur inklusive Drehung. Siehe `og-compose-hose-rot0/90.png` und `saved-thumbnail-rot0/90.png` — vorher waren das flache Farbflächen.

### Warenkorb

`musterRotation` wandert als Line-Item-Metadatum mit und erscheint als „Muster: 90° gedreht" in der Warenkorbzeile — sonst käme die Ausrichtung bei Sabine nicht mit der Bestellung an. Bei 0° bleibt die Zeile weg.

### UI

Ein zyklischer Button **„Muster drehen"** mit sichtbarem Winkel. Bewusst *kein* Vierer-Radiogroup: so dreht jede Foto-App (Jakobs Gesetz), es kostet ein Tap-Target statt vier in der ohnehin engen Aktionszeile, und es bleibt ein 44px-Ziel (gemessen: 180×44 im Mobile-Sheet). Der Button erscheint nur, solange die Hauptzone auch wirklich einen Druck trägt — bei einer Uni-Farbe wäre er ein totes Bedienelement (verifiziert: bei Uni ist er nicht im DOM).

- **Desktop**: in der Aktionszeile unter der Vorschau, vor „Konfiguration teilen" (`control-desktop-after-rot90.png`).
- **Mobil**: zusätzlich unten im Palette-Sheet unter den Swatches, direkt im Daumenbereich (`control-mobile-sheet.png`).

### Verifikation

| Prüfung | Ergebnis |
| --- | --- |
| `next build` | sauber, 24/24 Seiten, Konfigurator-Seiten 116–117 kB First Load JS (keine neue Runtime-Dependency) |
| `next lint` | 0 Warnungen/Fehler |
| axe (WCAG 2.1 A/AA) | **0 Violations** — Desktop gedreht, Desktop Uni, Mobile-Sheet |
| Konsole | keine `console.error`, keine React-Key-Warnungen |
| Klick-Zyklus | 90 → 180 → 270 → 0, URL und `aria-label` folgen jedes Mal; per Tastatur (Fokus + Enter) bedienbar |
| Reaktionszeit | 70–155 ms pro Drehung im eingeschwungenen Zustand (Doherty < 400 ms erfüllt) |
| Screenshots | 390×844 und 1440×900, alle fünf Konfiguratoren |

Skripte liegen im Repo: `apps/e2e/scripts/bil2492-{rotation,control,save-a11y}-*.mjs` und `apps/storefront/scripts/bil2492-og-compose-check.mjs`.

Zwei Dinge, die ich beim Prüfen bewusst *nicht* als Beweis gelten lasse:

1. `/api/og/konfig/*` gibt lokal 500 — `next/og` lässt sich auf Windows/Node 24 nicht mal importieren (ERR_INVALID_URL auf seinen eigenen Font-Pfad). Ein lokaler 500 dort sagt nichts über Produktion. Deshalb rufe ich `composeKonfigPhoto` direkt auf und **sehe mir das PNG an**, statt einem grünen Content-Type zu glauben.
2. Die ersten Screenshots waren wertlos — auf 390px verdeckte der Cookie-Banner die komplette Vorschau, und vier „unterschiedliche" Winkel waren byte-identisch. Das Skript setzt jetzt eine „nur technisch notwendige"-Entscheidung vor dem Laden (es klickt *nicht* auf Akzeptieren, es wird also kein optionales Cookie gesetzt).

### Perf — ein Befund, der nicht von diesem Ticket kommt

Lighthouse mobile auf einem lokalen Production-Build, gleicher Build, nur andere Auswahl:

| Seite | Performance | LCP |
| --- | --- | --- |
| `/konfigurator/hose` (Uni, Default-Zustand) | **96** | 2,6 s |
| `?hose=stoff-14` (Stoffdruck, Verhalten wie vorher) | **82** | 4,7 s |
| `?hose=stoff-14&rot=90` (gedreht) | **82** | 4,7 s |

**Die Drehung selbst kostet nichts** — gedreht und ungedreht messen identisch (zweiter Lauf 80/82 = Messrauschen), sie fügt keinen einzigen Request hinzu. Der Einbruch von 96 auf 82 kommt allein daher, dass überhaupt ein Stoffdruck gewählt ist: die Kacheln sind 1024×1024 und ~444 kB pro Stoff (~11 MB für 70 Dateien), gerendert werden sie mit 160–380 CSS-Pixeln.

Das liegt unter der 90er-Latte, ist aber Bestandsverhalten und nicht Teil dieses Auftrags — ich habe es deshalb **nicht** hier mit hineingezogen, sondern als Kind-Issue **„Konfigurator: Stoff-Kacheln sind zu schwer"** mit den Messwerten und einem konkreten Plan angelegt. Der Default-Zustand der Seite (Uni) liegt weiterhin bei 96.

### Offen

Live-Gegenprobe auf bilulu.de, sobald der Coolify-Poller `main@e5c0cf9` ausgerollt hat — läuft, Ergebnis kommt in diesen Thread.
