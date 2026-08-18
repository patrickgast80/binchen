const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const RUN = process.env.PAPERCLIP_RUN_ID;
const PARENT = process.env.PAPERCLIP_TASK_ID; // BIL-2507
const COMPANY = process.env.PAPERCLIP_COMPANY_ID;
const PROJECT = "5e251e01-8c35-4243-9a64-ebccc2ffed74";
const FRONTEND_AGENT = "55d15751-05e6-4e51-9239-caa3e5223520";

const description = `## Auftrag (aus BIL-2507, Frontend-Hälfte)

QA hat in BIL-2507 zwei unabhängige Befunde gemeldet. Die **Backend-Hälfte ist erledigt und live** (\`main@c294dce\`): die Konfigurator-Resolver wiederholen transiente Store-API-Fehler jetzt bis zu 3× mit Backoff, statt beim ersten Zucken \`null\` zurückzugeben. Damit wird der Fehlschlag *seltener*, aber er kann nicht auf 0 gedrückt werden.

Offen bleibt der zweite Befund, und der gehört Frontend:

> Der Kunde klickt "In den Warenkorb", landet bei einem Fehlschlag wieder auf **genau derselben** Konfigurator-Seite — ganz ohne sichtbaren Hinweis. Aus Kundensicht: der Klick scheint nichts zu tun.

### Was zu tun ist

\`?error=\`-Query-Param in **allen 6** Konfigurator-\`page.tsx\` auslesen und sichtbar anzeigen (hose, hose-kurz, turban, muetze, body, dreieckstuch). Aktuell liest ihn keine einzige Seite aus.

### Fehlercode-Kontrakt (aus \`apps/storefront/src/app/cart/actions.ts\`, unverändert)

Jeder der 6 \`addConfigured*ToCartAction\` kann auf genau **drei** Codes zurückleiten:

| Code | Wann | Vorschlag Copy |
|---|---|---|
| \`variant_unavailable\` | Produkt/Variante nicht auflösbar (nach 3 Retries) | „Das hat gerade nicht geklappt — bitte versuch es gleich nochmal." |
| \`cart_unavailable\` | Warenkorb konnte nicht angelegt/geladen werden | dito |
| \`add_failed\` | Position konnte nicht in den Warenkorb gelegt werden | dito |

**Bewusste Empfehlung: für alle drei dieselbe freundliche Retry-Copy.** Nach 3 serverseitigen Retries ist jeder verbleibende Fehler aus Kundensicht dasselbe Ereignis („gerade nicht erreichbar"), und eine Unterscheidung würde nur Fachjargon in die Oberfläche tragen. Wichtig ist, dass überhaupt etwas **sichtbar** ist.

Kein neuer Kontrakt nötig — die Codes existieren bereits und ändern sich nicht. Falls du doch eine feinere Unterscheidung brauchst, kurz bei Backend melden, **bevor** du dich darauf festlegst.

### Warum kein Backend-Signal „transient vs. dauerhaft"

Bewusst nicht gebaut: eine exportierte „letzte Fehlerursache". Die naheliegende Umsetzung ist modul-globaler State, und Modul-Scope ist im Server über nebenläufige Requests geteilt — zwei gleichzeitig klickende Kundinnen würden sich gegenseitig die Fehlermeldung überschreiben. Details im Kommentar in \`apps/storefront/src/lib/medusa.ts\`.

### Hinweis zum Testen

Der Fehler tritt im Normalbetrieb praktisch nicht mehr auf (Backend-Messung: 124/124 direkt, 100/100 über die Live-Server-Action). Zum Ansehen der Fehlerdarstellung einfach die URL von Hand aufrufen:

\`\`\`
https://bilulu.de/konfigurator/hose-kurz?bund=sky&hose=stoff-05&buendchen=powder-pink&rot=90&error=variant_unavailable
\`\`\`

### Verwandt

Derselbe stille-Fehler-Pattern steht laut QA auch in \`checkout/payment/page.tsx\` offen (BIL-2500-Kind, Auftrag Punkt 3) — wenn du hier eh eine kleine Fehler-Banner-Komponente baust, lohnt es sich, sie dort wiederzuverwenden.
`;

const res = await fetch(`${API}/api/companies/${COMPANY}/issues`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${KEY}`,
    "X-Paperclip-Run-Id": RUN,
  },
  body: JSON.stringify({
    projectId: PROJECT,
    parentId: PARENT,
    assigneeId: FRONTEND_AGENT,
    title: "Konfigurator: ?error= sichtbar anzeigen (alle 6 Konfiguratoren) — stiller Fehlschlag bei 'In den Warenkorb'",
    description,
    status: "todo",
    priority: "medium",
  }),
});
const txt = await res.text();
console.log("create:", res.status, txt.slice(0, 600));
if (!res.ok) process.exit(3);
const issue = JSON.parse(txt);
console.log("NEW_ISSUE_ID=" + issue.id);
console.log("NEW_ISSUE_KEY=" + (issue.identifier || issue.key || issue.number || ""));
