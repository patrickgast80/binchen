# BIL-2466 — Farbtreue & Stoff-Textur-Recherche

Konzeptarbeit für den Konfigurator-Design-Pass, erstellt während BIL-2466 auf
BIL-2461 (Frontend, Untergrund-Fix) wartet. Kein Pipeline-Code, keine Assets —
nur Referenz- und Bewertungsgrundlage für den Design-Pass, sobald BIL-2461
verifiziert ist.

## 1. Zweck

Der Board-Auftrag für BIL-2466 verlangt drei Dinge: fotorealistische
Stoffdarstellung, Farbtreue gegen Sabines echte Wollfarben, UI-Feinschliff.
Die ersten beiden lassen sich vorbereiten, ohne den geteilten Checkout
anzufassen, in dem Frontend gerade an BIL-2461 arbeitet — deshalb dieses
Dokument statt Code.

## 2. Wollfarben-Referenzabgleich (`apps/storefront/src/app/konfigurator/hose/palette.ts`)

Die aktuelle 12-Farben-Palette ist reines sRGB-Hex, ohne Bezug zu einem
fotografierten Garn-Muster. Ohne physisches Muster von Sabines Garn darf ich
keine "korrigierten" Hex-Werte erfinden — das wäre genau die Art Fabrikation,
die die Kund:innen in die Irre führt. Was ich stattdessen liefere: eine
Einschätzung, welche Töne beim Multiply-Tint auf einer fotorealistischen Base
vermutlich zu "digital/Acryl" statt "Wolle" kippen, plus eine konkrete
Kalibrierungs-Methode.

| ID | Hex | Risiko zu "digital" | Begründung |
|---|---|---|---|
| `petrol` | `#5BA8AE` | **hoch** | Sehr klare, helle Sättigung — Strickwolle in Petrol wirkt meist gebrochener/dunkler unter Tageslicht. Kandidat #1 für Nachjustierung. |
| `mustard` | `#D4A24C` | mittel | Etwas zu klar-gelb für Naturwolle; reale Senf-/Ocker-Wolle zieht meist mehr Richtung Braun. |
| `forest` | `#3F6444` | mittel | Plausibel, aber am oberen Sättigungsrand für ein Wollgrün. |
| `powder-pink` | `#E8C2C2` | niedrig | Gedeckt genug, liest sich bereits als Wolle statt Pastell-Plastik. |
| `terracotta`, `rust`, `sand`, `taupe`, `sage`, `sky`, `navy`, `cream` | — | niedrig | Liegen in einem Sättigungs-/Helligkeitsbereich, der zu photografierten Naturfaser-Tönen passt. |

**Kalibrierungs-Methode (sobald Sabine Garn-Fotos liefert, nicht jetzt):**
1. Garn-Stränge unter identischem Licht wie im Studio-Look-Standard fotografieren (5200–5600 K, siehe unten).
2. Median-Farbe je Garnfoto ziehen (gleiche Technik wie `bil2462-studio-normalize.mjs` für den Hintergrund-Abgleich nutzt).
3. Delta-E gegen die aktuelle Palette-Hex prüfen; nur Werte mit sichtbarem Unterschied (>5 Delta-E) anpassen, nicht die ganze Palette neu erfinden.
4. Ergebnis ist eine Korrektur-Tabelle für `palette.ts`, kein Full-Rewrite — die neun "niedrig"-Einträge oben bleiben vermutlich unverändert.

Ohne Schritt 1–2 bleibt jede Zahl Spekulation; das obige ist eine Priorisierung
fürs Nachjustieren, kein fertiges Ergebnis.

## 3. Stoff-Textur-Kriterien für fotorealistische Bündchen-Kanten

Damit ein flach eingefärbter Zonen-Bereich wie echter Rippstrick statt wie
eine Vektor-Fläche wirkt, braucht es (unabhängig von der konkreten
Implementierung) diese visuellen Signale:

1. **Nahtschatten entlang der echten Zonen-Kontur** — nicht als gerade Linie,
   sondern der tatsächlichen Silhouette folgend (Bund/Hose-Übergang ist eine
   Kurve, kein horizontales Lineal).
2. **Ambient Occlusion am Rand** — jede Kante braucht eine leichte
   Abdunkelung zum Silhouetten-Rand hin, sonst wirkt das Motiv wie ein
   Sticker mit hartem Ausstanz-Schnitt.
3. **Feine, deterministische Körnung** statt Verlaufsgitter — Wolljersey hat
   sichtbare Faserstruktur; eine komplett glatte Fläche verrät sich sofort
   als digital eingefärbt.
4. **Sheen/Screen-Layer für dunkle Töne** — Multiply kann nur abdunkeln; ohne
   einen zusätzlichen hellen Screen-Layer verlieren dunkle Farben (Navy,
   Tannengrün) ihre Lichtseite und wirken matschig/leblos.
5. **Rippstruktur bei Bündchen-Zonen** — eine feine, periodische
   Streifung (vertikal, mit weichem Abklingen zur Zonen-Grenze) macht aus
   einer Fläche einen Strick.

Diese fünf Punkte sind die Messlatte, an der ich jede Base/Zone-Iteration —
egal von wem gebaut — gegen den Board-Wunsch "fotorealistisch und schön"
bewerten werde.

## 4. Abgleich mit dem Studio-Look-Standard (BIL-2462, `docs/design/STUDIO-LOOK.md`)

Damit der Konfigurator nicht wie eine separate Insel wirkt, sondern wie
derselbe Fotoshoot wie Katalog/PDP:

- **Hintergrund:** Studio-Grau `#C8C8C6` (RGB 200/200/198) — identisch zum
  Produktfoto-Standard, nicht das wärmere `binchen-cream-dark` der restlichen
  Konfigurator-UI.
- **Lichtcharakter:** 5200–5600 K, weich/indirekt — die simulierte
  Ambient-Occlusion/Sheen-Schicht (Abschnitt 3) sollte auf dieses
  Lichttemperatur-Ziel kalibriert sein, nicht auf einen wärmeren oder
  kühleren Ton.
- **Nichts erfinden / nichts wegretuschieren:** dieselbe Regel wie bei
  Produktfotos gilt auch fürs Rendering — Farbtreue heißt reale Wollfarbe
  nachbilden, nicht "schöner machen als das Garn tatsächlich ist.

## 5. Hinweis zum geteilten Checkout

Im aktuell ausgecheckten Arbeitsbaum liegen (Stand dieses Heartbeats)
uncommittete Änderungen, die strukturell bereits mehrere der Punkte aus
Abschnitt 3 umsetzen (Illumination-Map statt Blur, konturfolgender
Nahtschatten, Korn, Rippstruktur, Sheen-Layer) sowie eine Tailwind-Änderung,
die die Konfigurator-Vorschau auf das Studio-Grau aus Abschnitt 4 umstellt.
Diese Dateien gehören zum aktiven BIL-2461-Run von Frontend (Issue-Owner:
Agent `55d15751…`, checkoutRunId `d29c72fe…`) — ich habe sie nicht angefasst,
um die parallele Bearbeitung nicht zu stören. Sobald Frontend committet und
BIL-2461 grün ist, prüfe ich das Ergebnis gegen die Kriterien in Abschnitt 3
und 4, statt sie zu duplizieren.
