## Umgesetzt — der stumme Fehlerpfad ist zu

`main@3c8e19a`. Surface: **`/checkout/payment`**.

### Was jetzt passiert

`?error=` wird ausgelesen und als Banner direkt unter der H1 gerendert (`role="alert"`, `data-testid="checkout-error"`) — **vor** der Zahlungsmethode, damit die Meldung im ersten Blick liegt und nicht unter dem Fold verschwindet (*Recognition over recall* + *Gestalt proximity*: Fehler steht bei der Aktion, die ihn ausgelöst hat). Bei nicht wiederholbaren Fällen kommt zusätzlich ein Weg zurück in den Warenkorb statt eines Buttons, der garantiert wieder scheitert.

### Codes → Text

`completeCart()` lieferte für **jeden** Fehler `http_400` — Überverkauf und kaputtes Versandprofil waren nicht unterscheidbar. Ich habe die Klassifizierung dort eingezogen (`classifyCompleteFailure`, `CompleteCartFailure`), gegen die echten 400-Bodies aus deinem BIL-2500-Report (`apps/e2e/reports/bil2500/`):

| Backend-Antwort | Code | Kundentext (Anfang) |
|---|---|---|
| `code: insufficient_inventory` | `out_of_stock` | „Dieses Einzelstück wurde leider gerade verkauft" |
| `…shipping profiles…` | `shipping_unavailable` | „Für diese Bestellung fehlt gerade eine Versandart" |
| 5xx | `backend_unavailable` | „Unser Shop ist gerade kurz nicht erreichbar" |
| Payment-Setup | `payment_*_failed` | „Die Zahlung konnte nicht vorbereitet werden" |
| **alles andere** | Fallback | generisch + `info@bilulu.de` |

Eine rohe englische Medusa-Message erreicht nie die Kundin — nur der Container-Log bekommt sie (`console.warn` mit Cart-ID + Status), damit der nächste Ausfall dieser Art nicht wieder unsichtbar ist.

### Zu deiner Frage nach einem eigenen Code für den Unikat-Fall

**Aktuell nicht nötig.** Medusa liefert bereits `code: "insufficient_inventory"` und den prüfe ich zuerst; die Message-Regex ist nur Fallback. Wenn du trotzdem auf strukturiert `code`/`message`/`requestId` umstellst: mein Mapping liegt in einer Tabelle in `checkout-errors.ts`, das ist ein Einzeiler. Ich würde mich dann über eine `requestId` freuen, die ich der Kundin im Fallback-Text zeigen kann — dann kann Sabine eine Meldung direkt einem Log-Eintrag zuordnen.

### PayPal (Punkt 3 des Auftrags) — ja, war ebenfalls stumm, und ein Detail war heikel

`/api/checkout/complete` teilt sich `completeCart()`, die Insel schiebt den Code in dieselbe URL — der Pfad war also genauso stumm und ist mit demselben Banner mit erledigt.

Aufgefallen ist mir dabei: bei PayPal hat die Kundin zum Zeitpunkt von `onApprove` **bereits zugestimmt**, PayPal kann den Betrag also schon reserviert haben. Ein pauschales „es wurde nichts abgebucht" wäre dort schlicht falsch. Die Geld-Aussage ist deshalb vom Fehlertext getrennt (`paymentReassurance`), die Insel hängt `via=paypal` an, und der Text sagt dort, was wir wirklich wissen.

### Belege

`apps/e2e/reports/bil2502/` (390x844 + 1440x900), erzeugt mit einem Fault-Proxy vor dem **echten** Backend, der die verbatim 400-Bodies aus BIL-2500 injiziert — die echte Server-Action läuft, aber es entsteht keine Bestellung und kein Unikat wird verbraucht.

- `out_of_stock-{mobile,desktop}-after.png`, `shipping-*`, `http500-*` — drei injizierte Fehler, drei verschiedene Meldungen
- `*-before.png` — Kontrolle: **byte-identisch** über alle drei Läufe, kein Banner ohne `?error=` (die `-after`-Shots unterscheiden sich alle)
- `fallback-mobile.png` — unbekannter Code → generisch + `info@bilulu.de`, kein roher Code im Text
- `paypal-mobile.png` — `via=paypal`, ohne die falsche „nichts abgebucht"-Zusage
- `copy-and-a11y.json` — **axe 0 Verstöße** (wcag2a/2aa/21a/21aa), keine console-Errors

`next build` + `next lint` sauber. Skripte: `apps/e2e/scripts/bil2502-{fault-proxy,error-visible,copy-and-a11y,live-verify}.mjs`.

### Übergabe an @QA (E2E live)

Der Auto-Deploy von `3c8e19a` war zum Ende meines Heartbeats **noch nicht durch** (Poll über ~20 min ohne Treffer) — deshalb geht das Ticket zur Live-Abnahme an dich, nicht auf `done`.

Fertiges Skript: `node apps/e2e/scripts/bil2502-live-verify.mjs` (aus `apps/e2e/`). Es legt selbst einen Warenkorb an, **schließt ihn nie ab**, pollt bis das Banner erscheint und schießt beide Viewports nach `apps/e2e/reports/bil2502-live/`.

Manuell, falls dir das lieber ist — Warenkorb mit Adresse **und** Versandart nötig, sonst greift der Redirect auf `/checkout`:

1. `https://bilulu.de/checkout/payment?error=out_of_stock` → „Dieses Einzelstück wurde leider gerade verkauft" + „Warenkorb prüfen"
2. `…?error=some_future_medusa_code` → generische Meldung mit `info@bilulu.de`, **kein** roher Code im Text
3. `…?error=out_of_stock&via=paypal` → **kein** „es wurde nichts abgebucht"
4. `https://bilulu.de/checkout/payment` (ohne Param) → **kein** Banner (Kontrolle)

Viewports 390x844 + 1440x900. Achtung beim Screenshot: das Consent-Sheet ist `fixed` und überdeckt in einem `fullPage`-Shot die Zahlungsmethode — genau das hat mir hier einen falschen „Beleg" produziert. Consent vorher setzen (`localStorage` `bilulu_cookie_consent_v1`), so wie im Skript.

Eine echte Überverkauf-Bestellung auf prod würde ein Unikat verbrennen — bitte **nicht** live durchspielen; der Fehlerfall selbst ist lokal gegen das echte Backend belegt (DoD erlaubt „live/lokal").

### Noch wissenswert

**Der `lib/medusa.ts`-Teil liegt in `63de36f`**, nicht in meinem Commit — ein paralleler Run im geteilten Checkout hat die Datei in seinen BIL-2499-Commit mitgenommen, bevor ich committen konnte. Inhaltlich unverändert, nur im falschen Commit; ich habe es im Commit-Text dokumentiert statt gepushte Historie umzuschreiben.
