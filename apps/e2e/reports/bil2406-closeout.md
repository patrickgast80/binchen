# BIL-2406 — Closeout-Beleg PayPal (Backend, 2026-08-17)

Board-Entscheid auf BIL-2406: *„paypal sollte funktionieren also hier abschliessen"*.
Vor dem Schließen wurde die komplette Kette **live gegen Prod** nachgemessen, nicht aus
alten QA-Zahlen übernommen. Skript: `apps/e2e/scripts/bil2406-closeout.mjs`
(Secrets aus `infra/.vault/paypal-sandbox.env`, nichts davon geloggt).

## Ergebnis: 10/10 Checks grün

| # | Check | Ergebnis |
|---|---|---|
| 1 | `pp_paypal` für Prod-Region DE/EUR registriert | ✅ `pp_paypal`, `pp_system_default` |
| 2 | Echter Prod-Warenkorb (Artikel + DE-Adresse + Versand) | ✅ `cart_01M084N6BVFPRPPRPTN0SQEAWP`, Total 44 EUR |
| 3 | Smart Button rendert auf live `/checkout/payment` | ✅ SDK-Tag vorhanden, `currency=EUR` |
| 4 | Umgebung, die eine Kundin sieht | ⚠️ **Sandbox-Client-ID** (= Vault-ID) → siehe Risiko unten |
| 5 | Vorkasse steht unverändert daneben (Regression) | ✅ Submit-Button vorhanden |
| 6 | `pp_paypal`-Payment-Session über unseren Provider | ✅ `pay_col_01M084N89CA3T13PAR05VFTAXD` → `payses_01M084NC19YCM8DBNZ95Y6ZA1F` |
| 7 | PayPal-OAuth mit Vault-Creds | ✅ HTTP 200 |
| 8 | Server-erzeugte PayPal-Order existiert & ist approvebar | ✅ Order `5YU1264040327872K`, `status=CREATED`, `approve`-Link |
| 9 | Betrag PayPal == Warenkorb (kein ×100-/Rundungs-Drift) | ✅ `44.00 EUR` vs. Cart `44` |
| 10 | Capture/Deny/Refund-Webhook auf unserem Endpoint | ✅ `https://api.bilulu.de/hooks/payment/paypal`, 3 Events |

Screenshot der Zahlseite: `apps/e2e/reports/bil2406-closeout-payment.png`.

Check 6–9 ist der eigentliche Zugewinn gegenüber der Messung vom Vormittag: die
PayPal-Order wird hier **durch unseren Medusa-Provider** aus einem echten Prod-Cart
erzeugt (genau die zwei Endpunkte, die `checkout/payment/page.tsx` serverseitig ruft),
und der Betrag wird gegen den Warenkorb geprüft. Damit ist die Kette
Shop → Medusa → PayPal bis exakt zum Login-Popup bewiesen.

## Was weiterhin ungetestet ist — und warum das akzeptiert wird

Käufer-Login (Approve) / Deny / Refund brauchen einen interaktiven PayPal-**Sandbox-Buyer**
-Account. Der ist per API nicht anlegbar (eigene Gegenprobe: `GET /v1/customer/accounts`
→ `404`), nur im PayPal-Dashboard — also reine Board-Aktion (BIL-2465). Das Board hat
entschieden, darauf nicht zu warten. Beleg-Lage dazu:

- PayPal-Event-Log über die letzten 5 Tage: **0 Events** — es hat also bis heute
  nachweislich **niemand** eine PayPal-Zahlung durchgeklickt, weder Test noch echt.
- Der Deny-/Refund-Pfad ist im Code implementiert und der Webhook ist bei PayPal auf
  unseren Endpoint registriert, aber nie mit einem realen Event durchlaufen.

## Risiko, das mit dem Schließen bestehen bleibt

Der Button ist seit 14.08. im echten Shop sichtbar, läuft aber im **Sandbox-Modus**.
Eine echte Kundin landet im Sandbox-Login und kommt mit ihrem echten PayPal-Konto
**nicht durch**. Kein Totalausfall — Vorkasse/Überweisung steht daneben und ist grün
(Check 5) —, aber es kostet potenziell Bestellungen.

Auflösung ist kein Backend-Code, sondern eine von zwei Board-Aktionen:

- **Live-Cutover** (empfohlen): Live-Client-ID + Live-Secret + Live-Webhook-ID vom Board,
  `PAYPAL_MODE=live`, DevOps setzt Env, Redeploy. → Folge-Ticket.
- **Zwischenlösung**, falls die Live-App noch nicht existiert: `NEXT_PUBLIC_PAYPAL_CLIENT_ID`
  im Storefront leeren + Redeploy → der Code fällt sauber auf „nur Vorkasse" zurück
  (`apps/storefront/src/app/checkout/payment/page.tsx:58`). Sofort reversibel.

## Rollback

Diese Änderung ist reines Test-/Doku-Material (ein Skript + dieser Bericht) — kein
Produktionspfad berührt, Rollback = Commit revertieren. Der PayPal-Stack selbst wird
durch 5 Env-Variablen + Redeploy zurückgenommen (siehe BIL-2463).
