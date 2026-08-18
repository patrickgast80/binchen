// CEO 2026-08-18: Alle drei BIL-1-Gates done (BIL-2507/2508/2509).
// (1) Folge-Tickets delegieren: BIL-2511 -> DevOps (high), BIL-2510 + BIL-2512 -> Frontend.
//     Kontext-Kommentar IMMER VOR dem Assign-PATCH (danach 403 Boundary).
// (2) Telegram-Entwarnung an Patrick (beide Foto-Punkte live, Versprechen aus msg 44 einloesen).
// (3) BIL-1: Kommentar + blockedByIssueIds=[2510,2511,2512] + status blocked in EINEM PATCH.
import { readFileSync } from 'node:fs';

const API = 'http://localhost:3100';
const KEY = process.env.PAPERCLIP_API_KEY;
const AUTH = { Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };
const FRONTEND = '55d15751-05e6-4e51-9239-caa3e5223520';
const DEVOPS = 'ddf5d4b8-fc66-4e53-aad1-79458a148066';

async function req(method, path, body) {
  const r = await fetch(`${API}${path}`, { method, headers: AUTH, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { raw: text.slice(0, 300) }; }
  console.log(`${method} ${path} -> ${r.status}${r.ok ? '' : ' ' + text.slice(0, 300)}`);
  return { ok: r.ok, status: r.status, json: j };
}

// --- Issue-UUIDs aufloesen
const ids = {};
for (const key of ['BIL-2510', 'BIL-2511', 'BIL-2512', 'BIL-1']) {
  const { ok, json } = await req('GET', `/api/issues/${key}`);
  if (!ok) { console.error(`FATAL: ${key} nicht aufloesbar`); process.exit(1); }
  ids[key] = json.id;
  console.log(`  ${key} = ${json.id} (status=${json.status}, assignee=${json.assigneeAgentId || '-'})`);
}

// --- 1a. BIL-2511 -> DevOps (high): Kontext-Kommentar, dann Assign
const c2511 = [
  '**CEO-Priorisierung: high, an @DevOps.** Alle drei BIL-1-Gates (2507/2508/2509) sind done — dieses Ticket ist jetzt der groesste offene Funktionalitaets-Defekt: Der 5-Minuten-Poller deployt JEDEN main-Push, und jedes Deploy nimmt den Shop ~45 s komplett vom Netz (502, alle Warenkorb-Klicks scheitern). Bei unserer Push-Frequenz ist das mehrmals taeglich ein toter Shop.',
  '',
  '**DoD:**',
  '- Medusa-Container bekommt einen echten Healthcheck; Coolify wechselt erst auf den neuen Container, wenn der healthy ist (rolling/zero-downtime), oder eine gleichwertige Loesung.',
  '- **Beweis WAEHREND eines echten Deploys messen, nicht im Steady-State**: durchlaufende curl-Schleife (Store-API + Storefront) ueber ein komplettes Deploy hinweg, 0 Fehlfenster. Eine Steady-State-Messung beweist hier nichts — der Fehler existiert nur im Cutover-Fenster.',
  '- Kein Eingriff, der den 5-min-Auto-Deploy-Poller (BIL-2459) deaktiviert.',
  '',
  'Kontext: Root-Cause-Analyse liegt in BIL-2507 (Backend hat den Cutover als Ursache des variant_unavailable-Flakes nachgewiesen). Zwei-Fehlschlag-Regel gilt: Deploy-Experiment 2x rot -> stoppen und hier melden, kein Push-Loop.',
].join('\n');

// --- 1b. BIL-2510 -> Frontend (medium): Kontext-Kommentar, dann Assign
const c2510 = [
  '**CEO an @Frontend, prio medium — bitte VOR BIL-2512 erledigen (kleiner, schuetzt Kunden sofort).**',
  '',
  'Backend-Haelfte (Retry + saubere Fehlercodes) ist live (BIL-2507, main@c294dce). Es fehlt die sichtbare Anzeige: `?error=variant_unavailable|cart_unavailable|add_failed` wird heute in den Konfiguratoren nirgends ausgewertet — der Kunde landet kommentarlos wieder auf der Seite.',
  '',
  '**DoD:**',
  '- Alle 6 Konfiguratoren (hose, hose-kurz, turban, muetze, dreieckstuch, body) zeigen bei `?error=` eine deutsche, verstaendliche Meldung mit "Nochmal versuchen"-Weg; Konfiguration des Kunden bleibt dabei erhalten.',
  '- Beleg: Screenshot je Konfigurator mit gesetztem `?error=` (Desktop + 390px mobil, kein Layout-Bruch; Achtung: bekanntes sticky-Header/Sheet-Overlap-Thema aus BIL-2509 nicht verschlimmern).',
  '- Kein neuer Fehlerkanal — exakt die drei bestehenden Codes aus dem Backend-Kontrakt.',
].join('\n');

// --- 1c. BIL-2512 -> Frontend (medium): Kontext-Kommentar, dann Assign
const c2512 = [
  '**CEO an @Frontend, prio medium — nach BIL-2510.** Patricks Realismus-Wunsch (BIL-2509) ist fuer Hose, kurze Hose und Muetze live; Turban + Dreieckstuch sind die andere Basis-Architektur (rohe Foto-Luminanz, Original-Druck Rosen/Zoo eingebrannt und multipliziert unter jeden gewaehlten Stoff).',
  '',
  '**Bekannte Grenzen aus den letzten Runden — bitte NICHT erneut in dieselben Fallen:**',
  '- NIE Blur, um Muster zu entfernen (BIL-2461-Regression).',
  '- Dichter Druck liefert bei JEDER Bandpass-Skala Motive statt Falten (Befund aus BIL-2509); ein automatisches Gate hat dort 3x versagt. Falten-Rueckgewinnung nur, wo sie per Auge belegt ist — sonst lieber neutraler, glaubwuerdiger Grund ohne durchscheinendes Fremdmotiv.',
  '- Unveraenderliche Bereiche (Schildchen etc.) muessen in der gemalten Ebene liegen, nicht als Overlay.',
  '',
  '**DoD:**',
  '- Kein Rosen-/Zoo-Originaldruck scheint mehr unter dem gewaehlten Stoff durch (alle Stoffe, alle `?rot=`-Winkel).',
  '- Vorher/Nachher-Belege beider Konfiguratoren (Zoom-Crops, nicht Voll-Screenshots), OG-Karte + Merken-Thumbnail nutzen denselben Druckpfad.',
  '- Lighthouse-Budget haelt (Referenz BIL-2509: Perf 98 / a11y 100).',
].join('\n');

let failures = 0;
for (const [key, body, assignee, prio] of [
  ['BIL-2511', c2511, DEVOPS, 'high'],
  ['BIL-2510', c2510, FRONTEND, 'medium'],
  ['BIL-2512', c2512, FRONTEND, 'medium'],
]) {
  const cm = await req('POST', `/api/issues/${ids[key]}/comments`, { body });
  if (!cm.ok) { failures++; console.error(`WARN: Kommentar auf ${key} fehlgeschlagen — Assign trotzdem versuchen`); }
  const pa = await req('PATCH', `/api/issues/${ids[key]}`, { assigneeAgentId: assignee, priority: prio });
  if (!pa.ok) { failures++; console.error(`FATAL-ish: Assign ${key} fehlgeschlagen`); }
}

// --- 2. Telegram-Entwarnung an Patrick
const envText = readFileSync(new URL('../../infra/.vault/telegram-bridge.env', import.meta.url), 'utf8');
const env = Object.fromEntries(envText.split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const tgText = [
  'Beide Punkte von deinen Fotos sind jetzt live auf bilulu.de ✅',
  '',
  '1. Mädchen-Stoff auf der Pumphose: Das Muster läuft jetzt nahtlos aus einem Stück — auch gedreht. Wir haben dabei alle Stoffe in allen Konfiguratoren systematisch durchgeprüft und die Prüfmethode selbst repariert (die alte Messung konnte genau diesen Fehler prinzipiell nicht sehen — deshalb kam die erste "erledigt"-Meldung zu früh).',
  '',
  '2. Echte Falten und Schatten: Pumphose, kurze Hose und Mütze zeigen jetzt die Falten/Schatten vom Originalfoto statt der ausgemalten Optik. Schau dir gern genau deine Konfiguration an (kurze Hose, Senfgelb).',
  '',
  'Turban und Dreieckstuch sind technisch anders aufgebaut und bekommen das gleiche Upgrade als Nächstes. Für den geparkten Body-Konfigurator bräuchten wir später mal ein Foto vom Body flach liegend — keine Eile.',
  '',
  'Nebenbei beheben wir noch zwei Dinge unter der Haube: kurze Shop-Aussetzer bei unseren Software-Updates (~45 Sek.) und sichtbare Fehlermeldungen im Konfigurator, falls doch mal etwas schiefgeht. Weitere Fotos jederzeit willkommen! 📸',
].join('\n');
const tr = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ chat_id: env.TELEGRAM_ALLOWED_USER_IDS.split(',')[0].trim(), text: tgText, disable_web_page_preview: true }),
});
const tj = await tr.json();
console.log('telegram:', JSON.stringify({ ok: tj.ok, message_id: tj.result?.message_id }));
if (!tj.ok) { failures++; console.error(tj); }

// --- 3. BIL-1: Triage-Kommentar + Blocker-Swap + blocked, atomar
const bil1Comment = [
  '## CEO-Triage: alle drei Gates done — Folge-Tickets delegiert, Board informiert',
  '',
  '**Erledigt (Patricks beide Fotos vom Vormittag):**',
  '- **BIL-2508** (Stoff 09 Kachel-Naht): live `main@03c381a`. Root Cause bemerkenswert: die BIL-2497-Nahtmetrik hat genau das gemessen, was der Algorithmus per Konstruktion garantiert — sie KONNTE nicht rot werden. Jetzt: gerade Naht + mitgesuchter Crop-Offset + quellenbasierte Methodenwahl, Audit ueber alle Stoffe. CEO-Gegenprobe: Beleg-Crops angesehen (Streifen bleiben senkrecht, keine erfundene Geometrie mehr) und Live-Asset verifiziert (`/stoffe/stoff-09.webp` byte-identisch zum Fix, 51830 B).',
  '- **BIL-2509** (Realismus): echte Falten aus dem Basisfoto fuer Hose/Hose-kurz/Muetze, live, Lighthouse Perf 98 / a11y 100.',
  '- **BIL-2507** (stilles variant_unavailable): Backend-Retry live `main@c294dce`; Ursache war das Deploy-Cutover-Fenster.',
  '',
  '**Delegiert:**',
  '- **BIL-2511 -> @DevOps (high):** Deploy-Cutover ~45 s Downtime + fehlender Medusa-Healthcheck. Groesster offener Funktionalitaets-Defekt; DoD = 0-Fehlfenster-Messung WAEHREND eines echten Deploys.',
  '- **BIL-2510 -> @Frontend (medium, zuerst):** `?error=` sichtbar machen in allen 6 Konfiguratoren.',
  '- **BIL-2512 -> @Frontend (medium, danach):** Turban+Dreieckstuch Original-Druck aus der Basis entfernen (andere Architektur, Fallen-Liste im Ticket).',
  '- **BIL-2513** (Body) bleibt blocked auf ein Flach-Foto von Sabine — Body ist board-seitig geparkt, kein BIL-1-Gate; Foto-Bitte ist beim Board platziert (Telegram, "keine Eile").',
  '',
  '**Board:** Entwarnung an Patrick per Telegram raus (beide Foto-Punkte live, inkl. ehrlichem Hinweis, warum die erste "erledigt"-Meldung zu frueh kam; Turban/Dreieckstuch als Naechstes angekuendigt).',
  '',
  'BIL-1 `blockedBy` -> [BIL-2510, BIL-2511, BIL-2512]. Naechster Trigger: Fortschritt dort oder neue Patrick-Fotos.',
].join('\n');
const p1 = await req('PATCH', `/api/issues/${ids['BIL-1']}`, {
  status: 'blocked',
  blockedByIssueIds: [ids['BIL-2510'], ids['BIL-2511'], ids['BIL-2512']],
  comment: bil1Comment,
});
if (!p1.ok) failures++;

// Gegenprobe
const check = await req('GET', `/api/issues/${ids['BIL-1']}`);
console.log('BIL-1 final:', check.json.status, JSON.stringify((check.json.blockedBy || []).map((b) => `${b.identifier}:${b.status}`)));
console.log(failures ? `DONE WITH ${failures} FAILURES` : 'ALL OK');
process.exit(failures ? 1 : 0);
