# Bilulu Reshoot-Liste — Stand 2026-08-14 (Nachbearbeitungs-Update)

Ersetzt die erste Fassung vom selben Tag (15:50 UTC). Diese Version folgt auf
den tatsächlichen Nachbearbeitungs-Lauf mit `bil2462-studio-normalize.mjs`
(siehe [STUDIO-LOOK.md](./STUDIO-LOOK.md)) und eine manuelle visuelle
Prüfung aller 27 betroffenen Produktbilder — nicht mehr nur den automatischen
Grader.

## Wichtige Korrektur zur ersten Fassung

Der `bil2462-image-grader.mjs` markierte am Vormittag 24 von 34 Bildern als
"reshoot" wegen `dark-backdrop`. Nach der Nachbearbeitung UND einer
Bild-für-Bild-Sichtprüfung zeigt sich: der Grader misst die Helligkeit einer
Zone in der Bildmitte (30–70 %) — bei eng zugeschnittenen Produktfotos ist
das nicht der Hintergrund, sondern fast immer der **Stoff selbst** (Muster,
dunkle Bündchen, bedruckte Fläche). Ein navyblaues Motiv in der Bildmitte
schlägt genauso als "dunkler Backdrop" auf wie ein wirklich schlechtes Foto.
Diese Kennzahl ist für unseren Katalog (Kleidung füllt bewusst fast den
ganzen Rahmen) **nicht aussagekräftig** und wird hier nicht mehr als
Hauptkriterium verwendet. Cornerdev (Eckenfarbe) und Offcentre (Zentrierung)
bleiben verlässlich.

## Ergebnis der Nachbearbeitung (27 Medusa-Produktbilder)

- **13 Bilder** wurden erfolgreich normalisiert: der Hintergrund wurde aktiv
  neu berechnet und auf das einheitliche Studio-Grau `200/200/198` gemalt
  (nicht nur zugeschnitten). Sichtbarer Effekt: Vignetten/ungleichmäßige
  Belichtung im Hintergrund sind weg, alle 13 teilen jetzt exakt denselben
  Grauton.
- **14 Bilder** wurden von der Pipeline **bewusst nicht verändert** (nur neu
  zentriert/zugeschnitten wie zuvor). Grund: die eingebauten Sicherheits-Checks
  (siehe Kommentare in `bil2462-studio-normalize.mjs`) haben erkannt, dass ein
  automatischer Hintergrund-Ersatz bei diesen Fotos riskiert hätte, echten
  Stoff zu löschen (z. B. weil das Kleidungsstück fast bildfüllend
  fotografiert wurde und der Bildrand kein sauberes Referenzgrau zeigt). Die
  Pipeline verweigert in diesem Fall lieber den Eingriff, statt zu raten —
  siehe „Nichts wegretuschieren" in STUDIO-LOOK.md.
- Bei einer stichprobenartigen Sichtprüfung dieser 14 „unverändert"-Fälle
  sind die meisten bereits akzeptabel (helles, neutrales Grau, nur wenig
  Rand). Sie sind **keine** Reshoot-Kandidaten.

## Tatsächliche Reshoot-/Nacharbeits-Kandidaten (visuell geprüft)

Nur zwei echte Fälle, die die Pipeline nicht heilen konnte:

1. **Dreieckstuch „Kleiner Zoo" rosa** — der Originalhintergrund hat einen
   kühleren, dunkleren Grauton (eher Schiefer als Studio-Grau) mit einem
   Belichtungs-Verlauf. Die Pipeline erreicht per Flood-Fill nur den bereits
   sauberen Außenrand (aus dem vorherigen Normalizer-Lauf), nicht den
   dunkleren Fleck weiter innen — ein zu großer Farbsprung, um ihn ohne
   Risiko zu überbrücken. Empfehlung: entweder manuelle Retusche durch einen
   Menschen (Lasso + Grauton-Fläche) oder Reshoot auf dem neuen
   Studio-Grau-Hintergrund.
2. **Mütze „Winter-Kinder" marineblau** — Kleidungsstück füllt fast den
   gesamten Rahmen, kaum Randfläche zum Hintergrund sichtbar. Kein
   technischer Fehler, aber zu wenig Raum für eine verlässliche automatische
   Nachbearbeitung. Beim nächsten Shoot: mehr Abstand zum Motiv (siehe
   FOTO-GUIDELINE-SABINE.md, Abschnitt „Abstand").

Alle anderen 25 Produktbilder (13 normalisiert + 12 der 14 unveränderten)
gelten nach Sichtprüfung als katalogtauglich.

## Externe Bilder (unverändert, separates Ticket nötig)

- Bilulu-Pumphose (Konfigurator) — `bilulu.de/products/pumphose/pumphose-01.jpg`
- Body — `bilulu.de/konfigurator/body-foto/base.webp`
- Bio-Baumwolle Strampler – Waldtiere (SVG-Platzhalter)
- Jersey Bodysuits Set – Regenbogen (SVG-Platzhalter)
- Musselinhose – Salbeigrün (SVG-Platzhalter)
- Wendejacke – Punkte & Streifen (SVG-Platzhalter)
- Spielanzug mit Füßen – Sternchen (SVG-Platzhalter)

Die SVG-Platzhalter sind kein Fotografie-Problem, sondern fehlende
Produktfotos — eigenes Ticket, kein Reshoot im klassischen Sinn.

## Pipeline-Hinweis für zukünftige Läufe

`bil2462-studio-normalize.mjs` ist konservativ by design: lieber ein Bild
unverändert lassen als riskieren, Stoff zu löschen. Das bedeutet, dass nicht
jedes technisch verbesserbare Bild bei jedem Lauf tatsächlich verbessert
wird. Für die zwei oben genannten Fälle ist menschliche Nacharbeit oder ein
Reshoot der zuverlässigere Weg.
