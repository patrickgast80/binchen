# BIL-2482 — sandbox capture chain, measured against production

Run 2026-08-17, backend image `f1a1565` (contains the capture fix `18246ca`).
PayPal order `97041753GW6560201` · Medusa session `payses_01M086WSRTA3EMS0TN1868KK70`
· cart `cart_01M086WQF7JB7SMESJWW5AW2YS` · Medusa order `order_01M086WWAGCXST107QBSYJD6VP`.

This is the first time the capture path has executed in the shop's lifetime.

## Chain

- PASS **prod cart ready** — total 44 EUR
- PASS **pp_paypal session created in prod** — order `97041753GW6560201`
- PASS **custom_id carries the session id** — `payses_01M086WSRTA3EMS0TN1868KK70`
- PASS **approved by a sandbox buyer** — test card `…1111`, no real money
- PASS **`/api/checkout/complete` → Medusa order** — `order_01M086WWAGCXST107QBSYJD6VP`
- PASS **PayPal order COMPLETED with a capture id** — `6JF45558038607519`, 44.00 EUR
- PASS **capture resource still carries custom_id** — correlation key survives
- PASS **PayPal recorded PAYMENT.CAPTURE.COMPLETED** — `WH-7WW71991MF282251F-1RN34755S86127202`, `custom_id` on it
- PASS **capture refunded** — `4S138153TK945441A`, COMPLETED
- PASS **PayPal recorded PAYMENT.CAPTURE.REFUNDED**

## Webhook acceptance (not answerable from PayPal's API)

PayPal's `webhooks-events` API returns no per-transmission delivery status, and
`simulate-event` is neither logged nor signature-verifiable — so the proof comes
from our own backend log:

```
POST /hooks/payment/paypal  status=200  user_agent=PayPal/AUHD-1.0-1  15:54:43Z
Processing payment.webhook_received which has 1 subscribers          15:54:48Z
POST /hooks/payment/paypal  status=200  user_agent=PayPal/AUHD-1.0-1  15:57:16Z  (refund)
POST /hooks/payment/paypal  status=200  user_agent=PayPal/AUHD-1.0-1  15:57:20Z  (resend)
```

No `[payment-paypal] dropped unverified webhook` and no `no session id on webhook`
lines — those are exactly the two failures this path can produce, so their absence
is the positive result: the signature verified against `PAYPAL_WEBHOOK_ID` and the
event correlated to the session.

## The outcome that matters, from the database

```
id                              | amount | captured | capture_id
pay_01M086WZ8HYWQPBN02TS7SCAVX  | 44 eur | t        | 6JF45558038607519   <- after the fix
pay_01M08651JBEVW0RFZSJR3ADAWG  | 44 eur | f        | (none)              <- before, same day
```

The lower row is the bug: buyer approved, order placed, nothing captured. One
`capture` row exists in the whole database (`capt_01M086WZ9RJZS6PBJCW9S2B9C4`,
44 EUR) — the first money this shop has ever collected through PayPal.

## What this does NOT prove

The **live** webhook id. Signature verification is proven as a mechanism, against
the sandbox webhook id that prod is configured with. The live app will have a
different id, and that one can only be proven by the first real event after
cutover — see `infra/RUNBOOK.md` → PayPal Live-Cutover, step 6.
