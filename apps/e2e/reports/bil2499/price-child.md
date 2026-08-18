## Befund (Live, 18.08. 09:20Z)

Der neue Konfigurator `/konfigurator/hose-kurz` ist live und funktioniert — aber die **Warenkorbzeile kostet 39,00 €**, während **derselbe Artikel im Katalog 28,90 €** kostet ("Pumphose kurz Dinos", Produkt #1 aus `docs/BIL2490-SET-GRUPPIERUNG.md`).

Beleg aus dem Live-Warenkorb (`apps/e2e/reports/bil2499/live/cart-check.json`):

```
Konfigurator-Hose (kurz)
Länge: kurz · Bund: Marineblau · Hose: Stoff 14 · Bündchen: Senfgelb · Muster: 180° gedreht
39,00 €
```

## Ursache

Es gibt in Medusa **kein eigenes „kurz"-Konfiguratorprodukt**. Der Resolver `getConfiguratorHoseKurzVariant` (BIL-2499) ist bewusst so gebaut, dass er ein später angelegtes kurz-Produkt bevorzugt und **bis dahin auf die bestehende Konfigurator-Basis der langen Pumphose zurückfällt** — und die kostet 39,00 €. Die Länge reist bereits als Line-Item-Metadatum mit, die Bestellung ist also eindeutig, nur der Preis stammt vom falschen Produkt.

Das war eine bewusste Entscheidung, um kein bestehendes Produkt umzubenennen (die Konfiguratorprodukte werden per Titel-Regex aufgelöst, siehe `reference_konfigurator_products_resolved_by_title`).

## Warum das eine Entscheidung und kein Bug-Fix ist

Ich kann das nicht einseitig auflösen, weil zwei Lesarten plausibel sind:

1. **Kurz soll günstiger sein als lang.** Dann braucht es ein eigenes Medusa-Produkt für die kurze Konfigurator-Hose mit eigenem Preis.
2. **Maßanfertigung kostet mehr als Katalogware.** Dann sind 39,00 € gewollt, und der Katalogartikel zu 28,90 € ist einfach das fertige Einzelstück.

Aktuell ist der Zustand allerdings in jedem Fall erklärungsbedürftig: die **kurze** Hose kostet im Konfigurator mehr als die **lange** Hose im Katalog-Vergleich sowie deutlich mehr als dieselbe kurze Hose als Katalogartikel.

## Was gebraucht wird

- **Board/Sabine:** Zielpreis für die konfigurierte kurze Pumphose (oder Bestätigung, dass 39,00 € korrekt sind).
- **Backend:** falls ein eigener Preis gewünscht ist — neues Medusa-Produkt anlegen. Titel muss die Regex-Auflösung eindeutig lassen und darf den bestehenden langen Konfigurator **nicht** treffen; der Resolver greift ein solches Produkt automatisch, sobald es existiert (kein Frontend-Deploy nötig, aber ich verifiziere gern nach).
- Bestehende Produkte **nicht** umbenennen.

## Nicht betroffen

Alle fünf Akzeptanzkriterien von BIL-2499 sind live abgenommen (Schildchen, `?rot=`, OG-Karte, Merken-Thumbnail, Warenkorb-Inhalt). Es geht hier ausschließlich um den Preis.
