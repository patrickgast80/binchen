## Pass 3 ist live — Falten, Ripp und Nähte auf `hose-kurz`

Live auf bilulu.de seit `main@e8234dd`. Patricks Konfiguration ist dieselbe URL wie in seinem Screenshot: `https://bilulu.de/konfigurator/hose-kurz?hose=stoff-25`.

**Bogen fürs Board:** `apps/e2e/reports/bil2533/evidence/sheet-desktop.png` — links jeweils vorher, rechts nachher, vier Konfigurationen untereinander.

Das „Vorher" ist nicht aus dem Gedächtnis rekonstruiert: es ist dieselbe Live-Seite mit abgewürgtem `relief.webp`, die dokumentiert auf den CSS-Multiply zurückfällt — also exakt der Zustand, den Patrick fotografiert hat. Beide Hälften stammen aus demselben Lauf gegen denselben Server.

### 1. Falten — die Zahl, nicht das Gefühl

Entscheidend ist nicht der mittlere Versatz, sondern seine **Streuung über eine Faltenbreite**: ein konstanter Versatz schiebt das ganze Muster und fällt niemandem auf.

| | lokale SD über 80 px | gegen einen ~27 px breiten Streifen |
|---|---|---|
| vorher (Pass 2) | 1,36 px | 5 % einer Streifenbreite |
| **nachher** | **6,66 px** | **~ein Viertel** |

Warum das vorher nicht einfach lauter gedreht war: der Gain für die *erfundenen* Falten und der für die *fotografierten* waren derselbe Regler. Was das `hose-kurz`-Basisfoto an Eigenstruktur hat, ist der Bundkamm und die Bündchen-Rippe — ein feiner senkrechter Kamm. Wer den weit genug verstärkt, um einen Streifen zu biegen, macht Cord aus dem ganzen Teil. `warpDrape` trennt die beiden jetzt.

**Die Decke setzen nicht die Streifen, sondern die Motive.** Ab etwa 7,6 px lokaler SD verlaufen den Pferden die Gesichter, und das liest sich als Stoffschaden statt als Fall. Deshalb wächst mit dem Gain auch die Faltenweite (40 → 68 px) — eine echte Pumphose fällt breit, nicht alle 40 px. 6,66 px ist bewusst unter der Schadensgrenze gewählt und nicht das Maximum; wenn das Board mehr will, ist der nächste Schritt bessere Motiv-Treue, nicht mehr Gain.

### 2. Bund und Bündchen — warum sie flach waren

Die Uni-Zonen liefen **gar nicht** durch die Relief-Ebene. Sie wurden nach „hat kein `textureSrc`" aussortiert, mit der Begründung, eine Uni-Farbe habe keine Geometrie zu verzerren. Das war die falsche Hälfte des Satzes: sie hat keinen *Druck* zu verzerren, aber genauso viel Geometrie wie ein Muster. Genau deshalb stand ein flacher Farbverlauf neben einem gerippten Original.

Ripp und Nähte kommen jetzt aus dem **Schnitt**, nicht aus dem Foto: pro Zusammenhangskomponente einer Zonenmaske die Hauptachse, Rippen senkrecht dazu. Pro Komponente, weil die beiden Beinbündchen sich eine Maskendatei teilen — eine einzige Hauptachse über beide hätte zwei gegenläufige Kurven zu einer Diagonale gemittelt, die zu keiner passt.

Eine Falle dabei, die schon einmal teuer war: das Ripp **dunkelt nur**. Der Shade-Kanal ist bei 1,0 gedeckelt und der Bund liegt im Mittel bei 0,91 — eine Rippe, die ihre Rücken aufhellt, hätte davon den größeren Teil flach gegen die Decke geclippt. Die erste Fassung tat genau das und lieferte Flecken statt Rippen. Das ist die Ridge-Clipping-Falle aus BIL-2522, eine Ebene tiefer.

### 3. Nähte

Bundansatz und Beinabschlüsse bekommen eine Rille plus die Aufwölbung der Nahtzugabe daneben. Eine Zonenkante, die *auch* Silhouette ist, wird davon ausgenommen — das ist der Saumumschlag, den der Rim-Term schon behandelt, und ihn zweimal zu dunkeln lässt das Teil zerstoßen aussehen.

Alles davon liegt in `relief.webp`. Kein neues Asset, +42 kB.

### Belege

- **Jitter-Kontrolle:** 8/8 Fällen (4 Konfigurationen × Desktop 1440 / 390 px mobil) dieselbe URL zweimal → md5 identisch. 0 console.error, Relief-Canvas in allen Fällen sichtbar (370–896 ms).
- **Keine Regression:** `?rot=90` ✓ (Zeile 4 im Bogen), OG-Karte 200/image-png in drei Varianten, Schildchen-Zone in jedem Nachher-Bild unversehrt, add-to-cart → `/cart?added=konfigurator` ohne Fehlertext, Warenkorb nicht leer.
- **Zweiter Musterstoff:** stoff-01 (Zeile 2 im Bogen), wie im Akzeptanzkriterium verlangt.

### Perf — und ein Fehler, den ich dabei gemacht habe

Der erste Commit brachte eine echte Regression, die ich beim Gegenmessen gefunden habe: `hose-kurz` mit reinen Uni-Farben ging von TTI 3,5 s auf **7,4 s** (7384 / 7393 / 7447 / 9581 ms, 4 von 4 Läufen), während die Kontrollen sich nicht bewegten. Ursache: eine Uni-Zone kommt als 1×1-Kachel herein, und für ein einziges Texel ist der Catmull-Rom-Sampler sechzehn Taps Arithmetik mit bekanntem Ergebnis — mal drei Zonen, für nichts.

Behoben in `main@e8234dd`. Dass der Kurzschluss nichts ändert, ist geprüft und nicht behauptet: alle 12 Palettenfarben × alle 256 Shade-Stufen × das volle Grain-Fenster (162 816 Fälle) ergeben 0 abweichende Bytes, und die Offline-Renderings sind vor/nach md5-gleich.

Stand danach, gegen die BIL-2531-Messlatte (TTI 3,69 s, 0 späte Long Tasks):

| Variante | TTI r1 / r2 | späte Long Tasks |
|---|---|---|
| hose-kurz stoff-25 (geändert) | 3452 / 3553 ms | 0 |
| hose-kurz uni (geändert) | 3164 / 3237 ms | 0 |
| hose stoff-15 (Kontrolle) | 7017 / 3595 ms | 0 |
| turban uni (Kontrolle) | 3443 / 3730 ms | 0 |

Der Ausreißer bei der *unveränderten* Kontrolle (7017 ms) ist der Grund, warum die Kontrollen mitlaufen: derselbe späte Relief-Block tritt auch auf einer Seite auf, die ich nicht angefasst habe. Er ist also nicht neu — nur trat er bei Uni vor dem Fix 4/4 mal auf und danach 0/2. Als eigene Restklasse unten notiert.

### Was ich bewusst NICHT gemacht habe

1. **Kein Rollout auf die anderen vier.** `uniZones` und `ZONE_STRUCTURE` sind per Konfigurator opt-in, `hose-kurz` ist der einzige eingetragene. So verlangt es das Ticket: erst der Proof zum Board.
2. **Die Silhouette ist nur teilweise entstanzt.** Die Nahttiefe sitzt, aber die Außenkante hat weiterhin kleine Zacken — die stammen aus den Zonenmasken selbst, nicht aus der Schattierung, und sind mit dieser Mechanik nicht zu reparieren.
3. **Die OG-Karte zeigt weiterhin den flachen Look.** Sie läuft über den CSS-Composite-Pfad, nicht über die Relief-Ebene. Das ist seit BIL-2522 so und durch diesen Pass weder besser noch schlechter geworden — aber es heißt, dass ein geteilter Link anders aussieht als die Seite.

Für alle drei lege ich Folgetickets an, sobald das Board den Proof gesehen hat — sie vorher aufzumachen hieße, die Richtung zu raten.

**@CEO:** von mir aus kann das so zu Patrick. Der Bogen ist `apps/e2e/reports/bil2533/evidence/sheet-desktop.png`, die Einzelbilder liegen daneben; sein Original-Foto zum Danebenhalten ist `infra/.vault/telegram-media/telegram-6032147460-67.jpg`.
