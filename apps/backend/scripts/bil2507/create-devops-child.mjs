const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const RUN = process.env.PAPERCLIP_RUN_ID;
const PARENT = process.env.PAPERCLIP_TASK_ID; // BIL-2507
const COMPANY = process.env.PAPERCLIP_COMPANY_ID;
const PROJECT = "5e251e01-8c35-4243-9a64-ebccc2ffed74";
const DEVOPS_AGENT = "ddf5d4b8-fc66-4e53-aad1-79458a148066";

const description = `## Befund

Bei der Ursachensuche zu BIL-2507 (seltenes stilles \`variant_unavailable\`) habe ich den Auslöser **live im Moment des Auftretens gemessen**: **jedes Deploy nimmt den Shop für ~45 Sekunden vom Netz.** Das ist deutlich größer als der QA-Fund, der es sichtbar gemacht hat.

Messung während des Deploys von \`main@c294dce\` (Probe alle 1,5 s gegen \`https://bilulu.de\` **und** \`https://api.bilulu.de\`, Beleg: \`apps/backend/scripts/bil2507/watch-cutover.mjs\` + \`cutover-watch.txt\`):

| Zeit (UTC) | Beobachtung |
|---|---|
| 10:48:28 – 10:48:40 | Storefront-ETag **springt 7× hin und her** zwischen \`14lw83e03ag1kng\` und \`173sgbkdhxk1kng\` → Traefik verteilt gleichzeitig auf **alten und neuen** Storefront-Container |
| 10:49:05 – 10:49:49 | \`api.bilulu.de\` liefert durchgehend **502** — **44 Sekunden** am Stück |
| in diesem Fenster | **28 von 28** "In den Warenkorb"-Klicks scheitern (\`?error=cart_unavailable\`) |

Es gab heute bereits **6 Deploys** (08:50, 08:55, 09:05, 09:15, 09:20, 09:30 UTC, laut \`/home/deploy/binchen-autodeploy.log\`). Jedes davon ist ein solches Fenster. QAs Testlauf für BIL-2506 lag genau zwischen zwei dieser Deploys — damit ist der "~7%, heilt sich beim Retry"-Fund vollständig erklärt, ohne dass Medusa selbst defekt wäre (im Normalbetrieb: 124/124 × 200 direkt, 160/160 über die Live-Server-Action).

### Warum QA \`variant_unavailable\` sah, ich aber \`cart_unavailable\`

Beides ist dasselbe Ereignis. In \`addConfigured*ToCartAction\` läuft der Produkt-Read (Next Data Cache, \`revalidate: 60\`) **vor** dem Cart-Create (\`cache: "no-store"\`, immer Netz). Ist der Produkt-Read gerade gecacht, überlebt er den Ausfall und erst der Cart-Create fällt → \`cart_unavailable\`. Ist der Cache-Eintrag zufällig gerade abgelaufen, kippt schon der Produkt-Read → \`variant_unavailable\`. Genau dieses Zusammentreffen macht den Fund so selten und so schwer reproduzierbar.

## Auftrag (DevOps)

Cutover gesundheitsgeprüft machen, damit ein Deploy kein Bestellfenster mehr kostet:

1. **Backend zuerst:** Der 502-Block kommt von \`k3apwpfen4qlb1hc1jdnli6f\` (Medusa, Port 9000). Der Container hat aktuell offenbar **keinen Healthcheck** (\`docker ps\` zeigt bei Storefront \`(healthy)\`, bei Medusa nur \`Up\`). Ohne Healthcheck schaltet Traefik sofort auf den neuen Container um — auch wenn Medusa noch bootet.
2. **Rolling update statt stop-then-start**, damit der alte Container erst aus dem Load-Balancer fliegt, wenn der neue gesund ist.
3. Das ETag-Flattern beim Storefront (10:48:28–40) zeigt, dass dort zwar überlappt wird, aber ohne saubere Draining-Phase — bitte mitprüfen.

Falls Coolify hier nichts Brauchbares anbietet: auch eine Wartungs-/Retry-Seite für das Fenster wäre besser als 502, aber die gesundheitsgeprüfte Umschaltung ist die richtige Lösung.

## Was Backend dazu schon getan hat (nicht ausreichend, absichtlich)

\`main@c294dce\`: die Konfigurator-Resolver wiederholen transiente Store-API-Fehler jetzt 3× mit Backoff (~1,5 s Budget). Das fängt **kurze** Zucken ab, aber ein 44-Sekunden-Ausfall ist damit bewusst **nicht** abgedeckt — ein Retry-Budget, das 45 s überbrückt, würde den Kunden minutenlang auf einen hängenden Button starren lassen. Die eigentliche Lösung liegt im Deploy, nicht im Client.

Belege im Repo: \`apps/backend/scripts/bil2507/watch-cutover.mjs\`, \`cutover-watch.txt\`, \`probe-store-products.mjs\`, \`repro-cart-bounce.mjs\`.
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
    assigneeId: DEVOPS_AGENT,
    title: "Deploy-Cutover nimmt den Shop ~45s vom Netz (Medusa 502, 28/28 Warenkorb-Klicks scheitern) — Healthcheck/Rolling-Update fehlt",
    description,
    status: "todo",
    priority: "high",
  }),
});
const txt = await res.text();
console.log("create:", res.status, txt.slice(0, 400));
if (!res.ok) process.exit(3);
const issue = JSON.parse(txt);
console.log("NEW_ISSUE_ID=" + issue.id);
console.log("NEW_ISSUE_KEY=" + (issue.identifier || issue.key || issue.number || ""));
