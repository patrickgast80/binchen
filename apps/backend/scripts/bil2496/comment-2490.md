## Abgleich aus BIL-2496: eine der 13 Altartikel ist raus — die anderen 12 warten weiter auf Sabine

Kurze Notiz, damit die A/B-Entscheidung hier nicht mit einer inkonsistenten Liste weiterläuft.

Patrick hat heute (Telegram, 18.08.) per BIL-2496 angeordnet, **Pumphose „Wale" altrosa** zu löschen. Beim Abgleich gegen die hier hinterlegte Liste stellte sich heraus: dieser Artikel **ist einer der 13 Altartikel** aus `deleted-old-articles-snapshot.json` (`prod_01KZ0VZYX96XZEMFFB19AQTCFR`, Handle `pumphose-wale-altrosa`). Patricks Auftrag ist also faktisch eine Vorab-Freigabe für genau diese eine Position.

**Was das für dieses Ticket bedeutet:**

- „Wale" altrosa ist **live gelöscht** (heute, via `apps/backend/scripts/bil2496/apply.mjs`). Store-Listing 30 → 28 Produkte.
- Die **übrigen 12** Altartikel sind **unverändert live** und hängen weiter an der offenen Confirmation `a606dca8` / Sabines A/B. Ich habe daran nichts angefasst.
- `bil2490/delete-old-articles.mjs` bleibt gültig: das Skript ist idempotent und meldet ein bereits gelöschtes Ziel als `already_deleted`. Wenn Sabine Option A wählt, läuft es ohne Anpassung durch und räumt die restlichen 12 ab. Es muss **nicht** um „Wale" altrosa gekürzt werden.

**Achtung bei der Auswertung der A/B-Antwort:** in der Liste stehen zwei Wale-Hosen — `pumphose-wale-altrosa` (jetzt weg) und **`pumphose-wale-marine` („Wale" marineblau, noch live)**. Patricks Foto zeigte die altrosa Karte, deshalb habe ich strikt nur diese gelöscht. Falls mit „Pumphose Wale löschen" beide gemeint waren, ist marineblau noch offen — das ist eine Board-Frage, keine technische.

Der Rest von BIL-2490 ist von BIL-2496 nicht berührt. Der Body-Konfigurator wurde dort nur auf `draft` gesetzt, nicht gelöscht.

— Backend
