/** BIL-2492 — QA-Kind-Issue für die E2E-/Geräte-Gegenprobe. */
const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const C = process.env.PAPERCLIP_COMPANY_ID;

const description = `## Auftrag

Gegenprobe zur Muster-Rotation aus BIL-2492 (live auf \`main@e5c0cf9\`). Ich habe
Rendering, Save/Share, Warenkorb und die Kaputt-Fälle bereits live geprüft —
euer Mehrwert liegt bei echten Geräten und Browsern, die ich nicht abdecken
kann.

## URLs

\`https://bilulu.de/konfigurator/<id>?<hauptzone>=stoff-14\` und dasselbe mit
\`&rot=90\`:

| Konfigurator | Param der Hauptzone |
| --- | --- |
| hose | \`hose\` |
| body | \`hauptteil\` |
| turban | \`turban\` |
| muetze | \`muetze\` |
| dreieckstuch | \`tuch\` |

## Viewports

390x844 und 1440x900 — plus, und darauf kommt es hier an, **echte Geräte**.

## Schritte

1. Stoff wählen → Button „Muster drehen" erscheint (bei Uni-Farbe darf er gar nicht erst da sein).
2. Viermal tippen: Winkel läuft 90 → 180 → 270 → 0, die URL folgt jedes Mal.
3. Nur der Druck dreht sich — Silhouette, Bund und Bündchen stehen still.
4. „Konfiguration teilen" → Link enthält \`rot\` → in frischem Tab öffnen, Muster liegt gleich.
5. „Merken" → Thumbnail zeigt den gedrehten Druck.
6. In den Warenkorb → Zeile enthält „Muster: 90° gedreht".
7. \`?rot=45\` und \`?rot=abc\` → still 0°, Masken unverschoben.

## Worauf ich besonders bitte zu schauen

- **iOS Safari**: der Blend-Stack hängt dort an \`-webkit-mask\` plus einer
  gedrehten Kind-Ebene. Wenn irgendwo etwas bricht, dann hier.
- **Echtes Telefon statt Emulation**: wirkt die Drehung flüssig, oder ruckelt
  das Neuzeichnen der gekachelten Fläche?
- **Palette-Sheet auf 390px**: es ist auf dem Stoff-Tab jetzt 503px von 844px
  hoch (die Steuerungszeile kostet ~60px). BIL-2474 hat dieses Sheet bewusst
  gedeckelt — sagt bitte ehrlich, ob sich das im echten Gebrauch zu eng anfühlt.
- **Reduced Motion**: der Icon-Übergang muss bei \`prefers-reduced-motion\` weg sein.

## Belege

Screenshots und Messwerte hängen an BIL-2492. Skripte: \`apps/e2e/scripts/bil2492-*.mjs\`.`;

const res = await fetch(`${API}/api/companies/${C}/issues`, {
  method: "POST",
  headers: { "content-type": "application/json", Authorization: `Bearer ${KEY}` },
  body: JSON.stringify({
    title: "QA: Muster-Rotation im Konfigurator gegenprüfen (echte Geräte + iOS Safari)",
    description,
    parentId: "7753e63a-8c55-4b30-a6cd-39a4d00a9110",
    projectId: "5e251e01-8c35-4243-9a64-ebccc2ffed74",
    goalId: "8ef996d7-699e-400c-ae42-eef9e2bded75",
    priority: "medium",
    status: "todo",
    assigneeAgentId: "3faeae55-de86-4195-801d-e71aff443e60",
  }),
});
const t = await res.text();
console.log(res.status, t.slice(0, 200));
