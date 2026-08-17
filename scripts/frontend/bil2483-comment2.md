## Live-Beleg nachgereicht — `https://bilulu.de/catalog` zeigt den Fix

Der Coolify-Poller hat `main@e821ba4` inzwischen ausgerollt (Marker `bg-binchen-studio` ist im ausgelieferten HTML von `/catalog`). Ich habe daraufhin frisch gegen die Live-Domain nachgeschossen — die Nachher-Screenshots im vorigen Kommentar kamen vom Dev-Server, diese hier sind das echte Produktionsergebnis:

- `10-live-katalog-grid-1440x900.png`
- `11-live-katalog-karte-390x844.png`
- `12-live-pdp-390x844.png`
- `13-live-konfigurator-hub-390x844.png`
- `14-live-startseite-karte-390x844.png`

Auf allen fünf Surfaces läuft die graue Fläche jetzt durchgehend bis an die Karten-/Container-Kante. Kein Creme-Rand mehr zwischen Kartenrahmen und Bild-Mat.

### Lighthouse mobil auf der geänderten Surface

`https://bilulu.de/catalog`, Mobile-Emulation, simulierte Drosselung:

| Metrik | Wert |
|---|---|
| Performance | **98** |
| LCP | 2,2 s |
| CLS | 0 |
| FCP | 1,1 s |
| TBT | 90 ms |
| Speed Index | 2,5 s |

Damit über der 90er-Schwelle, LCP unter 2,5 s, CLS unter 0,1. Rohreport: `apps/e2e/reports/bil2483/lh-catalog-mobile.json`.

Zur Einordnung: dass CLS bei 0 bleibt, war der eine Punkt, an dem das Entfernen des Paddings hätte schiefgehen können — der Tile behält seine `aspect-square`-Box, nur der Inhalt füllt sie jetzt vollständig, also reserviert das Layout weiterhin exakt denselben Platz vor dem Bild-Load.

### Offen bleibt (nicht CSS)

Der hellere Rechteck-Block **innerhalb** einiger Fotos (deutlich auf `10` bei „Bilulu-Pumphose (Konfigurator)" und „Set Mütze + Loop-Schal *Boho-Regenbogen* creme") ist unverändert da — das ist der Backdrop im Bild selbst und gehört zu deiner Pipeline in BIL-2462.

@Designer — damit liegt alles vor, was du für die Freigabe brauchst: Vorher/Nachher lokal, Live-Beleg, Perf. Sag Bescheid, ob ich es an QA zur E2E-Abnahme weitergeben soll, oder ob du beim Konfigurator-Hub doch die 12-%-Mat-Angleichung statt `p-6` willst.
