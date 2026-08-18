## BIL-2516 erledigt — live auf https://bilulu.de (`main@367b808`, Belege `main@12f4e1b`)

Alle drei im Auftrag genannten Ausgänge sind zu, plus einer, der beim Nachmessen dazukam.

### Was jetzt passiert

| Fall | vorher | jetzt |
|---|---|---|
| Warenkorb nicht anlegbar | `return;` — Klick tat gar nichts | `/product/{id}?error=cart_unavailable` + Banner |
| `addLineItem` scheitert an Bestand | ignoriert, trotzdem `/cart` | `?error=out_of_stock` + **Unikat-Copy**, kein „nochmal versuchen" |
| `addLineItem` scheitert sonst | ignoriert, trotzdem `/cart` | `?error=add_failed` / `backend_unavailable` + Retry-Copy |
| Backend gar nicht erreichbar | **500-Fehlerseite** (ungefangener throw) | derselbe Hinweis wie oben |
| `removeFromCartAction` | `return;` — „Entfernen" tat nichts | `/cart?error=remove_failed` + Banner |
| kein `variantId` | `return;` | `?error=no_variant` — „Bitte wähle zuerst eine Variante" |

Die vierte Zeile stand nicht im Ticket: `createCart`/`getCart`/`addLineItem` benutzten blankes `fetch`. Der im Auftrag vorgeschlagene Repro-Weg — Storefront auf einen toten Host zeigen — hätte deshalb keinen Hinweis erzeugt, sondern die generische 500-Seite. Ein Ereignis, zwei völlig verschiedene Bildschirme. Alle Cart-Calls laufen jetzt über ein `cartFetch()`, das den Transportfehler loggt und `null` zurückgibt.

### Copy

`out_of_stock` teilt sich die Sätze mit dem Checkout (neu: `apps/storefront/src/lib/shop-error-copy.ts`, von `checkout-errors.ts` und der Produktseite importiert). Grund: derselbe Überverkauf kann beim Hinzufügen *oder* erst beim Abschluss auffliegen, und die Kundin darf dafür nicht zwei Erklärungen bekommen. Der Punkt dieser Datei ist der Anti-Rat — „gleich nochmal versuchen" ist bei einem verkauften Unikat schlicht falsch, und wer die nächste Fläche baut, soll das erben statt neu zu entscheiden. Unbekannte Codes fallen wie bei BIL-2510 auf Retry-Copy zurück, nie auf Stille.

Anders als bei den Konfiguratoren sind die Codes hier **nicht** zu einer Meldung zusammengefasst: Katalogprodukte sind echte Einzelstücke, Konfigurator-Basisprodukte werden auf Bestellung genäht und können nicht ausgehen.

### Ein Fund beim Nachmessen: das Banner war auf Mobil unsichtbar

Erste Fassung saß unter der Brotkrume, oben auf der Seite. Gemessen auf 390x844: ein Server-Action-Redirect **behält die Scroll-Position**, die Kundin tippt „In den Warenkorb" ~900px weit unten, das Banner lag damit **504px oberhalb ihres Viewports** — bestanden hätte jeder Text-Check, gesehen hätte sie nichts. Also genau der Bug dieses Tickets mit Hut.

Steht jetzt direkt über dem Button (Gestalt-Nähe: die Meldung gehört zu dem Bedienelement, das versagt hat). Gemessen nach dem Fix: mobil `top=378` bei `scrollY=621`, Desktop `top=447` — beide im Bild. Der Harness prüft das als eigene Bedingung, „im DOM" zählt nicht als bestanden.

### Beleg

`apps/e2e/scripts/bil2516-verify.mjs` — **12/12 grün**. Jeder Fall ist ein **echter Klick** gegen einen Fault-Proxy (`bil2516-fault-proxy.mjs`, hängt vor der echten Store-API und verfälscht nur den line-items-Call), kein von Hand getipptes `?error=`. Ein getipptes `?error=` würde nur beweisen, dass das Banner rendert — nicht, dass die Action jemals dorthin schickt, und genau das war kaputt.

Enthalten: Kontrollfall (`off` → Add landet wirklich im Warenkorb), `out_of_stock` (400 + `insufficient_inventory`), `backend_error` (503), `hangup` (Socket zerstört → Transportpfad), echtes `Entfernen`-Scheitern mit dem Teil noch in der Liste, und ein Regressionsschutz auf `/konfigurator/dreieckstuch` (BIL-2510 unverändert: Erfolg → `?added=konfigurator`, Fehler → das dortige Banner).

- axe (wcag2a/2aa/21aa) **0 Violations**, keine 4xx, keine Console-Errors.
- Lighthouse mobil `/product/{id}` mit Banner: **perf 91, a11y 99, best-practices 96, SEO 100, LCP 2,1s, CLS 0**. Kontrolle ohne Banner auf demselben Server: perf 96, LCP 2,3s. Bundle unverändert 110 kB First Load — `<ErrorBanner>` ist Server-Komponente, der Fehlerpfad kostet kein Client-JS.
- Die zwei fehlenden a11y-Punkte gehören nicht hierher (Cookie-Banner + Footer, auf jeder Seite) → als **BIL-2520** abgelegt, low, bei mir.

**Live nachgeprüft nach dem Deploy** (nicht nur lokal): alle drei Codes zeigen auf bilulu.de mobil + Desktop das richtige Banner, ohne `?error=` steht keins, und der Happy Path legt auf beiden Viewports wirklich eine Zeile in den Warenkorb (danach wieder entfernt).

Screenshots: `apps/e2e/reports/bil2516/` (lokal, alle Fälle) und `apps/e2e/reports/bil2516/live/` (Produktion).

### Aufgeräumt

`addToCartAction` ist raus — hatte seit einer Weile keinen Aufrufer mehr, war als `"use server"`-Export aber weiterhin ein erreichbarer POST-Endpunkt mit demselben stillen `if (!cart) return;`.

### Was ich nicht gemacht habe

Die Variantenauswahl wird beim Fehler-Redirect **nicht** mitgenommen (anders als `configHref` im Konfigurator). Bei `out_of_stock` wäre das Wiederherstellen sogar falsch — es böte ein Stück an, das weg ist. Bei den übrigen Codes ist der Verlust eine Radio-Auswahl und die Menge, nicht drei Stofffarben. Falls das jemand anders sieht, gern als Folge-Ticket.
