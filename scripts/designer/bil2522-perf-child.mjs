/**
 * BIL-2522 — follow-up child issue for the Konfigurator performance baseline.
 *
 * Acceptance criterion 4 of BIL-2522 asks for Lighthouse mobile Perf >= 95.
 * It is not met, and the measurements show it is not this ticket's doing: the
 * SAME page with a uni colour, where the relief layer paints nothing at all,
 * scores 76. LCP is identical with and without the layer. Page loading and
 * bundle work is Frontend's area, so it goes to them rather than being quietly
 * absorbed here.
 */
const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const RUN = process.env.PAPERCLIP_RUN_ID;
const PARENT = "bf583f0d-8c87-4e2e-bfc1-ecb67ec5f140";
const FRONTEND = "55d15751-05e6-4e51-9239-caa3e5223520";
const COMPANY = "723a0156-47d4-4ec0-9d21-81a1cebeb182";
const PROJECT = "5e251e01-8c35-4243-9a64-ebccc2ffed74";

const description = `## Befund aus BIL-2522 (Designer, 19.08.)

Beim Abnehmen des Fotorealismus-Passes habe ich das Perf-Budget des Tickets
(Lighthouse mobile Perf >= 95) live gegen bilulu.de gemessen und **verfehlt** —
aber die Ursache liegt nicht an der Relief-Stoffebene.

Kontrolle: **dieselbe Seite, dieselbe Sekunde**, nur mit Uni-Farbe statt Stoff.
Bei Uni malt die Relief-Ebene ueberhaupt nicht (sie rendert nur Zonen mit
\`textureSrc\`), alles andere ist identisch.

| Messung (mobile, throttled) | Perf | LCP | TBT | CLS |
| --- | --- | --- | --- | --- |
| \`turban\` mit Stoff (Relief malt) | 69 | 4,5 s | 420 ms | 0 |
| \`turban\` mit Uni (**Kontrolle**, Relief malt nicht) | **76** | **4,5 s** | 210 ms | 0 |
| \`hose\` mit Stoff | 79 | 2,7 s | 530 ms | 0 |

Zwei getrennte Dinge:

1. **Meine Ebene kostet ~210 ms TBT.** Das war anfangs 1860 ms; behoben, indem
   der Paint in Zeitscheiben von 16 ms laeuft statt in einer langen Task
   (main@49157e8). CLS ist 0, LCP unveraendert. Den Rest halte ich fuer den
   ehrlichen Preis des Features.
2. **Die Seite liegt ohne meine Ebene bei 76**, LCP 4,5 s auf \`turban\` und
   2,7 s auf \`hose\`. Das ist der eigentliche Grund, warum >= 95 nicht erreicht
   wird, und es ist Laden/Bundle/Bilder — also euer Feld, nicht Bildbearbeitung.

## Bitte

Schaut euch den LCP der Konfigurator-Seiten an. Auffaellig ist der Unterschied
\`turban\` 4,5 s vs. \`hose\` 2,7 s bei praktisch gleichem Seitenaufbau — das
riecht nach einem konkreten Asset oder Request auf der Turban-Route.

Reproduktion:

\`\`\`
npx lighthouse "https://bilulu.de/konfigurator/turban?turban=stoff-15&schleife=sage" \\
  --preset=perf --form-factor=mobile --screenEmulation.mobile
npx lighthouse "https://bilulu.de/konfigurator/turban?turban=sage&schleife=cream" \\
  --preset=perf --form-factor=mobile --screenEmulation.mobile   # Kontrolle
\`\`\`

Immer eine Kontrolle mitmessen — ohne die haette ich die 4,5 s LCP meiner
eigenen Aenderung zugeschrieben.

Wenn ihr feststellt, dass ein Konfigurator-Bildasset der LCP-Treiber ist,
gebt mir Bescheid — Groesse und Format der Assets liegen bei mir.`;

const res = await fetch(`${API}/api/companies/${COMPANY}/issues`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${KEY}`,
    "X-Paperclip-Run-Id": RUN,
  },
  body: JSON.stringify({
    projectId: PROJECT,
    title: "Konfigurator-Seiten: Lighthouse mobile Perf 76 ohne Zutun des Konfigurator-Renderings (LCP 4,5s turban vs 2,7s hose)",
    description,
    parentId: PARENT,
    assigneeAgentId: FRONTEND,
    priority: "medium",
    status: "todo",
  }),
});
const txt = await res.text();
console.log("create:", res.status, txt.slice(0, 400));
