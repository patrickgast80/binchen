## Doppelrahmen im Card-Wrapper entfernt — `main@e821ba4`

Befund bestätigt und umgesetzt. Ich habe zuerst die Live-Assets nachgemessen, bevor ich CSS angefasst habe: alle 11 Katalog-Thumbnails sind **1200x1200** und tragen das Studio-Grau **bis an die Canvas-Kante** (alle vier Ecken exakt `200/200/198`, Mat-Breite je nach Motiv 9,8 – 29,3 %). Damit war jedes zusätzliche `p-3`/`p-4`/`p-6` unter dem Bild per Definition ein zweiter Rahmen — Beleg-Script: `apps/storefront/scripts/bil2483-probe-thumbs.mjs`.

### Was geändert wurde (nur `className`, keine Logik)

| Surface | Datei | Änderung |
|---|---|---|
| Katalog-Karten | `apps/storefront/src/app/catalog/page.tsx` | Tile-BG → `bg-binchen-studio`, `p-3` weg |
| Startseite-Karten | `apps/storefront/src/app/page.tsx` | Tile-BG → `bg-binchen-studio`, `p-3` weg |
| PDP-Hero | `apps/storefront/src/app/product/[id]/page.tsx` | Tile-BG → `bg-binchen-studio`, `p-4 sm:p-6` weg |
| Warenkorb-Thumbnails | `apps/storefront/src/app/cart/page.tsx` | Tile-BG → `bg-binchen-studio`, `p-1` weg |
| Konfigurator-Hub-Kacheln | `apps/storefront/src/app/konfigurator/page.tsx` | BG `bg-binchen-cream` → `bg-binchen-studio`, **`p-6` bleibt** (Begründung unten) |

Der Token `binchen-studio` (`#C8C8C6`) existierte bereits in `tailwind.config.ts` und wird von den Live-Konfiguratoren (Hose/Mütze) als Preview-Bühne genutzt — ich habe also keinen neuen Token angelegt, sondern den vorhandenen katalogweit durchgezogen. Der Creme-Verlauf bleibt exakt wie von dir vorgeschlagen als **Fallback ohne Foto** stehen (`product.thumbnail ? studio : cream-gradient`), also ein bewusst anderer Zustand.

### Eine begründete Abweichung von deinem Vorschlag

Beim Konfigurator-Hub habe ich das Padding **nicht** entfernt. Die beiden Kachelbilder (`/konfigurator/hose-foto/base.webp` 900x1006, `muetze-foto/base.webp` 900x880) sind **transparente Freisteller mit Alpha 0 in allen Ecken** — sie haben also gar kein eingebackenes Passepartout. Ohne Padding würde das Kleidungsstück dort die Kachelkante berühren, was gegen die Studio-Look-Regel „kein Kleidungsstück berührt die Bildkante" verstößt. Dort ist das `p-6` also der einzige Rahmen, nicht der zweite. Ich habe das im Code kommentiert. Wenn du die Mat-Breite dort trotzdem an die 12 % der Fotos angleichen willst, sag Bescheid — das ist eine Zeile.

### Vorher / Nachher (angehängt)

- `01-vorher-katalog-karte-390x844.png` / `02-nachher-katalog-karte-390x844.png`
- `03-vorher-startseite-karte-1440x900.png` / `04-nachher-startseite-karte-1440x900.png`
- `05-vorher-katalog-grid-1440x900.png` / `06-nachher-katalog-grid-1440x900.png`
- Nachher-Belege für die übrigen Surfaces: `07-nachher-pdp-1440x900.png`, `08-nachher-warenkorb-390x844.png`, `09-nachher-konfigurator-hub-1440x900.png`

Am deutlichsten ist es auf `05` vs. `06`: die Karte „Mütze *Winter-Kinder* marineblau" zeigt vorher klar den warmen Creme-Ring um das graue Mat, nachher läuft die graue Fläche durchgehend bis an die Kartenkante.

### Ein Fund, der **dir** gehört (BIL-2462, nicht CSS)

Auf `02` und `06` sieht man jetzt unverstellt: bei einigen Motiven — am auffälligsten `Bilulu-Pumphose (Konfigurator)` und `Set Mütze + Loop-Schal "Boho-Regenbogen" creme` — steckt **im Bild selbst** noch ein hellerer Rechteck-Block (der originale weiße/helle Backdrop) innerhalb des grauen Mats. Das ist genau der 2-Tone-Effekt aus deinen Reshoot-Kriterien in `STUDIO-LOOK.md`, und er bleibt nach meinem Fix als einziger sichtbarer „Doppelrahmen" übrig. Das ist Bild-Pipeline, also außerhalb meines Scopes hier — ich flagge es nur, damit es nicht als CSS-Regression zurückkommt.

### Verifikation

- `next build`: kompiliert sauber, prerendert 24/24 Seiten. Der Build bricht lokal erst im Windows-`standalone`-Symlink-Schritt ab (`EPERM: symlink … sharp-wasm32`) — reine Windows-Einschränkung ohne Developer-Mode, im Linux-Container/Coolify unbetroffen. Kein Typ- oder Compile-Fehler.
- `next lint` auf allen fünf geänderten Dateien: `✔ No ESLint warnings or errors`.
- Screenshots real bei 390x844 und 1440x900 aufgenommen, nicht per Diff beurteilt (Katalog, Startseite, PDP, Warenkorb mit echter Position, Konfigurator-Hub).
- A11y: die Änderung berührt nur Tile-Hintergrund und Padding. Badges („ausverkauft", „Frühchengröße verfügbar") bringen ihren eigenen Hintergrund mit, der Placeholder-Text „Kein Bild" bleibt auf dem Creme-Fallback — es verschiebt sich also kein Kontrastpaar.

**Nachher-Screenshots stammen vom lokalen Dev-Server gegen die Live-Medusa-Daten**, weil der Coolify-Poller `main@e821ba4` beim Schreiben dieses Kommentars noch nicht ausgerollt hatte. Ich reiche den Live-Beleg von `https://bilulu.de/catalog` als Folgekommentar nach, sobald der Deploy durch ist.

@Designer — zur finalen Freigabe an dich, wie im Ticket gewünscht. An QA gebe ich erst nach deinem OK weiter.
