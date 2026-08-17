**Vollzug Board-Order „Lösch diese Produkte" (17.08., 19:34Z) — 5 von 6 gelöscht, #6 ist der Body-Konfigurator und bleibt. Ursache für ein Wiederauferstehen gefunden und behoben.**

## Was gelöscht ist

Die fünf Demo-/Seed-Artikel mit den grauen SVG-Platzhaltern sind aus Medusa raus:

| # | Artikel | Handle |
|---|---|---|
| 2 | Bio-Baumwolle Strampler – Waldtiere | `bio-baumwolle-strampler-waldtiere` |
| 3 | Jersey Bodysuits Set – Regenbogen (2er-Pack) | `jersey-bodysuits-set-regenbogen-2er-pack` |
| 4 | Musselinhose – Salbeigrün | `musselinhose-salbeigrun` |
| 5 | Wendejacke – Punkte & Streifen | `wendejacke-punkte-streifen` |
| 6 | Spielanzug mit Füßen – Sternchen | `spielanzug-mit-fuen-sternchen` |

Live nach dem Lauf: Katalog **30 Produkte** (12/12/6 auf den drei Seiten), Startseite und `/fruehchen` ohne die kaputten Platzhalter, alle fünf PDPs liefern 404. Die 6 historischen Test-Bestellungen bleiben lesbar — Medusa v2 löscht Produkte soft und speichert `product_title`/`variant_title` denormalisiert auf der Bestellposition, Order #1 zeigt weiterhin „Musselinhose – Salbeigrün".

## Warum es zwei Anläufe brauchte — der eigentliche Fix

Der erste Löschlauf war nach ~4 Minuten wieder rückgängig. Nicht durch einen Fehler beim Löschen, sondern durch den **Boot-Seed**: `apps/backend/Dockerfile` ruft bei jedem Containerstart `seed.js` auf, und dessen Idempotenz-Check ist **pro SKU** (`p.variants.every(v => existingSkus.has(v.sku))`). Löscht man ein geseedetes Produkt, verschwinden seine SKUs — und der nächste Boot legt es neu an. Genau das passierte, als `api.bilulu.de` kurz nach dem Löschen neu startete: alle fünf waren zurück, mit **frischen IDs** (`prod_01KZN83F*` → `prod_01M08M1Q*`). Deshalb zeigte die Admin-Liste wieder 35, während ein `GET` auf die alte ID 404 lieferte.

Fix (`main@cd1c09a`): die fünf Demo-Einträge sind aus dem `products`-Array des Seeds entfernt. Der Seed ist jetzt reiner Katalog-Bootstrap (Konfigurator-Basisprodukt auf leerer DB); echte Artikel leben im Medusa-Admin. Die stillgelegten SKUs stehen als Kommentar drin, damit sie niemand versehentlich zurückholt. `delete-demos.mjs` matcht jetzt über den Handle statt über die ID — IDs überleben ein Re-Seed nicht, Handles und SKUs schon.

**Beleg, dass es hält:** nach dem Redeploy erneut gelöscht, dann `bilulu-backend` über die Coolify-API bewusst neu gestartet und nachgezählt — 30 Produkte davor, **30 danach, 0 Demo-Handles zurück**, beide Konfigurator-Produkte unversehrt.

## Artikel #1 „Body" — nicht gelöscht, umbenannt. Bitte um Bestätigung.

Der Katalogartikel „Body" ist **das Produkt, gegen das der Body-Konfigurator seine Variante auflöst**. `apps/storefront/src/lib/medusa.ts:301`:

```ts
const body = products.find((p) => /\bbody\b/i.test(p.title));
```

Ein Löschen hätte `/konfigurator/body` auf `?error=variant_unavailable` laufen lassen — dieselbe Wirkung wie ein Löschen von „Bilulu-Pumphose (Konfigurator)", das laut Board unantastbar ist. Es ist auch kein Seed-Demo: es hat ein echtes Foto als Thumbnail (`/konfigurator/body-foto/base.webp`), steht nicht im Seed und liegt bei 19,90 € statt der im Screenshot gelesenen 14,90 €.

Statt zu löschen habe ich es auf **„Bilulu-Body (Konfigurator)"** umbenannt — dieselbe Benennung wie die Pumphose, damit im Shop sichtbar ist, warum der Artikel dort steht, und damit ihn niemand beim nächsten Aufräumen für ein Demo hält. Der Resolver-Regex greift weiterhin (das Skript prüft vor *und* nach dem PATCH, dass dieselbe Produkt-ID herauskommt); `/konfigurator/body` rendert live „In den Warenkorb".

**@CEO — eine Entscheidung nötig:** Umbenennung so belassen (mein Vorschlag), oder soll der Artikel ganz aus dem Katalog verschwinden? Letzteres geht nur mit einer Code-Änderung an der Storefront (Konfigurator-Produkte aus der Katalogliste ausblenden statt löschen) — die gehört dann Frontend, und die Pumphose müsste konsequenterweise mit. Rückabwicklung der Umbenennung: ein PATCH auf `title: "Body"`.

## Unverändert

- Die **13 echten Alt-Artikel** (12 Pumphosen + 1 Turban) sind online und warten weiter auf Sabines A/B-Antwort.
- Der übrige Relaunch-Scope (Bilder ersetzen, Sets, neue Mütze) läuft weiter.

## Proof of work

```
$ node apps/backend/scripts/bil2490/delete-demos.mjs
DEL   prod_01M08M1QB4DTFJRJ5K9VJ0V280  Bio-Baumwolle Strampler – Waldtiere  -> deleted=true
DEL   prod_01M08M1QFCBS001DR5JF8XZAS7  Jersey Bodysuits Set – Regenbogen (2er-Pack)  -> deleted=true
DEL   prod_01M08M1QJJ3YZTBHAVRG297XRK  Musselinhose – Salbeigrün  -> deleted=true
DEL   prod_01M08M1QMQCMNG7NBGW0MJDQZG  Wendejacke – Punkte & Streifen  -> deleted=true
DEL   prod_01M08M1QPFR0F8JCNWB239QWCS  Spielanzug mit Füßen – Sternchen  -> deleted=true
products 35 -> 30;  still present: 0

# nach erzwungenem Neustart von bilulu-backend:
POST-RESTART admin product count: 30
demo articles resurrected: 0 []
konfigurator products intact: [ 'Bilulu-Pumphose (Konfigurator)', 'Bilulu-Body (Konfigurator)' ]

$ curl -s -o /dev/null -w '%{http_code}' https://bilulu.de/product/prod_01KZN83FTBD5F874C66RSRDB5K   # 404
$ for k in hose body muetze turban dreieckstuch; do curl -s https://bilulu.de/konfigurator/$k | grep -o 'In den Warenkorb'; done
In den Warenkorb   (5x)
```

`apps/backend` typecheck: sauber.

**Commits:** `da9634b` (Löschung + Body-Schutz), `cd1c09a` (Seed-Fix — der eigentliche Fix), `9986440` (Beleg-Artefakte).

**Rollback:** die fünf Produkte lassen sich aus `apps/backend/scripts/bil2490/deleted-demos-snapshot.json` neu anlegen (voller Snapshot inkl. Varianten, Preisen, Metadaten, Bildern); Seed-Einträge liegen in der Git-History von `cd1c09a`; Body-Titel per PATCH zurück auf `"Body"`.

**Nächster Reviewer:** CEO — nur für die eine Frage zu Artikel #1 (Body). Die fünf Löschungen brauchen keine Freigabe mehr, die waren Board-Order.
