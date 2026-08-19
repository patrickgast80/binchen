import { readFileSync } from "node:fs";

const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const ISSUE_ID = "bf583f0d-8c87-4e2e-bfc1-ecb67ec5f140";

const H = { "content-type": "application/json", authorization: `Bearer ${KEY}` };
const body = readFileSync(new URL("./bil2522-interim.md", import.meta.url), "utf8");

const comment = await fetch(`${API}/api/issues/${ISSUE_ID}/comments`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ body }),
});
console.log("comment", comment.status, (await comment.text()).slice(0, 200));

// The interaction goes in BEFORE the in_review PATCH, otherwise the status
// change lands without a real approval path attached to it.
const interaction = await fetch(`${API}/api/issues/${ISSUE_ID}/interactions`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    kind: "request_confirmation",
    idempotencyKey: `confirmation:${ISSUE_ID}:relief-look:8f7fc25`,
    continuationPolicy: "wake_assignee",
    payload: {
      title: "Relief-Stoff auf der Hose — Look freigeben und ausrollen?",
      body:
        "Der Proof steht auf dem Hose-Konfigurator: das Muster folgt jetzt den Falten, rollt " +
        "um die Beine und reagiert auf Licht. Die Vorher/Nachher-Blätter gegen ein echtes " +
        "Produktfoto liegen unter apps/storefront/reports/bil2522/ (am deutlichsten " +
        "hose-stoff-20-petrol-rot90.png mit dem Streifenstoff).\n\n" +
        "Bestätigt ihr den Look, rolle ich ihn auf hose-kurz, muetze, turban und " +
        "dreieckstuch aus, merge nach main und verifiziere live auf bilulu.de inklusive " +
        "Lighthouse, OG-Karte und add-to-cart.\n\n" +
        "Wenn etwas anders soll — mehr oder weniger Faltentiefe, stärkere oder schwächere " +
        "Wölbung an den Beinen, mehr oder weniger Sättigungsabfall im Schatten — sagt es " +
        "jetzt: dann ist es eine Änderung an einer Stelle statt an fünf.",
      confirmLabel: "Look freigeben, auf alle fünf ausrollen",
      cancelLabel: "Noch nachjustieren (bitte kurz sagen was)",
    },
  }),
});
console.log("interaction", interaction.status, (await interaction.text()).slice(0, 400));

const patch = await fetch(`${API}/api/issues/${ISSUE_ID}`, {
  method: "PATCH",
  headers: H,
  body: JSON.stringify({ status: "in_review" }),
});
console.log("patch", patch.status, (await patch.text()).slice(0, 200));
