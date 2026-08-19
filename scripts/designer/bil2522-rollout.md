_Von **Designer** (Visual Designer). Der API-Key dieses Laufs ist board-scoped, deshalb steht ueber dem Kommentar `local-board` statt mein Agent — der Inhalt ist meiner._

## Rollout fertig — alle fünf Foto-Konfiguratoren sind live

Board-Freigabe des Hose-Proofs kam um 15:28Z, damit war der Rollout offen. Er ist
durch: `hose-kurz`, `muetze`, `turban` und `dreieckstuch` haben jetzt dieselbe
Relief-Stoffebene wie die Hose. Live auf bilulu.de, `main@5ed0ae5`.

### Was pro Teil anders ist — und warum das nicht dieselben Zahlen sein durften

Ich habe die Parameter nicht geraten, sondern aus zwei Messungen pro Teil
abgeleitet: wie **rund** es ist (Tiefe unter der Silhouette) und ob es
**echte Falten** trägt (`sigma_fine` aus der BIL-2509-Sonde).

| | Rollradius | synthetischer Faltenwurf | Begründung |
|---|---|---|---|
| `hose` | 108 px | ja | vom Board freigegeben, unverändert |
| `hose-kurz` | 120 px | ja, kürzerer Rhythmus | Ballonbeine sind breite Röhren, aber kurz — beim Hosen-Rhythmus von 210 px bekäme ein 300-px-Bein nicht mal anderthalb Falten |
| `muetze` | 150 px | wenig, richtungslos | echte Kuppel, und die Raffungen an der Krone sind **im Foto**; die Ebene muss nur die glatten Flanken abdecken |
| `turban` | 135 px | **keiner** | das einzige Foto mit wirklich kräftigen Falten (die Schleife allein misst σ 26). Erfundene Falten auf echte zu legen macht ein Rendering geschäftig, nicht echt |
| `dreieckstuch` | 46 px | ja, breit und weich | liegt **flach** — es ist keine Röhre, sondern ein Tuch auf dem Tisch |

### Der Fall, der Arbeit gemacht hat: Dreieckstuch

Seine Basis trägt keine echten Falten mehr, sondern **Reste der Entdruckung** —
schwach sichtbare „Kleiner Zoo"-Motive. Hätte ich die Standardparameter genommen,
wäre der gewählte Stoff *entlang der Geister-Motive* verzogen worden: der alte
Druck hätte den neuen geformt. Das ist der BIL-2509-Trap eine Ebene tiefer.

Dafür gibt es jetzt zwei Schrauben (`foldPhotoWeight`, `drapeYieldToPhoto`), beide
default-neutral — die Hose-Karte kommt nach dem Umbau **bit-identisch** wieder
heraus (`26a698e3…`), das war der Regressionsbeweis.

### Ein Fund, der nichts mit Stoff zu tun hat, aber am lautesten war

Beim Nebeneinanderlegen mit den Originalfotos ist mir aufgefallen, dass das
Dreieckstuch **weiße Löcher in Form der Original-Motive** mitten im Stoff hat und
eine zerfranste Unterkante — und der Turban eine treppenförmige Silhouette. Die
Freistellung war seinerzeit durch helle Motive nach innen ausgelaufen.

Das steckte **auch in der ausgelieferten Version** und fällt gegen ein echtes Foto
sofort auf, egal wie gut das Innere ist. Repariert (`bil2522-repair-silhouette.mjs`):
Closing gegen die Buchten, Alpha-Glättung gegen die Treppe, Inpainting der neuen
Pixel. Ausschlusszonen (Schildchen, Futter, Schleife) werden dabei ausdrücklich
wieder ausgestanzt.

### Belege

Alles als Work Products verlinkt (dieser Paperclip-Build hat keinen
Attachment-Endpunkt).

* **Kontaktbögen — jeder der 35 Stoffe neben dem Originalfoto**
  → `apps/storefront/reports/bil2522/<konfigurator>-alle-stoffe.png`
  Ihr habt gesagt, die Latte gilt *pro Stoff*. Zwei Beispiele können das nicht
  zeigen, also liegt jeder Stoff auf einem Blatt neben dem Originalfoto.
* **Vorher/Nachher/Originalfoto** je Konfigurator → `reports/bil2522/`
  Am deutlichsten am Turban: vorher laufen die Einhörner schnurgerade durchs
  Raster, nachher folgen sie den Falten und stauchen sich in den Raffungen.
* **Live-Browser-Belege von bilulu.de** → `reports/bil2522/live-prod/`
  30/30 sauber. Jede Aufnahme doppelt (gleiche URL = identische Bytes), plus
  ein Shot mit blockierter `relief.webp`, der sich unterscheiden **muss** —
  sonst würde ich nur behaupten, dass die Ebene malt.
* **Parität Browser vs. Node**: 11/11, max |Δ| = 4 von 255. Die Beweisblätter
  sind damit Aussagen über das, was der Shop wirklich rendert.

### Zwei eigene Fehler, die ich unterwegs gefunden habe

1. Meine Zonen-Heuristik „zweite Zone = Hauptstoff" trifft bei der Mütze das
   **Futter** und beim Turban die **Schleife**. Ein ganzer Satz Beweisbilder
   zeigte den Druck brav auf Futter und Schleife, während das Kleidungsstück uni
   blieb. Behoben und neu gerendert.
2. Der Paritätslauf war erst 9/11 rot. Ursache waren 14 Pixel im Schildchen: der
   Node-Renderer backt es in denselben Puffer, der Browser hält es als eigene
   Ebene. Dort wurden zwei verschiedene Dinge verglichen. Ich habe die Region
   ausgeschlossen und die Schwelle gelassen, wo sie war — hätte ich stattdessen
   die Schwelle hochgezogen, hätte sie einen echten Fork gleicher Größe
   mitverschluckt.

### Performance — hier bin ich unter dem Ticket-Ziel, und ich sage warum

Kriterium 4 verlangt Lighthouse mobile ≥ 95. **Erreicht sind 69.** Der Reihe nach,
gemessen live gegen bilulu.de mit einer Kontrolle:

| | Perf | LCP | TBT | CLS |
|---|---|---|---|---|
| erste Fassung (eine lange Task) | 50 | 4,7 s | 2.210 ms | 0 |
| feste 48-Zeilen-Bänder | 54 | 4,6 s | 1.360 ms | 0 |
| **jetzt: Zeitscheiben à 16 ms** | **69** | 4,5 s | **420 ms** | **0** |
| dieselbe Seite mit **Uni** (Relief malt nicht) | **76** | **4,5 s** | 210 ms | 0 |

Die Kontrolle ist der Punkt: dieselbe Seite, dieselbe Sekunde, nur ohne Stoff —
da malt die Ebene gar nichts und die Seite kommt trotzdem nur auf 76. Der LCP ist
mit und ohne meine Ebene identisch 4,5 s. **Das ≥95 scheitert also an der
Seitenladezeit, nicht am Konfigurator-Rendering.**

Meine eigene Rechnung: anfangs +1.860 ms TBT — das war eine echte Regression von
mir. Nicht die Arbeit war das Problem, sondern ihre Körnigkeit; jetzt läuft der
Paint in Zeitscheiben nach der Uhr statt in einer langen Task, und es sind noch
+210 ms gegen die Kontrolle. CLS ist überall 0, a11y 100.

Den Rest habe ich als Kind-Issue an Frontend gegeben (LCP der Konfigurator-Seiten,
auffällig: `turban` 4,5 s vs. `hose` 2,7 s bei gleichem Seitenaufbau) — Laden und
Bundle sind deren Feld, nicht Bildbearbeitung. Ich schlucke das nicht still.

### Keine Regression

`?rot=`-Deep-Links funktionieren, OG-Karten zeigen den Stoffdruck (geprüft für
Turban, Mütze, Dreieckstuch, kurze Hose), Schildchen und Ausschlusszonen sind
unangetastet, CLS bleibt 0. Ohne JavaScript oder bei fehlender `relief.webp`
fällt die Vorschau auf exakt den Look zurück, der vorher ausgeliefert wurde.

### Was ich offen lasse

Der **Body**-Konfigurator bleibt außen vor (BIL-2513, von euch geparkt): er ist als
einziger handgezeichnet, ohne Flat-Lay-Foto von Sabine ist da nichts zu holen.

Und ehrlich zur Messlatte: das Muster folgt jetzt den Falten, rollt um die Rundungen
und reagiert auf Licht — der Sprung ist am Turban und an der kurzen Hose am
deutlichsten. Beim **Dreieckstuch** ist der Effekt bewusst zurückhaltend, weil das
Tuch flach liegt; dort hat die Kantenreparatur mehr gebracht als die Verzerrung.
Ob das für „nicht mehr zu unterscheiden" reicht, entscheidet ihr — die
Kontaktbögen sind genau dafür gebaut. Wenn ein einzelner Stoff oder ein einzelnes
Teil rausfällt, sagt mir welcher, dann drehe ich gezielt daran statt an allen fünf.
