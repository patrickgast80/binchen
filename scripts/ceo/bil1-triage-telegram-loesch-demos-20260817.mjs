// BIL-1 2026-08-17 (~19:34Z Wake): Patrick per Telegram: "Lösch diese Produkte" + Screenshot (msg 18).
// Screenshot entziffert = die 6 Demo-Artikel mit kaputten Grau-Bildern. Board-Order zieht die
// bereits freigegebene Demo-Löschung VOR (nicht mehr hinter Relaunch-Live-Verifikation warten).
// Ablauf: GET BIL-1 (Blocker) -> GET BIL-2490 (Status) -> Kommentar an BIL-2490 (@Backend)
//         -> Ack-Kommentar auf BIL-1 -> nackter Status-PATCH blocked (Wake-Echo-Regel).
const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const RUN = process.env.PAPERCLIP_RUN_ID;
const BIL1 = process.env.PAPERCLIP_TASK_ID;

const HEADERS = {
  'Authorization': `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  'X-Paperclip-Run-Id': RUN,
};

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  console.log(`${method} ${path} -> ${res.status}`);
  if (!res.ok) { console.error(text.slice(0, 500)); return null; }
  try { return JSON.parse(text); } catch { return {}; }
}

const issue = await call('GET', `/api/issues/${BIL1}`);
if (!issue) process.exit(1);
const blockers = (issue.blockedByIssueIds ?? issue.blockedBy ?? []).map((b) => (typeof b === 'string' ? b : b.id));
console.log('BIL-1 blockers:', JSON.stringify(blockers));
const bil2490Id = blockers[0];
if (!bil2490Id) { console.error('kein Blocker gefunden'); process.exit(1); }

const child = await call('GET', `/api/issues/${bil2490Id}`);
if (child) {
  console.log('child:', child.key ?? child.id, '| status:', child.status, '| assignee:', child.assigneeId ?? JSON.stringify(child.assignee ?? null));
  console.log('child blockers:', JSON.stringify((child.blockedByIssueIds ?? []).map((b) => (typeof b === 'string' ? b : b.id))));
}

const childBody = `**Board-Order per Telegram (Patrick, 17.08. 19:34Z): die 6 Demo-Artikel JETZT löschen — Vorziehung der schon erteilten Freigabe.**

[@Backend](agent://7f5b1310-db4a-435d-a847-f37412c21afb) — Patrick hat einen Katalog-Screenshot geschickt („Lösch diese Produkte", Attachment \`82fa1093-63e7-4267-9957-f5df73850659\`, lokal \`infra/.vault/telegram-media/telegram-6032147460-18.jpg\`). Entziffert zeigt er genau die 6 Demo-/Seed-Artikel, die aktuell mit kaputten grauen Platzhalter-Bildern im Live-Katalog stehen:

1. Body — 14,90 €
2. Bio Baumwolle Strampler Waldtiere — 38,00 €
3. Jersey Bodysuit Set – Regenbogen (5er-Pack) — 42,00 €
4. Musselinhose – Salbeigrün — 29,00 €
5. Wendejacke – Punkte & Streifen — 55,00 €
6. Spielanzug mit Füßen – Sternchen — 40,00 €

**Was sich dadurch ändert:** Meine bisherige Reihenfolge-Regel („Demos erst nach Live-Verifikation der neuen Produkte löschen") ist vom Board überholt — die Demos dürfen **sofort** raus, unabhängig vom Relaunch-Fortschritt. Sie zeigen Besuchern gerade kaputte Bilder.

**Unverändert gilt:**
- **„Bilulu-Pumphose (Konfigurator)" (39 €) NIE löschen** — daran hängen die Konfiguratoren. Sie ist nicht im Screenshot.
- Die **13 echten Alt-Artikel (12 Pumphosen + 1 Turban) bleiben online**, bis Sabines A/B-Antwort (Telegram msg 17) oder eine Board-Bestätigung auf BIL-1 vorliegt — der Screenshot umfasst sie nicht (die unterste, angeschnittene Karte mit echtem Foto gehört nicht dazu).
- Vor dem Löschen: frischer DevOps-Dump existiert (nightly pg_dump läuft) — kein zusätzlicher Blocker.

**Konkrete nächste Aktion:** die 6 oben gelisteten Produkte in Medusa löschen, Katalog + Startseite + /fruehchen live gegenprüfen (keine 404-Karten/Leichen), Vollzug hier kommentieren. Der übrige BIL-2490-Scope (Bilder ersetzen, Sets, Mütze neu) läuft unverändert weiter.`;

const c1 = await call('POST', `/api/issues/${bil2490Id}/comments`, { body: childBody });
if (!c1) process.exit(1);

const ackBody = `**CEO-Triage (17.08., 19:34Z-Wake): Telegram-Order „Lösch diese Produkte" entziffert und an Backend (BIL-2490) weitergegeben.**

Patricks Screenshot (Attachment \`82fa1093-63e7-4267-9957-f5df73850659\`) zeigt die **6 Demo-/Seed-Artikel** mit kaputten grauen Platzhalter-Bildern (Body 14,90 € · Strampler Waldtiere 38 € · Bodysuit-Set Regenbogen 42 € · Musselinhose Salbeigrün 29 € · Wendejacke Punkte & Streifen 55 € · Spielanzug Sternchen 40 €).

Konsequenz: Die bereits freigegebene Demo-Löschung ist damit **vorgezogen** — Backend löscht die 6 sofort, statt auf die Live-Verifikation des Relaunch-Uploads zu warten. Der Konfigurator-Artikel bleibt unangetastet; die **13 echten Alt-Artikel sind von diesem Screenshot NICHT erfasst** und warten weiter auf Sabines A/B-Antwort (Telegram msg 17) bzw. eine Board-Ansage hier.

BIL-1 bleibt \`blocked\` auf BIL-2490 (Backend, nächster Schritt dort: 6 Demos löschen + Live-Check).`;

const c2 = await call('POST', `/api/issues/${BIL1}/comments`, { body: ackBody });
if (!c2) process.exit(1);

// Wake-Echo-Regel: eigener Kommentar darf BIL-1 nicht aufmachen — nackter PATCH zurück auf blocked.
await call('PATCH', `/api/issues/${BIL1}`, { status: 'blocked', blockedByIssueIds: blockers });
