## Beides live umgesetzt und verifiziert

Patricks zwei Punkte sind erledigt: `main@70749c3` (Änderung) + `main@3048b15` (Beleg).

### 1. Pumphose „Wale" altrosa — gelöscht

`prod_01KZ0VZYX96XZEMFFB19AQTCFR`, Handle `pumphose-wale-altrosa`. Weg aus Admin und aus dem Store-Listing (30 → 28 Produkte).

### 2. Body-Konfigurator — ausgeblendet, nicht gelöscht

`prod_01KZ6Q1S10H9S6SG11NRZAVG7M` steht auf `status=draft`. Damit fällt es aus `/store/products` und die Karte ist aus Katalog **und** Startseite raus — beide ziehen aus derselben Quelle, es brauchte also keine zweite Stelle. Das Produkt selbst existiert weiter samt Varianten, Preisen und Bildern.

Zusätzlich `/konfigurator/body` auf `notFound()` gestellt. Grund: ein Draft-Produkt lässt `getConfiguratorBodyVariant()` `null` liefern — die Seite hätte sonst als voll interaktive Sackgasse weitergelebt, deren „In den Warenkorb"-Button nur noch auf `?error=variant_unavailable` zurückspringt. Genau der stille Bruch, vor dem das Ticket gewarnt hat.

**Reaktivierung („für später aufheben") = zwei Handgriffe, nichts ist gelöscht:**

1. `BODY_KONFIGURATOR_ENABLED` in `apps/storefront/src/app/konfigurator/body/page.tsx` auf `true`
2. Produkt zurück auf `status=published`

Seite, Foto-Assets unter `/konfigurator/body-foto/`, Palette und Registry-Eintrag liegen unverändert im Repo.

### Guardrails — beide geprüft, beide sauber

**Titel-Regex-Falle.** Der Hose-Konfigurator löst über `/pumphose/i` gegen die **Store-Reihenfolge** auf, nicht gegen Admin. Das Apply-Skript reproduziert deshalb genau diesen Lookup und verweigert den Delete, falls er ausgerechnet auf das Ziel zeigt. Er zeigt auf `Bilulu-Pumphose (Konfigurator)` — „Wale" altrosa war nie load-bearing, der Delete war unkritisch.

Nicht nur behauptet, sondern durchgestochen — echter Warenkorb gegen die Live-Store-API nach dem Delete:

```
resolved product: Bilulu-Pumphose (Konfigurator) prod_01KZ0PC73515RHSB8XJB1MJJBR
resolved variant: variant_01KZ0PC73526W84C290ZDDBECJ sku HOSE-KONF-BASE inv 1 price 39 EUR
cart created:     cart_01M09VJVDJ6QNYJXZQN0J200VT
add-to-cart HTTP  200
line item:        Bilulu-Pumphose (Konfigurator) | Konfigurator-Basis | qty 1 | unit 39
ADD-TO-CART GREEN
```

**Seed-Resurrection.** `seed.ts` legt heute nur noch `HOSE-KONF-BASE` an; keines der beiden Ziele steht drin. Das Skript liest die Quelle und bricht ab, falls sich das ändert. Der Neustart-Test ist kein Trockenlauf, sondern echt passiert: der Auto-Deploy-Poller hat um 07:20 UTC beide Container neu gebaut, `seed.js` lief beim Boot — danach gemessen:

```
admin total products:  29   (28 published + 1 draft Body)
Wale altrosa resurrected?  no (still gone)
Body product status:       draft
store product count:       28
```

### Live-Beleg nach dem Deploy

Screenshots in `apps/e2e/reports/bil2496/`, Skript `apps/e2e/scripts/bil2496-live-verify.mjs`:

| Check | Ergebnis |
|---|---|
| Katalogkarten gesamt (alle 3 Seiten) | 28 |
| „Wale" altrosa im Katalog | nein |
| Body-Karte im Katalog | nein |
| Body-Karte auf Startseite | nein |
| Body im Konfigurator-Hub | nein |
| `/konfigurator/body` | **404** (stillgelegt) |
| `/konfigurator/hose` | 200, Warenkorb-Button vorhanden |

Zum Cookie-Banner: das verdeckte im ersten Lauf genau die Kartenreihe, die der Beweis zeigen soll. Der Consent wird jetzt per `addInitScript` vorab gesetzt, und das Skript **bricht ab**, wenn das Banner am Ende doch sichtbar ist — damit kein Screenshot als Beleg durchgeht, der nur das Banner zeigt.

### Abgleich mit BIL-2490 — bitte kurz lesen

„Wale" altrosa **ist einer der 13 Altartikel**, die dort auf Sabines A/B warten (Confirmation `a606dca8`). Patricks Auftrag ist damit faktisch eine Vorab-Freigabe für genau diese eine Position. Vermerkt im BIL-2490-Thread. Die **übrigen 12 sind unverändert live** und weiterhin blockiert — ich habe sie nicht angefasst. `bil2490/delete-old-articles.mjs` ist idempotent und muss nicht gekürzt werden; es meldet „Wale" altrosa künftig als `already_deleted`.

### Eine offene Board-Frage

Es gibt **zwei** Wale-Hosen. Patricks Foto zeigte die **altrosa** (26,90 €), und Titel wie Beschreibung dieses Tickets nennen ausdrücklich altrosa — also habe ich strikt nur diese gelöscht. **`Pumphose „Wale" marineblau` (`prod_01KZ0VZVR4CGBWAM6QEKDFJTHW`) ist noch live.** Falls „Pumphose Wale löschen" beide meinte, sage kurz Bescheid, dann ist das ein Einzeiler. Ich rate bewusst nicht — sie steht ohnehin auf der 13er-Liste und würde bei Option A mit abgeräumt.

### Rollback

Beides in einem Schritt zurückdrehbar: Produkt-Restore aus `apps/backend/scripts/bil2496/pre-change-snapshot.json` (voller Vor-Zustand inkl. Varianten, Preisen, Bildern), Body zurück auf `published`, Flag auf `true`. Der Medusa-Delete ist ein Soft-Delete, historische Bestellungen behalten ihre denormalisierten Titel und bleiben lesbar.

**Nächster Reviewer:** QA für den Katalog-Gegencheck; CEO/Board nur für die offene Marineblau-Frage oben.

— Backend
