## Löschung durchgezogen — Relaunch komplett. Dabei ein Überverkauf-Bug an den Unikaten gefunden und behoben.

**Zum Wake:** ausgelöst hat ihn das Fertigwerden von BIL-2494 (PDP-Galerie, QA-PASS). Der eigentliche Auslöser für Arbeit war aber ein anderer: die Board-Confirmation `a606dca8` ist seit **heute 07:48Z akzeptiert** — also nach meinem letzten Kommentar von 07:31, in dem noch stand, die 12 Altartikel warteten auf Sabine. Damit war das letzte Gate offen und ich habe Schritt 4 + 5 des Auftrags zu Ende gebracht.

### 1. Die 13 Altartikel sind weg

`delete-old-articles.mjs` lief erstmals scharf mit `--confirm-board-decision-a`:

- **12 gelöscht**, „Wale" altrosa war durch BIL-2496 schon raus und wurde idempotent als `already_deleted` gemeldet — das Skript musste dafür nicht angepasst werden.
- Katalog **29 → 17** (16 published + Body als draft).
- Vorher: frischer Pre-Delete-Dump `binchen-20260818T075047Z.dump` auf dem Hetzner-Host gezogen, und der nächtliche Dump gegengeprüft (gültiges custom-format-Archiv, 139 TABLE-DATA-Einträge) — nicht nur „Datei ist da".

**Die offene Frage aus BIL-2496 hat sich damit erledigt:** „Wale" marineblau (`pumphose-wale-marine`) stand auf der 13er-Liste und ist mit gelöscht. Es braucht keine separate Board-Entscheidung mehr.

### 2. Verifikation gegen live, nicht gegen das Lauf-Log

Neu: `verify-after-delete.mjs` — **44/44 grün**. Store- **und** Admin-Listing, alle 16 PDPs auf 200 ohne `variant_unavailable`, alle 13 gelöschten PDPs auf 404, Katalog (12+4=16 Produktlinks), Startseite, /fruehchen, 4 Konfiguratoren.

Zwei Dinge, die ich dabei korrigieren musste:

**Der Body-Konfigurator ist kein Fehlschlag.** Mein erster Lauf meldete „Store hat 16 statt 17" und „/konfigurator/body 404". Ursache ist nicht die Löschung, sondern BIL-2496: der Body steht bewusst auf `draft`. Das Skript assertet jetzt die *erwartete* Form (in Admin vorhanden, Status draft, im Store abwesend, Route 404), statt den Fall zu überspringen — eine echte Regression würde also weiterhin auffallen.

**Der erste Verify-Lauf war zu früh.** Er lief 07:53:17Z, der Backend-Container startete 07:53:57Z neu. Genau in diesem Fenster ist die Löschung beim letzten Mal wiederauferstanden. Ich habe deshalb den Deploy meines eigenen Commits abgewartet und **nach** dem Boot-Seed erneut geprüft: Seed meldet `Seeded 0/1 products`, die Löschung hält.

### 3. Der eigentliche Fund: alle Unikate standen auf Bestand 50

Im Boot-Log stand `Seeding inventory levels @ 50 units per variant` … `17 updated` — bei **jedem Containerstart**. Binchen verkauft handgenähte Unikate. Jedes der 15 Relaunch-Produkte war damit **50× bestellbar**, und jede Korrektur im Admin hielt nur bis zum nächsten Deploy.

**Das korrigiert eine Aussage aus meinem Abnahme-Kommentar von 07:03.** Dort stand „Bestand 1", und die Store-API bestätigt das auch brav mit `inventory_quantity: 1`. Der Wert kommt aber nicht aus dem Lager — die autoritative Abfrage über `/admin/inventory-items` zeigte auf allen 17 Varianten `stocked_quantity=50`, `available_quantity=50`. Die Store-API war hier kein Beleg.

Zwei Änderungen, beide live verifiziert:

| | |
|---|---|
| `seed-inventory.ts` | fasst ein existierendes Inventory-Level nicht mehr an — nur noch anlegen, nie überschreiben. Boot-Log meldet jetzt `17 left untouched`. |
| `fix-oneoff-stock.mjs` | repariert die Altdaten: 15 Unikate zurück auf 1. |

Bewusster Tradeoff: ein wirklich ausverkaufter Artikel bleibt jetzt ausverkauft, statt beim nächsten Deploy auf 50 wiederbelebt zu werden. Bei Unikaten ist das richtig — es ist die Umkehrung der Annahme aus BIL-2386, die für Meterware gedacht war.

Die beiden Konfigurator-Basisprodukte sind **Made-to-Order** und bleiben unangetastet (Pumphose behält 50 bei 4 reservierten). Das Reparaturskript klemmt nie unter die reservierte Menge, sonst wird `available_quantity` negativ und ein laufender Checkout bricht.

### 4. Was ich NICHT selbst abnehme → BIL-2500 an QA

Bestand ist repariert und gegen die Admin-API geprüft, aber die **Kauf-Semantik** sollte ich nicht selbst abnehmen: dass zwei parallele Warenkörbe auf dasselbe Unikat nur einen Abschluss zulassen, hängt an der Reservierung zum Payment-Intent — genau der Fall, den ein Bestandswert allein nicht beweist. **BIL-2500** liegt bei QA mit Testmatrix und Reparaturskript. Falls Fall 3 fehlschlägt, ist es ein Backend-Bug und kommt zurück an mich.

### Commits & Rollback

`0aeb497` (Löschung + Verify) · `750aad9` (Bestands-Fix) · `f6fa158` (Verify-Ergebnis nach Deploy)

Rollback: `deleted-old-articles-snapshot.json` (12) + `bil2496/pre-change-snapshot.json` („Wale" altrosa) enthalten die vollständige Produktform inkl. Preise und Bilder; `fix-oneoff-stock-results.json` jeden from/to-Wert. Backstop ist der Pre-Delete-Dump. Die Seed-Änderung ist ein Revert einer Datei.

**Status:** damit ist BIL-2490 vollständig — Bilder, Sets, Produkte, Löschung, alle Flächen. Nächster Reviewer: **QA für BIL-2500**. Für das Board bleibt nichts offen.
