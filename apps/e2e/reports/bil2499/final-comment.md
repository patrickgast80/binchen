## Live abgenommen — alle 5 Akzeptanzkriterien belegt

BIL-2503 hat die Coolify-Queue freigegeben, damit war die Live-Verifikation möglich. `/konfigurator/hose-kurz` ist auf bilulu.de erreichbar, Stand `main@e315b89`.

**Deploy-Beleg über Assets statt Button-Text** (Lehre aus BIL-2492): alle sechs Dateien unter `/konfigurator/hose-kurz-foto/` liefern live exakt die Bytegrößen aus dem Feature-Commit `63de36f` — `base` 24682, `label` 8974, `mask-bund` 7332, `mask-hose` 13330, `mask-buendchen` 6948, `highlight` 10858. Ein alter Build könnte diese sechs Zahlen nicht gleichzeitig treffen.

---

### 1. Route live, Stoff-/Bündchenwahl wie beim bestehenden Konfigurator — ✅

Bund, Hose und Bündchen einzeln wählbar, gleiche Palette und Bedienlogik wie der lange Konfigurator. Screenshots 390x844 und 1440x900 in `apps/e2e/reports/bil2499/live/`.

### 2. Schildchen in jeder Kombination unverändert — ✅ gemessen, nicht geschätzt

Bund-Zooms auf **zwei Stoffen und mehreren Uni-Farben**: `bund-zoom`-Serie bzw. `desktop-1440x900-*-bund.png` (Creme, Senfgelb/Stoff 14 mit `?rot=90`, Terrakotta-Default). Das Schildchen ist überall dasselbe Kraftpapier-Etikett.

Zusätzlich ein **Messbeleg auf dem ausgelieferten Server** — `apps/storefront/scripts/bil2499-live-label-proof.mjs`. Der bestehende lokale Proof ruft den Compositor im Prozess auf und kann damit nur den Quellbaum bezeugen; dieser hier vergleicht echte Renders von bilulu.de über 5 Kombinationen (Default, Creme, Marineblau, Stoff 14, Stoff 01 mit `?rot=90`).

Zwei Fallen stecken darin, beide sind mir beim Bauen selbst passiert und stehen jetzt im Skriptkopf:

- **Ein Kasten um das Schildchen enthält auch Bund**, und der *soll* sich verfärben. Die erste Fassung meldete dadurch ~9.000 abweichende Pixel, obwohl nichts kaputt war. Ein reiner „Crop + erwarte 0 Abweichung"-Test ist für diese Anforderung schlicht falsch konstruiert.
- **„Invariant" ist nicht „Schildchen":** der cremefarbene Kartenhintergrund ist ebenfalls in jedem Render identisch. Getrennt wird deshalb topologisch — der Hintergrund berührt den Fensterrand, das Schildchen kann das nicht, weil es ringsum von umfärbbarem Bund umschlossen ist.

Ergebnis: das Schildchen ist ein **massiver 36x37-Block, 1026 px, 0 Löcher im Inneren**, über alle 5 Kombinationen. Der Füllgrad 0,77 entspricht rechnerisch genau einem um ~8° gedrehten Quadrat (1/(cos+sin)² ≈ 0,78) — also wirklich das Etikett und kein zufälliger Farbtreffer. `label-tag-component.png` zeigt den isolierten Block.

Damit die Prüfung nicht bloß immer grün sagt, richtet `--selftest` dasselbe Instrument auf **blanken Bund ohne Schildchen** und verlangt ein FAIL. Das schlägt korrekt fehl („keine randfreie invariante Region"). Eine Prüfung, die nicht fehlschlagen kann, ist kein Beleg.

### 3. Add-to-cart legt die richtige Konfiguration in den Warenkorb — ✅

`bil2499-cart-check.mjs` gegen live, mit **absichtlich Nicht-Standardwerten** (`?bund=navy&hose=stoff-14&buendchen=mustard&rot=180`) — bei stillem Fallback stünde „Terrakotta · Petrol" in der Zeile. Live-Warenkorb zeigt: `Konfigurator-Hose (kurz)` · Länge kurz · Bund Marineblau · Hose Stoff 14 · Bündchen Senfgelb · Muster 180° gedreht. Kein fehlender Wert. Beleg: `live/cart-check.json`, `live/cart-after-add.png`.

### 4. `?rot=`, OG-Karte und Merken-Thumbnail zeigen den Stoffdruck — ✅ PNG angesehen

- **OG-Karte:** `live/og-*.png` — echte PNGs, angesehen statt nur Content-Type geprüft (WebP-Falle). Stoff 14 floral bzw. Stoff 01 mit sichtbar um 90° gedrehtem Muster plus Zeile „Muster: 90° gedreht". Schildchen auch hier drauf.
- **Merken-Thumbnail:** `bil2499-live-merken.mjs` dekodiert die gespeicherte Data-URL zurück nach PNG und zählt Farbvielfalt — **1957 unterschiedliche Farben**, also der echte Druck. Ein bloßer Existenz-Check hätte den BIL-2492-Bug (Thumbnail zeigte nur die Durchschnittsfarbe) anstandslos durchgewinkt. Beleg: `live/merken-thumbnail.png`.

### 5. Live-Verifikation nach Auto-Deploy — ✅

- **axe (wcag2a/aa, wcag21a/aa): 0 Violations**, **0 Console-Errors**, auf 390x844 und 1440x900.
- **Lighthouse Mobile 13.4.1 auf der Live-Route: Performance 95** — FCP 1,2 s, LCP 2,0 s, CLS 0, TBT 240 ms. Über der 90er-Latte.
- Zusätzlich eigene CWV-Messung auf gedrosseltem Mobilprofil **mit Kontrollroute**: hose-kurz LCP 1696 ms / CLS 0 gegen den unveränderten langen Konfigurator LCP 1368 ms. Die Kontrolle ist der Punkt — eine Einzelmessung sagt sonst nicht, ob die Route langsam ist oder die Leitung.

---

## Ein offener Punkt, der eine Entscheidung braucht — nicht meine

**Die Warenkorbzeile kostet 39,00 €, der Katalogartikel derselben kurzen Hose 28,90 €.**

Ursache: es gibt kein eigenes „kurz"-Konfiguratorprodukt in Medusa. Der Resolver bevorzugt ein solches, sobald es existiert, und fällt bis dahin bewusst auf die Basis der langen Pumphose zurück (39,00 €) — damit kein bestehendes Produkt umbenannt werden muss, was die Titel-Regex-Auflösung der anderen Konfiguratoren zerschossen hätte. Die Länge reist bereits als Line-Item-Metadatum mit, die Bestellung ist also eindeutig; nur der Preis stammt vom falschen Produkt.

Das kann ich nicht einseitig auflösen: „kurz soll günstiger sein" und „Maßanfertigung kostet mehr als Katalogware" sind beide plausibel. In jedem Fall ist der aktuelle Zustand erklärungsbedürftig, weil dieselbe kurze Hose konfiguriert teurer ist als fertig im Katalog.

→ **BIL-2505** angelegt (Kind dieses Tickets) mit Befund, Ursache und dem, was Board bzw. Backend jeweils entscheiden/tun müssten. Sobald ein eigenes Produkt existiert, greift der Resolver es ohne Frontend-Deploy; ich verifiziere gern nach.

## Übergabe

Funktional und visuell ist die Route aus meiner Sicht fertig. Für die E2E-Abnahme im Browser: [QA](/BIL/agents/qa) — URL `https://bilulu.de/konfigurator/hose-kurz`, Viewports 390x844 und 1440x900, Ablauf: Farben/Stoffe in allen drei Zonen wechseln, Bund auf zwei Stoffen heranzoomen (Schildchen muss unverändert bleiben), `?rot=90`/`?rot=180` prüfen, Merken + Reload, In-den-Warenkorb. **Nicht bis zur Bestellung durchlaufen**, solange der Preis in BIL-2505 offen ist.
