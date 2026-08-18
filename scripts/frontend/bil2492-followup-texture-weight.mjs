/**
 * BIL-2492 follow-up: the fabric textures are the reason a konfigurator page
 * with a print selected scores ~82 instead of ~96 on Lighthouse mobile.
 * Filed as a child of BIL-2492 so the perf finding does not die in a comment.
 */
const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const PARENT = "7753e63a-8c55-4b30-a6cd-39a4d00a9110"; // BIL-2492

const description = `## Kontext

Gefunden beim Verifizieren von BIL-2492 (Muster-Rotation). Lighthouse mobile
auf einem lokalen Production-Build, gleicher Build, nur andere Auswahl:

| Seite | Performance | LCP |
| --- | --- | --- |
| \`/konfigurator/hose\` (Uni-Farbe, Default) | **96** | 2.6 s |
| \`/konfigurator/hose?hose=stoff-14\` (Stoffdruck) | **82** | 4.7 s |
| \`/konfigurator/hose?hose=stoff-14&rot=90\` (gedreht) | **82** | 4.7 s |

Die Rotation selbst kostet **nichts** — gedreht und ungedreht messen identisch
(82/82, zweiter Lauf 80/82 = Messrauschen). Der Einbruch kommt allein davon,
dass ueberhaupt ein Stoffdruck gewaehlt ist.

## Ursache

\`apps/storefront/public/stoffe/*.webp\` sind 1024x1024 und ~444 kB pro Stoff
(\`stoff-14.webp\` = 444.194 Bytes), zusammen ~11 MB fuer 70 Dateien. Die Kachel
wird in der Vorschau auf 42 % der Fotobreite gerendert, also je nach Viewport
etwa 160–380 CSS-Pixel — wir laden also ein Vielfaches der tatsaechlich
gebrauchten Aufloesung, und zwar auf dem kritischen Pfad, weil die Kachel
Teil des LCP-Elements ist.

Die Swatch-Chips in der Palette laden dieselbe Datei nochmal als 44px-Kreis.

## Auftrag

1. Kachel-Groesse gegen die real gerenderte Groesse pruefen: reicht 512x512
   (oder 384) fuer die Vorschau, ohne dass der Druck matschig wird? Gegenprobe
   bei 1440px Desktop, nicht nur mobil.
2. Separate, kleine Chip-Variante (z. B. 96x96) fuer die Palette, damit 40+
   Swatches nicht 40x 444 kB ziehen.
3. WebP-Qualitaet neu abwaegen — die Dateien stammen aus
   \`scripts/bil2455-build-fabric-swatches.mjs\`, das Skript neu fahren statt
   die Assets von Hand anzufassen.
4. \`fabrics.generated.ts\` entsprechend erweitern (Vorschau-Quelle vs.
   Chip-Quelle), \`ZoneOverlay\` und \`swatchChipStyle\` anpassen.

## Definition of Done

Lighthouse mobile auf \`/konfigurator/hose?hose=stoff-14\` >= 90, Druck bei
1440px Desktop optisch unveraendert (Vorher/Nachher-Screenshots), OG-Karte und
Merken-Thumbnail weiterhin korrekt (die rendern die Kachel serverseitig bzw.
per Canvas).

## Hinweis

Rein additiv zu BIL-2492 — die Rotation bleibt wie sie ist, hier geht es nur
um das Gewicht der Kacheln.`;

const body = {
  title: "Konfigurator: Stoff-Kacheln sind zu schwer (Lighthouse mobile 82 statt 96)",
  description,
  parentId: PARENT,
  projectId: "5e251e01-8c35-4243-9a64-ebccc2ffed74",
  goalId: "8ef996d7-699e-400c-ae42-eef9e2bded75",
  priority: "medium",
  status: "todo",
  assigneeAgentId: process.env.PAPERCLIP_AGENT_ID,
};

const res = await fetch(`${API}/api/companies/${process.env.PAPERCLIP_COMPANY_ID}/issues`, {
  method: "POST",
  headers: { "content-type": "application/json", Authorization: `Bearer ${KEY}` },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log(res.status, text.slice(0, 600));
