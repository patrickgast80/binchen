## Live auf bilulu.de — verifiziert ✅

`main@e5c0cf9` ist ausgerollt und gegengeprüft. Alle vier Punkte des Auftrags sind erledigt.

### Live-Beleg

Skript `apps/e2e/scripts/bil2492-live-verify.mjs` gegen **https://bilulu.de**, alle fünf Konfiguratoren, beide Viewports:

```
mobile sheet height with rotate control: 503px of 844px viewport
og rot=0:  200 image/png  x-og-photo=fs:4L:1F:r0:384kb   409kb
og rot=90: 200 image/png  x-og-photo=fs:4L:1F:r90:387kb  415kb
PASS — live rotation on all 5 konfigurators, both viewports
```

Der Test vergleicht ungedreht und gedreht **byteweise** und fällt durch, wenn sie gleich sind — ein Screenshot, der „irgendwie anders aussieht", zählt nicht.

Anhänge (`live-*`): Hose, Body, Turban, Mütze, Dreieckstuch je 0° vs. 90° bei 390×844 und 1440×900, plus die echte Share-Karte vom Produktions-Host. Der Header `x-og-photo=…1F:r90…` sagt dabei ausdrücklich „eine Stoffzone komponiert, um 90° gedreht" — ein grüner Content-Type allein hat hier schon einmal eine leere Karte durchgehen lassen.

### Warenkorb und Kaputt-Fälle — live durchgespielt, nicht behauptet

Echte Bestellstrecke auf bilulu.de: Stoff 14 mit `rot=180` → „In den Warenkorb" → die Zeile zeigt **„Muster: 180° gedreht"** unter Bund/Hose/Bündchen (Anhang `live-cart-rot180.png`). Die Ausrichtung kommt also mit der Bestellung bei Sabine an.

Manipulierte URLs fallen still auf 0° zurück, statt die Masken zu verschieben — direkt am Live-HTML geprüft:

```
?rot=45   → musterRotation value="0"
?rot=abc  → musterRotation value="0"
?rot=90   → musterRotation value="90"
```

### Zwei Sachen, die der Live-Lauf korrigiert hat

1. **Meine Deploy-Wartebedingung war falsch gewählt.** Ich habe auf den sichtbaren Text „Muster drehen" im HTML gepollt — der taucht dort nicht als zusammenhängender String auf, also meldete die Probe „noch nicht live", obwohl der neue Code längst lief. Der belastbare Marker war der `x-og-photo`-Header mit dem neuen Format. Wer das nachbaut: auf ein `aria-label` oder einen Response-Header prüfen, nicht auf gerenderten Button-Text.
2. **Der Byte-Vergleich hat einen Fehler in meiner eigenen Beweisführung gefunden.** Auf 390 px liegt die kurze, breite Dreieckstuch-Vorschau (900×482) unter dem fixen Palette-Sheet; Playwrights Auto-Scroll holt sie nicht darüber hinaus, also fotografierten beide Winkel dasselbe Swatch-Raster und waren identisch. Kein Produktfehler — ein Beweisfehler, der ohne den Vergleich als „geprüft" durchgegangen wäre. Skript korrigiert (`main@2bcae7a`), danach grün.

### Ein Tradeoff, den ihr kennen solltet

Das mobile Palette-Sheet ist auf dem Stoff-Tab jetzt **503 px von 844 px** hoch — die Steuerungszeile kostet rund 60 px. BIL-2474 hat dieses Sheet ausdrücklich gedeckelt, weil es mit 711 px die Vorschau verschluckt hat; wir sind klar darunter und die Zeile erscheint **nur** auf einem Tab mit Stoffdruck, aber es ist eine bewusste Ausgabe und keine Kleinigkeit. Falls das im echten Betrieb zu eng wirkt, ist die Alternative, den Button in die Kopfzeile des Tabs zu setzen (spart die Zeile, verlässt aber den Daumenbereich) — sagt Bescheid, das ist eine 10-Minuten-Änderung.

### Perf

Unverändert zum Vorbericht: die Drehung kostet **nichts** (0 zusätzliche Requests, gedreht und ungedreht messen identisch). Die 82 statt 96 auf Seiten *mit* gewähltem Stoffdruck sind Bestandsverhalten durch die 444 kB schweren Kacheln und liegen als Kind-Issue **„Konfigurator: Stoff-Kacheln sind zu schwer"** mit Messwerten und Plan bereit. Der Default-Zustand der Seite (Uni) liegt bei 96.

### Hinweis an DevOps

Der Auto-Deploy-Poller hat auf diesen Push ~18 Minuten lang nicht ausgelöst (Coolify-Deployment-Queue war leer). Ich habe **einmal** manuell über die Coolify-API angestoßen — kein Retry-Loop, Zwei-Strike-Regel beachtet. Deployment `xfn4uz92…` lief auf Commit `e5c0cf90` sauber durch. Kann ein Einzelfall sein; falls es beim nächsten Push wieder klemmt, wäre `/home/deploy/binchen-autodeploy.log` die erste Anlaufstelle. Kein Blocker für dieses Ticket.

### Übergabe

@QA — bitte E2E-Gegenprobe:

- **URLs**: `https://bilulu.de/konfigurator/{hose,body,turban,muetze,dreieckstuch}?<hauptzone>=stoff-14` und dasselbe mit `&rot=90` (Param je Konfigurator: `hose`, `hauptteil`, `turban`, `muetze`, `tuch`).
- **Viewports**: 390×844 und 1440×900.
- **Schritte**: Stoff wählen → Button „Muster drehen" erscheint → viermal tippen, Winkel läuft 90/180/270/0 und die URL folgt → „Konfiguration teilen" kopiert den Link inkl. `rot` → Link in einem frischen Tab öffnen, Muster liegt gleich → „Merken", Thumbnail zeigt den gedrehten Druck → in den Warenkorb, Zeile enthält „Muster: 90° gedreht".
- **Gegenprobe**: bei einer Uni-Farbe darf der Button gar nicht erst auftauchen.
- **Kaputt-Fall**: `?rot=45` und `?rot=abc` müssen still auf 0° zurückfallen, nicht die Masken verschieben (von mir am HTML geprüft — im Browser bitte gegenprüfen).

Warenkorb und Kaputt-Fälle habe ich live schon durchgespielt (siehe oben); interessant für euch sind vor allem echte Geräte statt Emulation, iOS Safari (der Blend-Stack liegt dort auf `-webkit-mask`) und ob die Drehung auf einem echten Telefon flüssig wirkt.
