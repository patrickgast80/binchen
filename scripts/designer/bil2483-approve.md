## Freigabe: Doppelrahmen-Fix ✅ + eine Doku-Korrektur, ansonsten übergeben an QA

Danke für die saubere Analyse und den schnellen Fix, @Frontend. Ich habe nicht nur die Kommentare gelesen, sondern selbst nachgeprüft — mit Pixel-Crop-Vergleich, nicht nur Screenshot-Draufsicht:

### Kern-Fix (Creme-Doppelrahmen) — visuell verifiziert, live

Ich habe `apps/e2e/reports/bil2483/before/catalog-card-desktop.png` gegen `after/catalog-card-desktop.png` auf die obere linke Kartenecke gecroppt und 3× vergrößert. **Vorher**: dünner cremefarbener Ring außen, dann erst das graue Passepartout aus dem Bild — genau der gemeldete Doppelrahmen. **Nachher**: das graue Passepartout beginnt direkt an der Kartenkante (abgerundete Ecke sichtbar), kein Creme-Ring mehr. Der Fix tut, was er soll.

### Hub-Mat 12 % (`main@208c455`) — Commit ok, Deploy steht noch aus

Kurzer Realitäts-Check bei mir eben (16:01 UTC, ~4 Min nach eurem Commit): `curl https://bilulu.de/konfigurator` zeigt auf den Kachel-Bildern noch `object-contain p-6`, nicht `p-[12%]`. Quelle im Checkout hat den Fix korrekt (`grep` bestätigt `p-[12%]` in `konfigurator/page.tsx:107`), das ist also nur der 5-Minuten-Poller, der noch nicht durch ist — kein Handlungsbedarf, ich poll das nicht weiter nach. QA sieht das beim E2E-Abnahme-Lauf ohnehin, da sollte es dann schon live sein.

Fachlich: die Entscheidung, am Hub die Kachel-Padding als Mat zu behandeln statt sie auf 0 zu setzen, trage ich mit — die zwei Kachelbilder sind transparente Freisteller ohne eingebackenes Passepartout, `p-[12%]` bringt sie auf den gleichen visuellen Rand wie jede Produktkarte daneben. Das ist keine Abweichung vom Ziel des Tickets, sondern die korrekte Umsetzung davon.

### Nebenbei erledigt: veraltete Doku

`docs/design/STUDIO-LOOK.md` nannte unter „Ränder & Komposition" noch 20 % Innenrand — das war der zwischenzeitliche Testwert vom 16.08., nicht der aktuelle. Auf 12 % korrigiert und die Werte-Historie (6 % → 20 % → 12 %) dokumentiert, inkl. Verweis auf den Hub-Mat-Angleich. Live auf `main@4973c76`.

### Nicht Teil dieses Tickets, aber notiert

Der helle Backdrop-Block *innerhalb* einzelner Fotos (Pumphose-Konfigurator, „Boho-Regenbogen"-Set) ist ein Bildinhalt-Fehler aus meiner Normalizer-Pipeline, kein CSS-Problem — das behebe ich unter BIL-2462, nicht hier.

### Übergabe an QA

@QA — bitte E2E-Abnahme auf `https://bilulu.de/catalog`, `/`, `/konfigurator`, `/product/*`, `/cart` bei 390×844 und 1440×900:
- Kein Creme-Ring mehr um Produktbilder (nur noch das eine graue Passepartout).
- Konfigurator-Hub-Kacheln (Pumphose, Mütze) zeigen einen gleichmäßigen ~12 %-Rand, keinen schmaleren/wandernden Rand mehr — bitte vor der Prüfung kurz sicherstellen, dass der Poller `main@208c455` schon deployt hat (`curl .../konfigurator | grep 'p-\[12%\]'`).

Ich setze den Assignee auf QA, Status bleibt `in_review` bis zur E2E-Bestätigung.
