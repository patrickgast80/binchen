// CEO triage 2026-08-18: Board-Wunsch via Telegram (BIL-1 Kommentar 6526631b):
// Hauptstoff im Konfigurator drehbar machen. Neues Kind-Ticket an Frontend,
// Ack auf BIL-1, BIL-1 bleibt blocked auf BIL-2490 (Blocker im PATCH mitgeben).
const KEY = process.env.PAPERCLIP_API_KEY;
const BASE = 'http://localhost:3100';
const COMPANY = '723a0156-47d4-4ec0-9d21-81a1cebeb182';

const BIL1 = '6ed67fea-3d4f-444a-b770-bfda823387b6';
const FRONTEND = '55d15751-05e6-4e51-9239-caa3e5223520';

async function api(method, path, body, extraHeaders = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}

const childDescription = `## Kontext

Board-Wunsch von Patrick via Telegram, 2026-08-18 (BIL-1, Kommentar 6526631b): **„Man sollte beim Konfigurator den Haupt Stoff drehen können. Bitte einbauen."**

Gemeint ist die Ausrichtung des Stoffmusters: Nutzer sollen den gewählten (Haupt-)Stoff im Konfigurator drehen können, damit das Muster in der gewünschten Richtung liegt.

## Auftrag

1. **UI-Control** im Konfigurator zum Drehen des Stoffs der Haupt-Zone — 90°-Schritte reichen als MVP (0/90/180/270). Wenn es mit wenig Mehraufwand für **alle** Stoff-Zonen geht, gern für alle; sonst Haupt-Zone zuerst und Rest als Follow-up vorschlagen.
2. **Rendering**: Die Rotation muss in die Live-Vorschau einfließen (Muster-Kachelung entsprechend gedreht). Gilt für alle Konfiguratoren, die Stoffmuster nutzen (Pumphose, Body, Turban, Mütze, Dreieckstuch) — mindestens aber für die Konfiguratoren mit erkennbar gerichtetem Muster.
3. **Save/Share (BIL-2454)**: Der Rotationszustand muss in gespeicherten/geteilten Konfigurationen mitkommen (Payload + Wiederherstellung), sonst sieht ein geteilter Link anders aus als das Original. OG-Karte prüfen, ob sie die Vorschau spiegelt.
4. **Verifikation**: Live auf bilulu.de prüfen, Screenshots (gedreht vs. ungedreht) als Beleg ins Ticket, auch mobil.

## Technische Hinweise (aus früheren Konfigurator-Tickets)

- Die Stoffmuster liegen als Blend-Stack auf Zonen (multiply/screen); feine Textur ist farbabhängig und liegt in der Screen-Ebene. Rotation sollte auf die **Muster-Kachel vor dem Tiling** angewandt werden, nicht auf die fertige Komposition — sonst verschieben sich Masken/Zonen.
- Konfigurator-Produkte werden per **Titel-Regex** aufgelöst (Pumphose + Body sind load-bearing) — nichts umbenennen.
- Shared \`_default\`-Checkout: eigenen Branch nutzen, nur eigene Dateien stagen, kein paralleles \`pnpm install\`/\`next build\` neben anderen Agenten.

## Abgrenzung

Unabhängig vom Shop-Relaunch BIL-2490 (Konfiguratoren bleiben bestehen) — kann parallel starten.`;

const bil1Comment = `Danke Patrick, guter Punkt — das bauen wir ein. 👍

Ich habe dafür ein Ticket ans Frontend-Team erstellt: Im Konfigurator wird der (Haupt-)Stoff drehbar (zunächst in 90°-Schritten), die Drehung fließt in die Live-Vorschau ein und bleibt auch beim Speichern/Teilen einer Konfiguration erhalten. Geprüft wird live auf bilulu.de mit Vorher/Nachher-Screenshots.

Das läuft unabhängig vom Shop-Relaunch (BIL-2490) und kann sofort starten. @Frontend übernimmt.`;

(async () => {
  // 1. Kind-Ticket an Frontend.
  const create = await api('POST', `/api/companies/${COMPANY}/issues`, {
    title: 'Konfigurator: Hauptstoff drehbar machen (Muster-Rotation in Vorschau + Save/Share)',
    description: childDescription,
    parentId: BIL1,
    assigneeAgentId: FRONTEND,
    priority: 'medium',
  });
  console.log('CREATE child:', create.status, JSON.stringify(create.data).slice(0, 300));
  const childId = create.data && create.data.id;
  const childIdent = create.data && create.data.identifier;
  if (!childId) { console.error('ABORT: no child id'); process.exit(1); }

  // 2. Ack ans Board auf BIL-1.
  const reply = await api('POST', `/api/issues/${BIL1}/comments`, {
    body: bil1Comment + `\n\n(Ticket: ${childIdent || childId})`,
  });
  console.log('COMMENT BIL-1:', reply.status, JSON.stringify(reply.data).slice(0, 200));

  // 3. BIL-1-Status sichern: blocked auf BIL-2490 bleibt (Blocker-IDs explizit mitgeben).
  const cur = await api('GET', `/api/issues/${BIL1}`);
  const blockers = (cur.data && (cur.data.blockedByIssueIds || cur.data.blockedBy || []))
    .map((b) => (typeof b === 'string' ? b : b.id));
  console.log('BIL-1 current status:', cur.data && cur.data.status, 'blockers:', blockers);
  if (cur.data && cur.data.status !== 'blocked') {
    const p = await api('PATCH', `/api/issues/${BIL1}`, { status: 'blocked', blockedByIssueIds: blockers });
    console.log('PATCH BIL-1 re-block:', p.status, JSON.stringify(p.data).slice(0, 200));
  }

  console.log('CHILD', childIdent, childId);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
