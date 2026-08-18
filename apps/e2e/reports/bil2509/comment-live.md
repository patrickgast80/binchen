## Live abgenommen auf bilulu.de — Perf 98, a11y 100

Nachtrag zum Kommentar oben: der Deploy ist durch, ich habe an echten Viewports nachgeschaut.

**Deploy verifiziert über Byte-Gleichheit**, nicht über ein Gefühl — live und lokal identisch:

| Asset | Bytes |
|---|---|
| `hose-kurz-foto/base.webp` | 27490 (vorher 24682) |
| `hose-kurz-foto/highlight.webp` | 11020 |
| `hose-foto/base.webp` | 41980 |
| `muetze-foto/base.webp` | 34094 |

### Lighthouse mobile auf Patricks exakter URL

`/konfigurator/hose-kurz?hose=stoff-04&bund=mustard&rot=90&buendchen=mustard`

| | |
|---|---|
| Performance | **98** |
| Accessibility | **100** |
| Best Practices | **96** |
| SEO | **100** |
| LCP | **2.1 s** (Ziel < 2.5 s) |
| CLS | **0** (Ziel < 0.1) |
| TBT | 130 ms |

Also klar über dem 90er-Ziel und innerhalb des BIL-2493-Budgets, obwohl die Assets leicht gewachsen sind. Report liegt als `apps/e2e/reports/bil2509/live/lh-mobile.json`.

### Screenshots

390×844 und 1440×900, 4 Konfigurationen, **8/8 Screenshots byte-verschieden, 0 Console-Errors**. Dateien unter `apps/e2e/reports/bil2509/live/`, Zoom-Crops auf Bundübergang und Schritt jeweils daneben.

Was auf dem dunklen Fall (`stoff-30` + Marineblau, `hose-dunkel-desktop-bundübergang.png`) zu sehen ist: der Bund hat jetzt echte Stretch-Falten und darunter den dunklen Zug, wo sich der Korpus einreiht. Genau der Fall ist vorher am ehesten zugelaufen.

**Zwei Fallen aus BIL-2492 haben wieder zugeschlagen** und stehen jetzt im Skript:
- Ein Element-Screenshot fotografiert auf Mobile das *fixe Paletten-Sheet* mit, das über der Vorschau liegt — mein erster Lauf lieferte „Belege", auf denen nur ein Streifen Bund zu sehen war.
- `scrollTo(0,0)` ist die Gegenlüge: dort steht die Vorschau noch unter der Hero-Copy. Jetzt wird die Vorschau an den oberen Rand gescrollt, also das, was eine Besucherin tatsächlich tut.

### Ehrliche Einordnung

Bund, Bündchen und Mützenfutter lesen sich jetzt wie Stoff. **Der bedruckte Korpus bleibt der schwächste Teil** — dort ist der Druck zu dicht, um echte Falten herauszurechnen (Beleg im Kommentar oben), er hat nur den stärkeren synthetischen Faltenwurf und die tiefere Silhouetten-Abschattung bekommen. Wenn Patrick beim Draufschauen sagt „der Korpus ist immer noch platt", dann ist das genau diese Grenze und nicht ein Einstellfehler — der nächste ehrliche Schritt wäre dann Displacement (Muster entlang der Faltentopologie verzerren, per SVG-Filter auf der Kachel-Ebene), das ich hier bewusst nicht mit reingenommen habe.

**Zwei Sachen, die mir beim Nachschauen aufgefallen sind und die nicht zu diesem Ticket gehören** — sage ich lieber, als sie zu schlucken:
1. Auf 390×844 verdeckt das Paletten-Sheet die Vorschau so weit, dass man beim Farbwechsel scrollen muss, um die Wirkung zu sehen. Das kostet genau den Doherty-Effekt, für den der Konfigurator gebaut ist.
2. Der sticky Header überlappt beim Hochscrollen die obere Kante des Bundes.

Beides ist Vor-Bestand, kein Regress aus diesem Ticket. Wenn gewünscht, lege ich dafür ein Ticket an.

### Status

Aus meiner Sicht fertig und live. Der Rest ist Geschmacksurteil vom Board — **Patrick, schau bitte einmal auf `hose-kurz?hose=stoff-04&bund=mustard&rot=90&buendchen=mustard` und sag, ob der Bund jetzt so aussieht wie auf deinem Foto.** Die drei Konfiguratoren, die nicht in dieses Verfahren passen, laufen als **BIL-2512** (Turban/Dreieckstuch: Original-Druck in der Basis) und **BIL-2513** (Body: gar kein Foto vorhanden) weiter.
