## Zwischenstand — Proof auf der Hose steht, bitte einmal draufschauen

Wie im Ticket vorgesehen: erst **ein** Konfigurator, Belege ins Ticket, dann erst der Rollout auf die anderen vier. Die Hose ist fertig und lokal live verifiziert.

### Was die Vorschau vorher verraten hat

Die gewählte Stoffkachel lag als **flache Tapete** unter `mix-blend-mode: multiply` über dem Hosenfoto. Multiply verändert nur die *Helligkeit* des Drucks — seine *Geometrie* nie. Also lief das Muster schnurgerade durch jede Falte, wurde an den runden Beinen nicht schmaler, und lief nahtlos über die Bundnaht, als wäre die Hose aus einem Stück Tapete. Dazu lag ein breiter weißer „Sheen"-Fleck über dem halben rechten Bein und hat den Druck dort ausgewaschen.

### Was jetzt passiert

Pro Konfigurator gibt es eine **Relief-Karte** (`relief.webp`), die dem Renderer sagt, wie der Stoff auf dem Kleidungsstück liegt:

| Effekt | Woher er kommt |
|---|---|
| **Muster folgt den Falten** | Faltenband aus dem Originalfoto → Texturversatz entlang der Steigung |
| **Muster rollt um die Beine** | Die Beine sind Zylinder. Abstand zur Silhouette = Radius, Versatz `asin(s) − s` nach außen. Reine Geometrie |
| **Licht färbt den Stoff** | Sättigung fällt im Schatten ab (nicht nur die Helligkeit), kühles Umgebungslicht in den tiefen Schatten, warmes Streiflicht in den Lichtern |
| **Kante wirkt nicht ausgestanzt** | Kontaktschatten in den letzten ~11 px der Silhouette |
| **Kein Tapeten-Effekt** | Rapport-Versatz pro Schnittteil — Bund und Bündchen sitzen jetzt versetzt zum Korpus, wie zugeschnittene Teile |
| **Fallenwurf im Korpus** | BIL-2509 konnte im Hosenkorpus keine echten Falten bergen (der Quelldruck ist zu dicht — jede Bandpass-Skala liefert Motive statt Falten). Es liegt daher ein **synthetischer, weicher Faltenwurf** aus der Geometrie in der Relief-Karte, der überall dort zurückweicht, wo das Foto echte Raffung hat (Bund, Bündchen). Uni-Farben sind davon **nicht** betroffen |

Der Sheen liegt jetzt **unter** der Stoffebene: dunkle Uni-Farben brauchen ihn (BIL-2461), ein Druck nicht.

### Belege

Bilder liegen im Repo — dieser Paperclip-Build hat keinen Attachment-Endpunkt (`POST …/attachments` → 404), deshalb sind sie als Work Products verlinkt:

* **Work Product „Vorher/Nachher/Realfoto — Beweisblätter Hose"** → `apps/storefront/reports/bil2522/`
  Am deutlichsten: `hose-stoff-20-petrol-rot90.png` (Streifenstoff — man sieht sofort, wie die Streifen sich um die Beine biegen) und `hose-stoff-15-sage.png`. Jedes Blatt: **flache Kachel | Relief-Stoff | echtes Produktfoto** nebeneinander.
* **Work Product „Live-Browser-Belege + Paritätsnachweis"** → `apps/storefront/reports/bil2522/live/`
  Echte Chromium-Screenshots der Konfigurator-Seite, Desktop 1440 und mobil 390, drei Stoffe.
* **Work Product „Branch"** → `designer/bil2522-relief-fabric`, Commit `8f7fc25`. **Noch nicht auf main.**

### Was geprüft ist

* **Browser == Offline-Render**: Die Per-Pixel-Mathematik liegt in *einem* Modul, das Browser und Node-Renderer beide importieren. Gemessen: mean |Δ| = **0.005**, max **4 von 255** (Rest = webp-Dekodierung). Die Vorher/Nachher-Blätter sind also eine Aussage über das, was der Shop wirklich malt — kein hübsches Offline-Bild.
* **Jitter-Kontrolle**: gleiche URL zweimal → **0 Byte Unterschied**, in allen 6 Viewport/Stoff-Kombinationen. Ohne das beweist ein Vorher/Nachher-Diff nichts.
* **Cookie-Banner-Falle**: Der erste Durchlauf lieferte auf 390 px zwei bytegleiche „Belege" — beides Fotos des Cookie-Banners. Consent wird jetzt vorab gesetzt und das Skript **bricht ab**, wenn die Vorschau unter der Palette-Sheet liegt.
* **Fallback**: `relief.webp` blockiert → alter CSS-Look, kein Loch. Belegt in allen 6 Kombinationen (`*-fallback.png`). Ohne JS ebenso: die CSS-Zonen rendern serverseitig weiter und werden erst ausgeblendet, wenn der Canvas wirklich gemalt hat.
* **Uni-Farben unverändert**: Uni-Zonen laufen weiter byte-genau über den bisherigen Multiply-Pfad.
* **Asset-Gewicht**: 218 kB, near-lossless mit einer Build-Zusicherung, dass der Versatz höchstens 0,57 px verfälscht wird. Wird erst im Idle geladen, LCP-Element (das Basisfoto) bleibt unangetastet, Canvas hat von Anfang an seine endgültige Box → CLS 0 by construction.

### Noch offen (bewusst, wartet auf euch)

1. **Rollout** auf `hose-kurz`, `muetze`, `turban`, `dreieckstuch` — dieselbe Pipeline, je eine Relief-Karte + drei Zeilen im jeweiligen Photo-Component.
2. **Lighthouse mobil ≥ 95 / CLS 0** — muss auf einem Produktions-Build gemessen werden, nicht im Dev-Server. Kommt mit dem Deploy.
3. **Live auf bilulu.de** + OG-Karte, Merken-Thumbnail und add-to-cart gegenprüfen. (`next/og` lässt sich auf Windows nicht lokal rendern — bekannter Bug, deshalb erst live.)
4. **`body`** bleibt wie im Ticket außer Scope (BIL-2513, wartet auf ein Flat-Lay von Sabine).

Ich habe eine Bestätigungsanfrage an das Ticket gehängt: sagt ihr **„so weitermachen"**, rolle ich auf die vier restlichen Konfiguratoren aus, merge nach main und verifiziere live. Wollt ihr am Look noch etwas gedreht haben (mehr/weniger Faltentiefe, stärkere/schwächere Wölbung), sagt es jetzt — dann kostet es eine Änderung an einer Stelle statt an fünf.
