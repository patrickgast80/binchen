## Konfigurator kurze Pumphose „Dinos" — gebaut, lokal komplett verifiziert, Live-Deploy hängt an DevOps

Route: **`/konfigurator/hose-kurz`**. Auf `main` als `63de36f` (Feature) + `b2716ae` (Warenkorb-Check).

### Das Schildchen — zwei unabhängige Absicherungen

Die Auflage war „eigene Ausschluss-Zone, nicht nur hell lassen". Umgesetzt sind **beide** Ebenen:

1. **Ausschluss-Zone.** Keine Recolour-Maske deckt das Schildchen ab.
2. **Eigene Ebene obendrauf.** `label.webp` wird als *letzte* Ebene im Normal-Blend über den ganzen Multiply/Screen-Stack gezeichnet. Die Pixel, die eine Besucherin sieht, sind also immer Sabines Originalpixel — auch wenn eine Maske jemals lecken würde.

Die Segmentierung ist **topologisch, nicht per Koordinate**: das Schildchen ist das *eingeschlossene Loch* im Bund. Kein Farbschwellwert, keine Bildkoordinaten — das überlebt ein Neufoto, solange das Schildchen aufgenäht ist. Bund und die zwei Beinbündchen sind die drei großen orangen Komponenten; die *gedruckten* orangen Dinos sind um Faktor 2 kleiner und fallen über die Fläche raus. Beides mit Abbruch-Assertions: ändert sich das Quellfoto so, dass die Annahme kippt, scheitert der Build laut statt still falsch zu segmentieren.

**Beleg ist gemessen, nicht nur angeschaut** (`apps/storefront/scripts/bil2499-label-proof.mjs`): der echte Server-Compositor rendert 5 Kombinationen und die Schildchen-Pixel werden byteweise verglichen.

| Kombination | max. Abweichung |
|---|---|
| Terrakotta · Petrol (Default) | Referenz |
| Creme · Creme · Creme | **0 / 255** |
| Marineblau · Tannengrün · Rost | **0 / 255** |
| Senfgelb · Stoff 14 | **0 / 255** |
| Salbei · Stoff 01 · `?rot=90` | **0 / 255** |

Creme und Marineblau sind mit Absicht drin: ein Leck würde das Schildchen in *entgegengesetzte* Richtungen verfälschen, keine einzelne Toleranz kann beides verstecken.

Bund-Zooms mit 2+ Stoffen wie gefordert: `apps/e2e/reports/bil2499/bund-zoom-*.png` (Creme, Marineblau, Stoff 01, Stoff 14, Default) sowie aus dem Browser `apps/e2e/reports/bil2499/local/{mobile-390x844,desktop-1440x900}-*-bund.png`.

### Zwei Fehler, die der Messbeleg gefunden hat und ein Screenshot nicht gefunden hätte

- **164 transparente Pixel *im Inneren* des Schildchens.** Die erste Fassung hat RGB+Alpha in einem Resize-Durchlauf hochskaliert; der Resampler hat auf der Alpha-Kante geklingelt und Nadelstiche gerissen — jeder davon ein Loch, durch das die Einfärbung scheint. Bei 1:1 unsichtbar. Alpha wird jetzt getrennt skaliert und neu geschwellt.
- **Grauer Halo um das Schildchen.** Ausschluss war 3px *breiter* als die gemalte Ebene, der Ring behielt also das neutrale Grau der Basis und zeichnete auf cremefarbenem Bund eine sichtbare Kontur. Jetzt ist der Ausschluss strikt *innerhalb* der gemalten Ebene (Schildchen minus 1px), es bleibt nichts Ungetöntes übrig.

### Add-to-cart — Titel-Regex geklärt

Wie im Auftrag verlangt geprüft, ohne bestehende Produkte umzubenennen. Der bestehende Resolver nahm den **ersten** `/pumphose/i`-Treffer — das ging nur gut, weil „Bilulu-Pumphose (Konfigurator)" zufällig zuerst sortiert; ein zweites Konfiguratorprodukt hätte ihn sich still gegriffen. Jetzt:

- Langer Hose-Resolver: explizit auf `(Konfigurator)` und gegen `\bkurz\b` abgesichert.
- Neuer `getConfiguratorHoseKurzVariant`: bevorzugt ein später von Backend angelegtes „kurz"-Konfiguratorprodukt und fällt bis dahin auf die bestehende Basis zurück. **Heute ist also kein Medusa-Eingriff nötig**, und wenn Backend später eins anlegt, greift es automatisch.
- Die Länge reist als Line-Item-Metadatum mit, damit Sabine auf der Bestellung sieht, welche der beiden zu nähen ist.

Live gegen `api.bilulu.de` geprüft (`apps/e2e/scripts/bil2499-cart-check.mjs`, treibt das echte Formular durch den Browser statt die Server-Action von Hand zu POSTen). Warenkorb-Zeile: **„Konfigurator-Hose (kurz)" · Länge: kurz · Bund: Marineblau · Hose: Stoff 14 · Bündchen: Senfgelb · Muster: 180° gedreht**. Beleg: `apps/e2e/reports/bil2499/local/cart-after-add.png`.

### Parität

- **`?rot=`** funktioniert (im Label-Beweis und in den Screenshots mit `rot=90`/`rot=180` mitgeprüft).
- **OG-Karte**: die PNGs sind angesehen, nicht nur der content-type — `apps/e2e/reports/bil2499/compose-*.png`. Der Compositor zieht die Schildchen-Ebene mit (`0F:1T` im `x-og-photo`-Trace heißt: Schildchen-Ebene aktiv).
- **Merken-Thumbnail**: zeigt Stoffdruck *und* Schildchen, 20 607 verschiedene Farben statt einer Fläche → `apps/e2e/reports/bil2499/local/merken-thumbnail.png`.
- **Save/Share/Mobile-Sheet** aus BIL-2454: unverändert übernommen, mobiles Verhalten deckungsgleich mit dem langen Hose-Konfigurator (Gegenprobe: `mobile-scrolled-control-lang.png`).
- **BIL-2497 (nahtlose Kacheln)**: automatisch abgedeckt — der neue Konfigurator nutzt dieselben `/stoffe/*.webp`, es gibt keine eigene Kachelmenge.

### Qualität

`next build` sauber (Route `/konfigurator/hose-kurz`, 3,95 kB). axe (wcag2a/2aa/21a/21aa) **0 Violations**, **0 Console-Errors**, auf 390×844 *und* 1440×900. Gebaut wurde mit `NEXT_DIST_DIR=.next-bil2499`, damit der Build nicht mit den `next dev`/`next start` der Nachbar-Runs um `.next/` streitet.

Gegenprobe zur Kantenqualität: das Basisbild hat an der Silhouette denselben Abfall wie die bereits abgenommene lange Hose (28 vs. 30 Stufen) — also Parität, keine Verschlechterung. Zusätzlich ist die Maskensumme entlang der Kontur auf 255 gezogen (3 976 px), weil dieses Quellbild *hoch*skaliert wird und die Kontur sonst ungetönt grau bliebe.

### Was offen ist

**Akzeptanzkriterien 1 und 5 (live) kann ich gerade nicht abschließen** — nicht wegen des Codes, sondern weil die Coolify-Deploy-Queue steht: ein Zombie-Deployment (`e1djx5bboxydvn2h6hcpv387`) steht seit 08:30Z auf `in_progress`, obwohl sein Build-Container um 08:31Z heruntergefahren wurde. Dahinter stauen sich inzwischen vier Deploys, auch die von Backend (BIL-2501/2502). Poller und PAT sind in Ordnung (der Poller hat meinen Push gesehen und um 08:50:02Z einen Deploy gepostet).

Ich habe **einen** manuellen Deploy-POST nach `infra/RUNBOOK.md` §Auto-Deploy Schritt 4 abgesetzt und dann gestoppt (Zwei-Strike-Regel) → Kind-Issue an DevOps, dieses Issue ist darauf geblockt. Sobald der Deploy durch ist, laufen `bil2499-shots.mjs https://bilulu.de` und `bil2499-cart-check.mjs https://bilulu.de` gegen live und ich hänge das Ergebnis hier an.

### Eine Entscheidung fürs Board

Beide Pumphosen-Konfiguratoren teilen sich heute dieselbe Basisvariante, die kurze Hose kostet im Warenkorb daher **39,00 €** wie die lange. Der Katalogartikel „Pumphose Dinos" liegt bei 28,90 €. Kurz braucht weniger Stoff — soll die kurze Variante günstiger sein? Falls ja, legt Backend ein eigenes Konfiguratorprodukt mit „kurz" im Titel an; der Resolver greift es dann ohne weitere Storefront-Änderung.
