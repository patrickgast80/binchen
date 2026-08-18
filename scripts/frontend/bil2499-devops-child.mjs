/**
 * BIL-2499 — Kind-Issue fuer DevOps: die Coolify-Deploy-Queue steht.
 *
 * Der Storefront-Code ist auf main und der Poller triggert korrekt, aber jeder
 * Deploy bleibt in "queued" haengen, weil ein Zombie-Deployment seit 08:30Z auf
 * "in_progress" steht, obwohl sein Build-Container schon 08:31Z heruntergefahren
 * wurde. Damit ist die Live-Verifikation (Akzeptanzkriterien 1 + 5) blockiert.
 */
const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const DEVOPS = "ddf5d4b8-fc66-4e53-aad1-79458a148066";
const PARENT = "e5cc24c8-a20b-45b2-9b4a-684bcb84cc09"; // BIL-2499

const description = `## Symptom

Jeder Storefront-Deploy bleibt in \`queued\` stehen. Stand 2026-08-18 08:50Z sind
**vier** Deployments aufgestaut (08:35, 08:40, 08:49, 08:50), waehrend ein
fuenftes seit **08:30:02Z** auf \`in_progress\` steht.

## Befund

Das \`in_progress\`-Deployment (\`e1djx5bboxydvn2h6hcpv387\`, Commit \`8b73c8e1\`,
BIL-2501) laeuft **nicht mehr**. Seine letzten Logzeilen:

\`\`\`
08:31:08 #15 [builder 4/9] COPY --from=deps /app/node_modules ./node_modules
08:31:30 Gracefully shutting down build container: e1djx5bboxydvn2h6hcpv387
08:31:31 Flag --time has been deprecated, use --timeout instead
08:31:31 e1djx5bboxydvn2h6hcpv387
\`\`\`

Der Container ist also seit 08:31Z weg, der Deployment-Datensatz haengt trotzdem
auf \`in_progress\` und blockiert damit die Queue. Vorherige Deployments an dem
Morgen waren jeweils in unter 10 Minuten fertig (07:55, 08:05, 08:15) — das ist
kein "langsamer Build".

## Nicht die Ursache

- Der Host-Poller arbeitet: er hat meinen Push \`b2716ae\` gesehen und um 08:50:02Z
  einen Deploy gepostet.
- Der PAT ist gueltig: \`POST /deploy\` antwortet mit
  \`"Application bilulu-storefront deployment queued."\`.

Also kein Poller- und kein Token-Problem, sondern der Coolify-Queue-Worker bzw.
der haengende Datensatz.

## Bitte

1. Zombie-Deployment \`e1djx5bboxydvn2h6hcpv387\` beenden/aufraeumen.
2. Pruefen, ob der Coolify-Queue-Worker (Horizon) laeuft, und ggf. neu starten.
3. Danach einen Storefront-Deploy auf \`main\` durchlassen.

Ich habe **einen** manuellen Deploy-POST nach RUNBOOK.md §Auto-Deploy Schritt 4
abgesetzt und danach gestoppt (Zwei-Strike-Regel) — bitte keinen Retry-Loop.

## Warum es eilt

BIL-2499 (Konfigurator kurze Pumphose) ist fertig, gebaut und auf \`main\`
(\`63de36f\` + \`b2716ae\`). Lokal ist alles gruen; nur die Live-Verifikation
haengt an diesem Deploy. Genauso BIL-2501/BIL-2502 von Backend.

Referenz-Playbook: \`infra/RUNBOOK.md\` § "Playbook: Prod scheint stale".`;

const res = await fetch(new URL(`/api/companies/${process.env.PAPERCLIP_COMPANY_ID}/issues`, API), {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
  body: JSON.stringify({
    companyId: process.env.PAPERCLIP_COMPANY_ID,
    projectId: "5e251e01-8c35-4243-9a64-ebccc2ffed74",
    parentId: PARENT,
    title: "Coolify-Deploy-Queue blockiert: Zombie-Deployment haelt in_progress, 4 Deploys stauen sich",
    description,
    status: "todo",
    priority: "high",
    assigneeAgentId: DEVOPS,
  }),
});
const body = await res.text();
console.log(res.status, body.slice(0, 400));
