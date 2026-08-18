const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const RUN = process.env.PAPERCLIP_RUN_ID;
const PARENT = process.env.PAPERCLIP_TASK_ID; // BIL-2516
const COMPANY = process.env.PAPERCLIP_COMPANY_ID;
const PROJECT = "5e251e01-8c35-4243-9a64-ebccc2ffed74";
const FRONTEND = "55d15751-05e6-4e51-9239-caa3e5223520";

const description = `## Nebenbefund aus dem Lighthouse-Lauf zu BIL-2516

Beim Abnahme-Lauf für BIL-2516 lief Lighthouse mobil auf \`/product/{id}\`. Ergebnis: **a11y 99**, und die fehlenden Punkte gehören *nicht* zu BIL-2516 — beide Verstöße stehen in Komponenten, die auf **jeder** Seite des Shops liegen. Deshalb hier statt dort.

\`@axe-core/playwright\` (wcag2a/wcag2aa/wcag21aa) meldet auf denselben Seiten **0 Violations** — die beiden Regeln unten laufen bei axe nur in anderen Rulesets bzw. als "needs review", darum sind sie bisher durch alle Abnahmen gerutscht.

### 1. Label in Name — Cookie-Banner (WCAG 2.5.3, Level A)

\`apps/storefront/src/components/cookie-consent/cookie-consent.tsx\`

\`\`\`tsx
<Button aria-label="Alle nicht notwendigen Cookies ablehnen">Alle ablehnen</Button>
<Button aria-label="Alle Cookies akzeptieren">Alle akzeptieren</Button>   // dito
\`\`\`

Der zugängliche Name enthält den sichtbaren Text **nicht als Anfang**. Wer per Sprachsteuerung „Klick Alle ablehnen" sagt, trifft den Button nicht — der Name beginnt mit „Alle nicht notwendigen…". Das ist Level **A**, nicht AA, also unterhalb unseres eigenen Ziels.

Fix: entweder das \`aria-label\` weglassen (der sichtbare Text ist eindeutig genug) oder so formulieren, dass der sichtbare Text vorne steht — z. B. \`aria-label="Alle ablehnen — nur technisch notwendige Cookies"\`.

Praktischer Beleg nebenbei: genau diese Diskrepanz hat im BIL-2516-Harness einen \`getByRole("button", { name: "Alle ablehnen" })\`-Lookup ins Leere laufen lassen. Wenn ein Testtreiber den Button nicht findet, findet ihn eine Sprachsteuerung auch nicht.

**Randnotiz für [QA & Legal](/BIL/agents/qa):** die Copy selbst ist unverändert korrekt, es geht rein um den zugänglichen Namen. Falls der Wortlaut des \`aria-label\` aus einem Rechts-Review stammt, bitte kurz sagen — dann drehe ich es andersherum statt es zu streichen.

### 2. heading-order — Footer

\`<h3 class="font-body text-sm font-semibold uppercase tracking-wider …">\` (Footer-Spaltenüberschriften „SHOP" / „RECHTLICHES") folgt auf \`h1\` ohne \`h2\` dazwischen. Betrifft jede Seite. Fix ist ein Ein-Zeilen-Wechsel auf \`h2\` mit unveränderten Klassen — die Optik hängt komplett an den Utility-Klassen, nicht am Tag.

### Warum nicht in BIL-2516 mitgefixt

Beide Änderungen fassen global sichtbare Komponenten an; ein Fehlerbanner-Ticket ist der falsche Ort, um Footer und Cookie-Banner jeder Seite mitzuändern. Aufwand insgesamt klein (< 1h inkl. Nachmessen).

### Definition of Done

- Lighthouse mobil auf \`/\`, \`/catalog\`, \`/product/{id}\`: a11y = 100.
- Screenshot 390x844 + 1440x900 von Footer und Cookie-Banner, unverändertes Aussehen belegt.
- \`next build\` sauber.

Beleg des Ausgangszustands: \`apps/e2e/reports/bil2516/lh-product-error.json\` (Audits \`label-content-name-mismatch\`, \`heading-order\`).
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
    title: "a11y: zwei WCAG-Verstöße außerhalb von BIL-2516 (Cookie-Banner Label in Name, Footer heading-order)",
    description,
    status: "todo",
    priority: "low",
    assigneeId: FRONTEND,
  }),
});
const txt = await res.text();
console.log("create:", res.status, txt.slice(0, 600));
if (!res.ok) process.exit(3);
const issue = JSON.parse(txt);
console.log("NEW_ISSUE_ID=" + issue.id);
console.log("NEW_ISSUE_KEY=" + (issue.identifier || issue.key || ""));
