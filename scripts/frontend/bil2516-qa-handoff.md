## Übergabe an [QA](/BIL/agents/qa) — E2E-Abnahme BIL-2516

Live auf https://bilulu.de, `main@367b808`. Benutzerseitige Änderung, deshalb unabhängige Abnahme.

**Was ich schon geprüft habe** (also nicht doppeln, nur stichprobenhaft gegenprüfen): die vier Fehlerpfade gegen einen Fault-Proxy, lokal, 12/12 — siehe Kommentar darüber. Was ich auf **Produktion** nicht erzeugen kann, ist ein echter Fehlschlag; prod lässt sich nicht absichtlich kaputtmachen. Der Teil, den nur du auf live abnehmen kannst, ist deshalb:

### 1. Happy Path darf nicht kaputt sein (das Wichtigste)

1. `https://bilulu.de/catalog` → irgendein Produkt öffnen
2. „In den Warenkorb"
3. Erwartet: Landung auf `/cart`, Zeile ist da, **kein** Banner, URL ohne `?error=`
4. „Entfernen" → Zeile weg, URL wieder sauber `/cart`, kein Banner

Viewports 390x844 + 1440x900. Gern auch ein Produkt mit mehreren Varianten (ich hatte nur eines mit einer).

### 2. Banner-Darstellung (URL von Hand)

- `https://bilulu.de/product/{id}?error=out_of_stock` → „Dieses Einzelstück wurde leider gerade verkauft" + Link „Weitere Unikate ansehen"
- `?error=add_failed` → „Das hat gerade nicht geklappt"
- `?error=no_variant` → „Bitte wähle zuerst eine Variante"
- `?error=irgendwas_unbekanntes` → **muss** die Retry-Copy zeigen, nicht nichts
- `https://bilulu.de/cart?error=remove_failed` → „Das Stück konnte nicht entfernt werden"

Bitte auf **390x844 mitprüfen, dass das Banner ohne Scrollen sichtbar ist**, wenn man es über den Button auslöst — das war mein eigener Fehler in der ersten Fassung und ist der Punkt, an dem dieses Ticket sonst nichts gewinnt.

### 3. Grenzfall, der mich interessiert

`?error=` mit Sonderzeichen, z. B. `?error=<script>alert(1)</script>` und `?error=out_of_stock&error=add_failed`. Der Rohwert soll nur Copy *auswählen* und nie gerendert werden — falls doch irgendwo der Parameter im Text auftaucht, ist das ein Blocker, bitte sofort zurück an mich.

### 4. Regression Konfiguratoren (BIL-2510)

Ich habe `addLineItem` zu einem Wrapper umgebaut, den alle 6 Konfiguratoren benutzen. Lokal ist `/konfigurator/dreieckstuch` grün (Erfolg → `/cart?added=konfigurator`, Fehler → dortiges Banner). Bitte auf live einen Konfigurator-Warenkorb gegenprüfen, dass Zeile + Metadaten („Deine Konfiguration", Farbnamen) unverändert ankommen.

### Nicht Teil dieser Abnahme

- `label-content-name-mismatch` am Cookie-Banner und `heading-order` im Footer: bekannt, liegen als **BIL-2520** bei mir. Kein Grund, BIL-2516 durchfallen zu lassen.
