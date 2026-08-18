## Gefixt und live verifiziert — Checkout geht auf allen 17 Produkten wieder

Deine Diagnose war punktgenau, inkl. der Erklärung warum es erst bei `complete` knallt. Audit vor dem Eingriff hat sie 1:1 bestätigt: **16 von 17 Produkten** hingen an einem Profil mit **0 Versandoptionen**.

### Was geändert wurde

**1. Live-Daten repariert (wirkt sofort, ohne Deploy)**

Alle 16 Produkte auf `sp_01KVFAA1580RJBGMV8QMWWZVRV` ("Default", 3 Optionen) umgehängt — inkl. `Bilulu-Body (Konfigurator)` (draft). Skript: `apps/backend/scripts/bil2501/fix-shipping-profile.mjs`.

Wichtig: das Skript **hardcodet die Profil-ID nicht**, sondern löst das Ziel über die Daten auf — *das Profil, das Versandoptionen besitzt*. Bei mehreren Optionen-Profilen bricht es lieber ab, statt zu raten (ein späteres Sperrgut-/Abholprofil bleibt so heil).

**2. Ursache im Anlage-Pfad beseitigt (deine Frage 2)**

Der Bug war nicht "ohne `shipping_profile_id` angelegt" — `apply.mjs` *hat* eins gesetzt, nur das falsche:

```js
shippingProfileId: (await jsonFetch(`${BACKEND}/admin/shipping-profiles?limit=1`, …)).shipping_profiles[0].id
```

`limit=1` = Münzwurf zwischen zwei Profilen, die **beide** `type: "default"` heißen:
- `sp_01KVFA9F9H00CR770SBKXAEM61` "Default Shipping Profile" ← Medusas eigener Seed, **0 Optionen**
- `sp_01KVFAA1580RJBGMV8QMWWZVRV` "Default" ← unser `seed-shipping.ts`, **3 Optionen**

Zwei weitere Anlage-Skripte hatten denselben Fehler in anderer Form — sie filterten auf `type === "default"`, was auf **beide** Profile passt. Alle drei lösen das Profil jetzt über die Optionen auf:
- `bil2490/apply.mjs`
- `bil2458/create-body-product.mjs`
- `bil2432/import-new-collection.mjs`

**3. Selbstheilung beim Boot (der eigentliche Schutz)**

Skripte zu fixen reicht nicht: die **Medusa-Admin-UI defaultet ebenfalls auf das optionslose Profil**, Sabine kann den Bug also jederzeit per Hand neu erzeugen. Deshalb hängt `seed-shipping.ts` jetzt bei jedem Containerstart (Dockerfile:70) alle Produkte von einem optionslosen Profil aufs Optionen-Profil um. Der bestehende Backfill rettete nur Produkte **ganz ohne** Profil — genau deshalb hat er hier nicht gegriffen.

Bewusst konservativ: Profile **mit** Optionen werden nie angefasst; besitzt das Zielprofil selbst keine Optionen, bricht der Reconcile mit Warnung ab statt Produkte auf ein leeres Profil zu schieben.

### Beleg: voller Checkout live, mit deiner Variante

`apps/backend/scripts/bil2501/verify-checkout.mjs` spielt exakt deine Repro nach — `variant_01KZ0VZSX50NT8TGWTQ1Y2P48M`, Pumphose "Eukalyptus" creme, Vorkasse:

| Schritt | Ergebnis |
|---|---|
| Cart + Line-Item | 200 |
| Adressen | 200 |
| `GET /store/shipping-options` | 200 → "Standard DE" |
| Shipping-Method | 200 |
| Payment-Session `pp_system_default` | 200 |
| **`POST /store/carts/{id}/complete`** | **200 — vorher 400** |

Order `order_01M09ZHTA7RYYF2S0NZXPRA7JK`, **32,90 €** inkl. **5,00 € Versand**.

**Aufgeräumt:** Order storniert, Bestand des Unikats gegengeprüft — `stocked 1 / reserved 0 / available 1`. Das Einzelstück ist wieder verkäuflich, du hast für den Race-Test volle Stückzahl. Bestand kommt aus der **Admin**-Inventory-API, nicht aus `/store` (die meldet bekanntlich nicht-autoritative Werte).

Idempotenz-Beleg: zweiter Lauf → *"0 product(s) to move, 17 already correct"*. Audit jetzt: **17/17 checkout-fähig, 0 broken**.

### Zu deiner Frage 3 — Frontend

Ja, eigenes Ticket, ist raus: **BIL-2502** (Frontend, high). Der stumme Pfad ist bestätigt — `page.tsx` hat null Treffer für `searchParams`/`error`, während `actions.ts` an **drei** Stellen dorthin redirected.

Das ist für dich bei BIL-2500 direkt relevant: der Verlierer im Parallel-Kauf **muss** "Dieses Einzelstück wurde leider gerade verkauft" sehen statt eines stummen Reloads. Falls du dafür einen stabilen Fehlercode statt der durchgereichten Medusa-Message brauchst, sag Bescheid — liefere ich strukturiert (`code`/`message`/`requestId`) nach.

### Deploy & Rollback

- Live-Datenfix wirkt **sofort**, unabhängig vom Deploy.
- Code auf main: `8b73c8e` (Auto-Deploy-Poller zieht es). Der Reconcile ist beim aktuellen Stand ein **No-op** — alle 17 hängen schon richtig; er greift erst, wenn jemand ein Produkt neu falsch anlegt.
- **Rollback:** `node apps/backend/scripts/bil2501/fix-shipping-profile.mjs --rollback` spielt `rollback-plan.json` zurück (pro Produkt das vorherige Profil, vor der Mutation geschrieben). Für den Code: `git revert 8b73c8e`.

### BIL-2500 ist entblockt

Der Blocker ist weg — ein Warenkorb mit einem Unikat kann abschließen. Deine eigentliche Frage (2 parallele Carts auf dasselbe Unikat, nur einer darf durch) ist jetzt testbar.

Nächster Reviewer: **QA** — bitte Vollcheckout Vorkasse gegen ein Unikat gegenprüfen und dann BIL-2500 fortsetzen. Ein Hinweis zur Bewertung: der Race-Test wird echte Orders erzeugen; die Stornier-Route oben stellt den Bestand nachweislich wieder her.
