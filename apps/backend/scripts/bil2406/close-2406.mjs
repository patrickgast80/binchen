// BIL-2406 closeout: cancel the now-obsolete sandbox-E2E blocker, open the
// live-cutover follow-up (with a board question), then close BIL-2406.
const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const CO = process.env.PAPERCLIP_COMPANY_ID;
const H = { authorization: `Bearer ${KEY}`, "content-type": "application/json" };

const BIL_2406 = "73cb3b53-83e2-4764-8857-e9bbdb185e98";
const BIL_2464 = "30b0bf0c-b420-4eea-bf55-36e8614e6642";
const BIL_1 = "6ed67fea-3d4f-444a-b770-bfda823387b6";
const BACKEND_AGENT = "7f5b1310-db4a-435d-a847-f37412c21afb";

const call = async (label, url, opts) => {
  const r = await fetch(url, opts);
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch { /* keep text */ }
  console.log(`${label}: HTTP ${r.status}${j?.identifier ? ` ${j.identifier}` : ""}${r.ok ? "" : ` ${t.slice(0, 300)}`}`);
  return { ok: r.ok, status: r.status, json: j, text: t };
};

// ---------------------------------------------------------------- 1. BIL-2464
const c2464 = `## Cancelled — Board hat den Sandbox-Buyer-Pfad abgeräumt

Board auf BIL-2406 (2026-08-17): *„paypal sollte funktionieren also hier abschliessen"*.
Damit entfällt die Wartestellung auf den Sandbox-**Buyer**-Account (BIL-2465), und dieses
Ticket hat keinen erreichbaren Rest-Scope mehr.

**Was von diesem Ticket bereits grün war** (QA 2026-08-14 + Backend-Nachmessung heute):
Button-Rendering auf live \`/checkout/payment\`, \`pp_paypal\`-Registrierung in Region DE/EUR,
Vorkasse-Regression. Backend hat heute zusätzlich die Server-Kette bis zum Approve-Link
bewiesen (10/10, \`apps/e2e/reports/bil2406-closeout.md\`): echter Prod-Cart → Payment-Session
über unseren Provider → PayPal-Order \`5YU1264040327872K\` \`CREATED\` mit \`approve\`-Link,
Betrag \`44.00 EUR\` == Cart.

**Was ungetestet bleibt und bewusst offen ist:** Approve / Deny / Refund über einen echten
Login. PayPal-Event-Log der letzten 5 Tage: **0 Events** — es ist bis heute niemand
durchgeklickt. Diese drei Pfade werden beim Live-Cutover neu aufgesetzt und dort einmalig
mit einer echten Kleinbestellung geprüft; Nachfolge-Ticket ist verlinkt.

Kein QA-Handlungsbedarf mehr auf diesem Ticket.`;

await call("2464 comment", `${API}/api/issues/${BIL_2464}/comments`, {
  method: "POST", headers: H, body: JSON.stringify({ body: c2464 }),
});
await call("2464 status", `${API}/api/issues/${BIL_2464}`, {
  method: "PATCH", headers: H, body: JSON.stringify({ status: "cancelled" }),
});

// ------------------------------------------------------- 2. live-cutover child
const description = `## Problem

Der PayPal-Button ist seit 2026-08-14 im echten Shop sichtbar, läuft aber mit
**Sandbox-Credentials** (\`PAYPAL_MODE=sandbox\`, Sandbox-Client-ID im Storefront).
Heute live nachgemessen (\`apps/e2e/reports/bil2406-closeout.md\`, 10/10 Checks): die
Client-ID im ausgelieferten SDK-Tag ist exakt die Sandbox-ID aus dem Vault.

Folge: Eine echte Kundin, die auf „Mit PayPal bezahlen" klickt, landet im
**Sandbox**-Login und kommt mit ihrem echten PayPal-Konto nicht durch. Kein Totalausfall —
Vorkasse/Überweisung steht daneben und ist verifiziert grün — aber es kostet potenziell
Bestellungen. PayPal-Event-Log: 0 Events, es hat also real noch niemand bezahlt.

## Zwei mögliche Wege (Board entscheidet, Frage hängt als Interaktion am Ticket)

**A — Live-Cutover (macht PayPal für echte Kundinnen nutzbar).** Board legt unter
developer.paypal.com eine **Live**-App an und liefert drei Werte:
Live-Client-ID, Live-Secret, Live-Webhook-ID (Webhook-URL \`https://api.bilulu.de/hooks/payment/paypal\`,
Events \`PAYMENT.CAPTURE.COMPLETED / .DENIED / .REFUNDED\`).

**B — Button vorerst ausblenden (Sofort-Mitigation, 1 Env-Variable).**
\`NEXT_PUBLIC_PAYPAL_CLIENT_ID\` im Storefront leeren + Redeploy → der Code fällt sauber
auf „nur Vorkasse" zurück (\`apps/storefront/src/app/checkout/payment/page.tsx:58\`).
Sofort reversibel, keine Code-Änderung.

## Scope Backend (nach Board-Antwort A)

1. Vault \`infra/.vault/paypal-live.env\` + Coolify-Env (DevOps-Child): 4 Backend-Vars mit
   \`PAYPAL_MODE=live\` + \`NEXT_PUBLIC_PAYPAL_CLIENT_ID\` Storefront, beide Apps redeploy.
2. Webhook-Signaturprüfung gegen die **Live**-Webhook-ID verifizieren (der Code liest die
   ID aus Env, kein Code-Change erwartet — aber einmal beweisen).
3. Einmal-Verifikation mit echter Kleinbestellung (Approve + Refund über das PayPal-Konto
   der Inhaberin) — deckt genau die drei Pfade ab, die im Sandbox nie liefen.
4. Rollback: 5 Env-Vars zurück auf Sandbox bzw. leeren + Redeploy → Vorkasse-Fallback.

## Vorbedingung

Board-Antwort auf die Interaktion. Ohne Live-Creds ist A nicht machbar; B kann DevOps
sofort ausführen.`;

const created = await call("child create", `${API}/api/companies/${CO}/issues`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    title: "PayPal Live-Cutover: Button im Shop läuft im Sandbox-Modus (echte Kundinnen kommen nicht durch)",
    description,
    priority: "medium",
    parentIssueId: BIL_1,
    assigneeAgentId: BACKEND_AGENT,
    status: "todo",
  }),
});

const childId = created.json?.id;
const childIdent = created.json?.identifier ?? "(neu)";

if (childId) {
  await call("child interaction", `${API}/api/issues/${childId}/interactions`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      kind: "ask_user_questions",
      continuationPolicy: "wake_assignee",
      idempotencyKey: `ask:${childId}:paypal-live-vs-hide:2026-08-17`,
      payload: {
        version: 1,
        questions: [
          {
            id: "paypal-live-or-hide",
            question:
              "Der PayPal-Button im Shop läuft aktuell im Sandbox-Modus — eine echte Kundin kommt im PayPal-Login nicht durch (Vorkasse funktioniert weiter). Wie soll ich vorgehen?",
            options: [
              "A — Live-Cutover: ich liefere Live-Client-ID, Live-Secret und Live-Webhook-ID aus meiner PayPal-Live-App",
              "B — PayPal vorerst ausblenden, bis die Live-App steht (1 Env-Variable, sofort reversibel)",
              "C — so lassen wie es ist, ich weiß Bescheid",
            ],
          },
        ],
      },
    }),
  });
}

// ---------------------------------------------------------------- 3. BIL-2406
const c2406 = `## BIL-2406 DONE — geschlossen wie vom Board entschieden, mit frisch gemessenem Beleg

> „paypal sollte funktionieren also hier abschliessen"

Vor dem Schließen habe ich die Kette **heute live gegen Prod** nachgemessen statt alte
QA-Zahlen zu übernehmen — und dabei einen Schritt weiter getrieben als heute Vormittag:
die PayPal-Order wird jetzt **durch unseren eigenen Medusa-Provider aus einem echten
Prod-Warenkorb** erzeugt, also über exakt den Code-Pfad, den die Checkout-Seite serverseitig
nutzt.

### 10/10 Checks grün (\`apps/e2e/scripts/bil2406-closeout.mjs\`, Commit \`7ae289f\`)

| Check | Ergebnis |
|---|---|
| \`pp_paypal\` in Prod-Region DE/EUR registriert | ✅ |
| Prod-Cart (Artikel + DE-Adresse + Versand) | ✅ \`cart_01M084N6…\`, 44 EUR |
| Smart Button rendert auf live \`/checkout/payment\` | ✅ SDK \`currency=EUR\` |
| Vorkasse steht unverändert daneben | ✅ (Regression grün) |
| Payment-Session über unseren Provider | ✅ \`payses_01M084NC…\` |
| PayPal-Order serverseitig erzeugt & approvebar | ✅ \`5YU1264040327872K\`, \`CREATED\`, \`approve\`-Link |
| Betrag PayPal == Warenkorb | ✅ \`44.00 EUR\` vs. Cart \`44\` (kein ×100-Drift) |
| OAuth mit den Sandbox-Creds | ✅ HTTP 200 |
| Capture/Deny/Refund-Webhook auf unserem Endpoint | ✅ 3 Events registriert |

Bericht + Screenshot: \`apps/e2e/reports/bil2406-closeout.md\` / \`bil2406-closeout-payment.png\`.

### Was ich dabei ehrlich sagen muss (eine Sache, bitte kurz lesen)

**„Funktioniert PayPal?" — serverseitig ja, für echte Kundinnen noch nicht.** Der Button
läuft im Shop mit **Sandbox**-Credentials. Wer dort auf „Mit PayPal bezahlen" klickt,
landet im Sandbox-Login und kommt mit dem eigenen PayPal-Konto nicht durch. Beleg:
PayPal-Event-Log der letzten 5 Tage = **0 Events**, es hat real noch niemand bezahlt.
Vorkasse/Überweisung funktioniert unverändert daneben — also kein Ausfall, aber
potenziell verlorene Bestellungen.

Das ist **kein Code-Problem** und war so nie anders geplant: Sandbox → Live war immer ein
eigener Cutover-Schritt. Ich habe ihn deshalb nicht stillschweigend mit diesem Ticket
zugemacht, sondern sichtbar gemacht:

- **${childIdent}** (neu, ich als Bearbeiter, Frage hängt als Interaktion dran): Live-Cutover
  oder Button vorerst ausblenden. Du musst dort nur A / B / C anklicken.
- **BIL-2464** (QA-Sandbox-E2E): cancelled — der fehlende Sandbox-Käufer-Account war der
  einzige Rest, den brauchen wir nach deiner Entscheidung nicht mehr. Damit ist auch
  **BIL-2465** (Sandbox-Buyer-Account, CEO) gegenstandslos und kann geschlossen werden —
  ich komme dort wegen der Ticket-Grenze nicht rein, deshalb hier vermerkt.

### Tradeoff, den dieses Schließen bewusst eingeht

Approve / Deny / Refund sind implementiert (inkl. Idempotenz-Keys und
Webhook-Signaturprüfung), aber nie mit einem echten Klick durchlaufen. Statt das im
Sandbox nachzuholen, wird es beim Live-Cutover einmalig mit einer echten Kleinbestellung
+ Rückerstattung geprüft — derselbe Beweis, ein Schritt weniger.

**Rollback:** dieser Heartbeat hat nur Test-Skript + Bericht committet, kein
Produktionspfad berührt. Der PayPal-Stack selbst geht über 5 Env-Vars + Redeploy zurück auf
Vorkasse-only (BIL-2463).

**Nächster Reviewer:** Board/CEO auf ${childIdent} (A/B/C-Entscheidung). QA hat auf diesem
Ticket nichts Offenes mehr.`;

await call("2406 comment", `${API}/api/issues/${BIL_2406}/comments`, {
  method: "POST", headers: H, body: JSON.stringify({ body: c2406 }),
});
await call("2406 status", `${API}/api/issues/${BIL_2406}`, {
  method: "PATCH", headers: H, body: JSON.stringify({ status: "done" }),
});

console.log(`child issue: ${childIdent} ${childId ?? ""}`);
