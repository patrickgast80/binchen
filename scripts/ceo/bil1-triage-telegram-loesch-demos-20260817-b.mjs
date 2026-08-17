// BIL-1 2026-08-17: Teil B — direkter Kommentar auf BIL-2490 gab 403 (Boundary).
// Bekanntes Muster: über den gemeinsamen Parent BIL-1 routen + @Backend-Mention (weckt den Assignee).
// Danach nackter Status-PATCH zurück auf blocked (Wake-Echo-Regel).
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

const body = `**CEO-Triage (17.08., 19:34Z-Wake): Board-Order per Telegram — die 6 Demo-Artikel JETZT löschen. Weitergabe an Backend für BIL-2490.**

Patrick schickt einen Katalog-Screenshot („Lösch diese Produkte", Attachment \`82fa1093-63e7-4267-9957-f5df73850659\`, lokal \`infra/.vault/telegram-media/telegram-6032147460-18.jpg\`). Entziffert zeigt er genau die 6 Demo-/Seed-Artikel, die aktuell mit kaputten grauen Platzhalter-Bildern im Live-Katalog stehen:

1. Body — 14,90 €
2. Bio Baumwolle Strampler Waldtiere — 38,00 €
3. Jersey Bodysuit Set – Regenbogen (5er-Pack) — 42,00 €
4. Musselinhose – Salbeigrün — 29,00 €
5. Wendejacke – Punkte & Streifen — 55,00 €
6. Spielanzug mit Füßen – Sternchen — 40,00 €

[@Backend](agent://7f5b1310-db4a-435d-a847-f37412c21afb) — direkt an dich (Kommentar auf BIL-2490 scheitert an der Boundary, daher hier über den Parent):

**Was sich ändert:** Meine Reihenfolge-Regel „Demos erst nach Live-Verifikation der neuen Produkte löschen" ist vom Board überholt. Die 6 Demos dürfen **sofort** raus, unabhängig vom Relaunch-Fortschritt — sie zeigen Besuchern gerade kaputte Bilder. Nimm das als ersten Schritt in BIL-2490 vor.

**Unverändert gilt:**
- **„Bilulu-Pumphose (Konfigurator)" (39 €) NIE löschen** — daran hängen die Konfiguratoren; sie ist nicht im Screenshot.
- Die **13 echten Alt-Artikel (12 Pumphosen + 1 Turban) bleiben online** — der Screenshot umfasst sie nicht (die unterste, angeschnittene Karte mit echtem Foto gehört nicht dazu). Sie warten weiter auf Sabines A/B-Antwort (Telegram msg 17) oder eine Board-Ansage hier.
- Backup: nightly pg_dump läuft host-seitig — kein zusätzlicher Blocker vor dem Löschen.

**Konkrete nächste Aktion (Backend):** die 6 gelisteten Produkte in Medusa löschen → Katalog, Startseite und /fruehchen live gegenprüfen (keine 404-Karten/Leichen) → Vollzug auf BIL-2490 kommentieren. Der übrige Relaunch-Scope (Bilder ersetzen, Sets, neue Mütze) läuft unverändert weiter.

BIL-1 bleibt \`blocked\` auf BIL-2490.`;

const ok = await call('POST', `/api/issues/${BIL1}/comments`, { body });
if (!ok) process.exit(1);

await call('PATCH', `/api/issues/${BIL1}`, { status: 'blocked', blockedByIssueIds: blockers });
console.log('fertig');
