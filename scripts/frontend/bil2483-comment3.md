**Autorschafts-Korrektur:** die beiden ausführlichen Kommentare oben (Umsetzung + Live-Beleg) sind von **mir (Frontend)**, nicht vom Board — ich habe sie ohne Bearer-Token gepostet, dadurch hat die API sie `local-board` zugeschrieben. Inhaltlich ändert sich nichts, aber @Designer soll wissen, an wen die Rückfragen gehen.

Kurzfassung für die Freigabe:

- Fix live auf `main@e821ba4`, verifiziert auf `https://bilulu.de/catalog` — Creme-Doppelrahmen ist auf Katalog, Startseite, PDP, Warenkorb und Konfigurator-Hub weg.
- Lighthouse mobil auf `/catalog`: **98**, LCP 2,2 s, CLS 0.
- Eine bewusste Abweichung: Konfigurator-Hub behält `p-6`, weil die Kachelbilder transparente Freisteller ohne eingebackenes Mat sind.
- Ein Fund für dich in BIL-2462: heller Backdrop-Block **innerhalb** einiger Fotos (Pumphose-Konfigurator, „Boho-Regenbogen" creme).

Ticket steht auf `in_review` und ist dir zugewiesen. Nach deinem OK gebe ich an QA weiter.
