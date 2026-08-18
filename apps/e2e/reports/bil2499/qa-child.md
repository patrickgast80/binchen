## Auftrag

E2E-Browserabnahme des neuen Konfigurators für die kurze Pumphose „Dinos". Ich habe die Route in BIL-2499 selbst live verifiziert (Screenshots, axe, Warenkorb, OG-Karte, Merken-Thumbnail, Lighthouse 95) — das ersetzt aber keine unabhängige Abnahme durch QA.

**URL:** `https://bilulu.de/konfigurator/hose-kurz`
**Viewports:** 390x844 (mobil, primär) und 1440x900 (Desktop)
**Stand:** `main@e315b89`

## Schritte

1. **Zonen wechseln** — Bund, Hose und Bündchen einzeln umfärben. Die Vorschau muss jede Auswahl sofort spiegeln (Doherty, < 400 ms gefühltes Feedback).
2. **Schildchen — der harte Board-Punkt.** Bund auf **mindestens zwei verschiedenen Stoffen** heranzoomen. Das eingenähte „made with love"-Etikett muss in **jeder** Farb- und Stoffkombination unverändert bleiben — kein Farbstich, kein Halo, keine angeschnittene Kante. Besonders die Extreme prüfen: Creme (fast weiß) und Marineblau (fast schwarz).
3. **`?rot=`** — `?rot=90` und `?rot=180` an die URL hängen, Muster muss sich sichtbar drehen, Schildchen bleibt trotzdem unverändert.
4. **Merken + Reload** — speichern, Seite neu laden, Eintrag muss überleben und im Thumbnail den **Stoffdruck** zeigen (nicht eine einfarbige Fläche — das war der BIL-2492-Bug).
5. **In den Warenkorb** — Konfiguration muss vollständig in der Warenkorbzeile stehen (Länge, Bund, Hose, Bündchen, Muster).

## Wichtig: nicht bis zur Bestellung durchlaufen

Der Preis ist offen — siehe **BIL-2505**: die Warenkorbzeile kostet 39,00 €, der Katalogartikel derselben kurzen Hose 28,90 €. Bitte **keine Testbestellung abschließen**, solange das nicht entschieden ist. Ein Preisbefund in dieser Abnahme ist also erwartet und kein neuer Fund — bitte an BIL-2505 hängen statt neu zu melden.

## Meine Belege zum Gegenlesen

In `apps/e2e/reports/bil2499/live/`: Screenshots beider Viewports, Bund-Zooms, `label-proof-live.json` (Schildchen als massiver 36x37-Block, 0 Löcher, über 5 Kombinationen), `label-tag-component.png`, `merken-check.json` (1957 Farben im Thumbnail), `cart-check.json`, `lh-mobile.json` (Performance 95), `vitals.json`.

Skripte: `apps/storefront/scripts/bil2499-live-label-proof.mjs` (mit `--selftest`, der das Instrument auf blanken Bund richtet und ein FAIL verlangt), `apps/e2e/scripts/bil2499-live-merken.mjs`, `apps/e2e/scripts/bil2499-live-vitals.mjs`.

Wenn dir etwas an meiner Beweisführung zu dünn vorkommt, sag es bitte deutlich — die Schildchen-Anforderung ist die eine, bei der ein hübscher Screenshot am leichtesten täuscht.
