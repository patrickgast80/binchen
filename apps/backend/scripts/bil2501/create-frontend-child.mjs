// BIL-2501 -> Frontend child: /checkout/payment swallows the ?error= param.
const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const RUN = process.env.PAPERCLIP_RUN_ID;
const PARENT = process.env.PAPERCLIP_TASK_ID; // BIL-2501
const COMPANY = process.env.PAPERCLIP_COMPANY_ID;
const PROJECT = "5e251e01-8c35-4243-9a64-ebccc2ffed74";
const GOAL = "8ef996d7-699e-400c-ae42-eef9e2bded75";
const FRONTEND_AGENT = "55d15751-05e6-4e51-9239-caa3e5223520";

const description = `## Problem

\`apps/storefront/src/app/checkout/payment/page.tsx\` liest den \`?error=\`-Query-Param **nie** aus — die Datei enthält null Treffer für \`searchParams\` bzw. \`error\`.

Die Server-Action redirected aber in **drei** Fehlerfällen genau dorthin (\`apps/storefront/src/app/checkout/payment/actions.ts\`):

\`\`\`
:25  redirect("/checkout/payment?error=payment_collection_failed")
:30  redirect("/checkout/payment?error=payment_session_failed")
:34  redirect(\`/checkout/payment?error=\${encodeURIComponent(result.reason)}\`)
\`\`\`

Ergebnis aus Kundensicht: Klick auf "Bestellung verbindlich abschließen" → Seite lädt neu, **exakt dieselbe Seite, keinerlei Hinweis**. Keine Bestellung, keine Fehlermeldung, kein Hinweis was zu tun ist. Der Kunde hat keine Chance zu verstehen, dass etwas schiefging.

## Warum das jetzt ein eigenes Ticket ist

Der auslösende Backend-Bug (Shipping-Profil-Mismatch, 16/17 Produkte nicht bestellbar) ist in BIL-2501 gefixt und live verifiziert — Checkout geht wieder. **Aber:** dieser stumme Fehlerpfad war der Grund, warum der Ausfall so lange unbemerkt blieb. Jeder künftige \`complete\`-Fehler (Zahlungsabbruch, ausverkauftes Unikat im Parallel-Kauf, Timeout beim Provider) endet weiterhin in derselben stummen Sackgasse.

Besonders relevant für BIL-2500: wenn zwei Kunden gleichzeitig dasselbe Unikat kaufen, **muss** der Verlierer eine verständliche Meldung sehen ("Dieses Einzelstück wurde leider gerade verkauft") statt eines stummen Reloads.

## Auftrag

1. \`?error=\` in \`checkout/payment/page.tsx\` auslesen und sichtbar rendern.
2. Die Codes auf **deutsche, verständliche** Texte mappen — nicht den Rohcode zeigen:
   - \`payment_collection_failed\` / \`payment_session_failed\` → "Die Zahlung konnte nicht vorbereitet werden. Bitte versuche es erneut."
   - Bestands-/Unikat-Konflikt → "Dieses Einzelstück wurde leider gerade verkauft."
   - Fallback für unbekannte Codes → generische Meldung + Hinweis auf info@bilulu.de (nie eine rohe Medusa-Message an den Kunden).
3. Denselben Fehlerpfad für PayPal prüfen: \`apps/storefront/src/app/api/checkout/complete/route.ts\` teilt sich \`completeCart()\` — landet der Kunde dort ebenfalls stumm?

\`result.reason\` aus \`completeCart()\` ist die Quelle der Codes; bitte mit Backend abstimmen, falls ihr für den Unikat-Fall einen **eigenen, stabilen Code** braucht statt der durchgereichten Medusa-Message — das liefere ich gern nach (strukturiert \`code\`/\`message\`/\`requestId\`).

## Definition of Done

- Fehlermeldung ist auf \`/checkout/payment\` sichtbar (Screenshot als Beleg).
- Mindestens ein Fehlerfall live/lokal reproduziert und die Meldung gezeigt.
- Kein roher Fehlercode und keine englische Medusa-Message im Kundentext.
`;

const res = await fetch(`${API}/api/companies/${COMPANY}/issues`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${KEY}`, "X-Paperclip-Run-Id": RUN },
  body: JSON.stringify({
    projectId: PROJECT, goalId: GOAL, parentId: PARENT,
    title: "Checkout: /checkout/payment zeigt Fehler stumm — ?error=-Param wird nie ausgelesen",
    description, status: "todo", priority: "high",
    assigneeAgentId: FRONTEND_AGENT,
  }),
});
const txt = await res.text();
console.log("create:", res.status, txt.slice(0, 500));
if (!res.ok) process.exit(3);
const issue = JSON.parse(txt);
console.log("NEW_ISSUE_ID=" + issue.id);
console.log("NEW_ISSUE_KEY=" + (issue.identifier || issue.key || ""));
