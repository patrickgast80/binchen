const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const ISSUE_ID = "bf583f0d-8c87-4e2e-bfc1-ecb67ec5f140";
const H = { "content-type": "application/json", authorization: `Bearer ${KEY}` };

// Hard limit: the API caps payload.prompt at 1000 characters. The full report
// is the ticket comment; this is the decision, not the write-up.
const prompt = [
  "Der Proof steht auf dem Hose-Konfigurator: das Muster folgt jetzt den Falten,",
  "rollt um die Beine und reagiert auf Licht, statt als flache Kachel darüberzuliegen.",
  "",
  "Bilder im Repo (dieser Build hat keinen Attachment-Endpunkt):",
  "· apps/storefront/reports/bil2522/hose-stoff-20-petrol-rot90.png — Streifenstoff,",
  "  VORHER | NACHHER | echtes Produktfoto nebeneinander. Am deutlichsten.",
  "· apps/storefront/reports/bil2522/live/ — echte Browser-Shots, Desktop + 390px.",
  "",
  "FREIGEBEN: ich rolle auf hose-kurz, muetze, turban, dreieckstuch aus, merge nach",
  "main und verifiziere live (Lighthouse, OG-Karte, Merken-Thumbnail, add-to-cart).",
  "",
  "NACHJUSTIEREN: bitte kurz sagen was — Faltentiefe, Wölbung an den Beinen, oder wie",
  "stark die Farbe im Schatten ausbleicht. Jetzt eine Änderung statt fünf.",
  "",
  '(Die leere Bestätigung "x" darüber ist ein Fehlgriff von mir und lässt sich nicht',
  "mehr zurücknehmen — bitte ignorieren.)",
].join("\n");
if (prompt.length > 1000) throw new Error(`prompt is ${prompt.length} chars, cap is 1000`);

const res = await fetch(`${API}/api/issues/${ISSUE_ID}/interactions`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    kind: "request_confirmation",
    idempotencyKey: `confirmation:${ISSUE_ID}:relief-look:8f7fc25`,
    continuationPolicy: "wake_assignee",
    title: "Relief-Stoff Hose: Look freigeben?",
    summary: "Proof auf einem Konfigurator fertig; Freigabe entscheidet über Rollout auf die restlichen vier.",
    payload: { version: 1, prompt, allowDeclineReason: true, supersedeOnUserComment: true },
  }),
});
console.log("interaction", res.status, (await res.text()).slice(0, 500));

const patch = await fetch(`${API}/api/issues/${ISSUE_ID}`, {
  method: "PATCH",
  headers: H,
  body: JSON.stringify({ status: "in_review" }),
});
console.log("patch", patch.status, (await patch.text()).slice(0, 300));
