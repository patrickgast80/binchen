const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const PARENT = '3bf49614-930d-4fb0-8300-6cae34320351';
const PROJECT = '5e251e01-8c35-4243-9a64-ebccc2ffed74';

const description = `## Kontext

Bei der Abschlussverifikation von BIL-2490 kam heraus, dass \`seed-inventory.js\` auf **jedem Containerstart** \`stocked_quantity = 50\` auf alle Varianten geschrieben hat. Binchen verkauft handgenähte **Unikate** — jedes der 15 Relaunch-Produkte war damit **50× bestellbar**, und jede Korrektur im Medusa-Admin hielt nur bis zum nächsten Deploy.

Warum das vorher niemandem auffiel: die Store-API liefert \`inventory_quantity: 1\` und sah damit korrekt aus. Der Wert kam aber nicht aus dem Lagerbestand — die autoritative Abfrage über \`/admin/inventory-items\` zeigte \`stocked_quantity=50\`, \`available_quantity=50\`. **Für diesen Test bitte nicht der Store-API glauben.**

Gefixt in \`main@750aad9\` (Seed fasst existierende Levels nicht mehr an) + \`fix-oneoff-stock.mjs\` (15 Unikate zurück auf 1). Live verifiziert, Boot-Log meldet jetzt "17 left untouched".

## Auftrag

Ich habe den Bestand selbst korrigiert und gegen die Admin-API geprüft, aber die **Kauf-Semantik** sollte ich nicht selbst abnehmen. Bitte gegen live (bilulu.de) prüfen:

1. **Ein Unikat lässt sich einmal in den Warenkorb legen** und bis zur Zahlungsauswahl durchtragen (Sandbox, keine echte Zahlung).
2. **Menge 2 desselben Unikats wird abgelehnt** — weder über den Mengenwähler auf der PDP noch über ein manuelles Update der Line-Item-Menge im Warenkorb darf 2 durchgehen.
3. **Zwei parallele Warenkörbe** auf dasselbe Unikat: nur einer darf die Bestellung abschließen können. Das ist der eigentliche Risikofall bei Bestand 1 (Reservierung passiert erst bei der Payment-Intent-Bestätigung).
4. **Konfigurator-Produkte bleiben unbegrenzt bestellbar** — Pumphose + Body sind Made-to-Order und stehen bewusst auf 50. Menge 2 muss dort funktionieren.
5. Nach dem Test: \`node apps/backend/scripts/bil2490/verify-after-delete.mjs\` läuft grün (44/44) und die Unikate stehen weiterhin auf 1.

## Nützlich

- Autoritative Bestandsabfrage: \`node scripts/bil2490-stock-admin.mjs\` (Creds aus \`infra/.vault/admin-credentials.env\`)
- Reparaturskript falls ein Test den Bestand verbraucht: \`node apps/backend/scripts/bil2490/fix-oneoff-stock.mjs --apply\`

## Wenn Fall 3 fehlschlägt

Dann fehlt die Reservierung beim Payment-Intent und es ist ein **Backend-Bug — zurück an mich**, nicht an Frontend. Bitte mit Trace (beide Cart-IDs + Zeitstempel) melden.`;

const COMPANY = process.env.PAPERCLIP_COMPANY_ID;
const QA = '3faeae55-de86-4195-801d-e71aff443e60';
const GOAL = '8ef996d7-699e-400c-ae42-eef9e2bded75';

const r = await fetch(`${API}/api/companies/${COMPANY}/issues`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
  body: JSON.stringify({
    projectId: PROJECT,
    goalId: GOAL,
    parentId: PARENT,
    title: 'QA: Unikate mit Bestand 1 — Überverkauf-Schutz gegen live prüfen (nach BIL-2490 Bestands-Fix)',
    description,
    priority: 'high',
    status: 'todo',
    assigneeAgentId: QA,
  }),
});
const t = await r.text();
console.log(r.status, t.slice(0, 900));
