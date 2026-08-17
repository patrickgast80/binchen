## Kurzantwort aufs Board (Backend, frisch geprüft am 2026-08-17)

**Ist Sandbox grün?** Zu ~80 % — alles, was ohne Menschen testbar ist, ist grün. Der eine Rest-Pfad (PayPal-Login des Käufers) ist bis heute **nie gelaufen**.
**Funktioniert PayPal?** Serverseitig ja, bis exakt zum Login-Popup. Ob ein Käufer real durchkommt, ist **unbewiesen**.
**Kann man das Ticket schließen?** **Nein** — noch nicht ehrlich schließbar.
**Musst du was machen?** **Ja, genau eine Sache**, ca. 3 Minuten → siehe unten.

---

### Was ich heute live nachgemessen habe (keine alten QA-Zahlen)

| Check | Ergebnis |
|---|---|
| Sandbox-Credentials gültig? | ✅ OAuth-Token `200`, gültig 32.400 s |
| PayPal als Zahlart im Prod-Shop registriert? | ✅ `GET api.bilulu.de/store/payment-providers` (Region DE/EUR) → `[{"id":"pp_paypal","is_enabled":true},{"id":"pp_system_default","is_enabled":true}]` |
| Kann unser Server eine PayPal-Bestellung anlegen? | ✅ `POST /v2/checkout/orders` → `201`, Order-ID `5G884995RV5229314`, Status `CREATED`, `approve`-Link vorhanden |
| Webhook registriert & Vault-ID korrekt? | ✅ `92L05236P61241023` → `https://api.bilulu.de/hooks/payment/paypal`, Events `PAYMENT.CAPTURE.COMPLETED / .DENIED / .REFUNDED`; ID stimmt mit Vault überein |
| Käufer-Login (Approve) / Deny / Refund | ⛔ **ungetestet** — braucht einen Sandbox-**Käufer**-Account |
| Buyer-Account per API anlegbar? | ❌ Nachgeprüft: `GET /v1/customer/accounts` → `404`. Bestätigt die CEO-Analyse: nur manuell im Dashboard. |

Kurz: die Kette Shop → Medusa → PayPal steht. Es fehlt der Test-Käufer, der auf „Bezahlen" klickt.

---

### Das eine, was nur du machen kannst (BIL-2465, ~3 Min)

1. https://developer.paypal.com → einloggen → **Testing Tools → Sandbox Accounts**
2. Dort liegt meist schon ein **Personal**-Account (`sb-…@personal.example.com`). Falls nicht: **Create Account → Personal**.
3. Über **⋮ → View/Edit account** E-Mail + Passwort kopieren (Passwort ggf. auf einen bekannten Wert setzen).
4. Beides hier oder in BIL-2465 als Kommentar posten — DevOps trägt es in `infra/.vault/paypal-sandbox.env` ein (`PAYPAL_SANDBOX_BUYER_EMAIL/_PASSWORD`, Platzhalter liegen schon leer bereit).

Das ist ein reiner **Test**-Account mit Spielgeld — kein echtes Konto, kein echtes Geld.

Danach läuft es ohne dich weiter: QA fährt BIL-2464 (Approve / Deny / Refund + Vorkasse-Regression) → grün → BIL-2406 kann ich schließen.

---

### Ein Punkt, den du kennen solltest (keine Panik, aber Entscheidung nötig)

Der PayPal-Button ist seit dem 14.08. **im echten Shop sichtbar, läuft aber im Sandbox-Modus** (`PAYPAL_MODE=sandbox`, Sandbox-Client-ID im Storefront). Das war so geplant, damit QA gegen die echte Umgebung testen kann.

Folge: Eine echte Kundin, die auf „Mit PayPal bezahlen" klickt, landet im Sandbox-Login und kommt mit ihrem echten PayPal-Konto **nicht durch**. Kein Totalausfall — Vorkasse/Überweisung steht immer daneben und funktioniert (QA-verifiziert) —, aber es kostet potenziell Bestellungen.

Zwei Optionen, du entscheidest:

- **A (Empfehlung):** Buyer-Account liefern → QA-E2E → danach Live-Umstellung. Kurzer Weg, Button bleibt solange sichtbar.
- **B (falls es länger dauert):** PayPal im Shop vorerst ausblenden. Einzeiler für DevOps (`NEXT_PUBLIC_PAYPAL_CLIENT_ID` im Storefront leeren + Redeploy), sofort reversibel. Der Code fällt sauber auf „nur Vorkasse" zurück — dafür ist `apps/storefront/src/app/checkout/payment/page.tsx:58` schon gebaut.

Sag einfach „A" oder „B".

---

### Und danach? (damit du den Gesamtweg kennst)

Für „PayPal funktioniert für echte Kundinnen" braucht es **zwei** Board-Aktionen, nicht eine:

1. **jetzt:** Sandbox-Buyer-Account → schließt BIL-2464 und BIL-2406.
2. **später:** Live-Credentials (Client-ID/Secret der Live-App + Live-Webhook) für die Umstellung `sandbox → live`. Das ist ein eigenes Cutover-Ticket, das ich anlege, sobald Sandbox grün ist.

**Backend-Status:** kein offener Code-Pfad. Modul, Button und Webhook sind seit 2026-08-04 in `main` und laut heutiger Messung intakt. Ich werde erst wieder gebraucht, wenn QA einen FAIL findet oder das Live-Cutover ansteht.
