// CEO triage 2026-08-17: Board-Kommentar af64e14d auf BIL-1 — Sabine liefert
// vorbearbeitete Bilder selbst ("bilder bearbeitet"); KI-Freistellung (BIL-2486/2489)
// wird storniert, neues Relaunch-Ticket an Backend, BIL-1-Blocker umgehängt.
const KEY = process.env.PAPERCLIP_API_KEY;
const BASE = 'http://localhost:3100';
const COMPANY = '723a0156-47d4-4ec0-9d21-81a1cebeb182';

const BIL1 = '6ed67fea-3d4f-444a-b770-bfda823387b6';
const BIL2486 = 'cd3dae0c-f708-4476-8c5a-affa697996ff';
const BIL2489 = '85c31d6a-99a6-4490-92cf-b2c771a508ae';
const BACKEND = '7f5b1310-db4a-435d-a847-f37412c21afb';

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

const newIssueDescription = `## Kontext

Board-Entscheid 2026-08-17 auf BIL-1 (Kommentar af64e14d): Sabine bearbeitet die Produktbilder **selbst** (freigestellt, ohne Hintergrund) und lädt sie in einen neuen Ordner namens **"bilder bearbeitet"** hoch. Die KI-Freistellungs-Tickets BIL-2486 und BIL-2489 sind damit storniert.

Board-Vorgabe wörtlich: Sachen aus demselben Stoff gehören als Set zusammen und sollen **ein** Produkt ergeben. **Alles andere, was bisher im Shop ist, wird gelöscht** (explizit board-autorisiert).

## Auftrag (startet erst nach Unblock)

1. **Bilder finden und sichten**: Ordner "bilder bearbeitet" (vermutlich via Telegram-Bridge angeliefert oder im Projekt abgelegt — beim Unblock nennt der CEO den konkreten Pfad).
2. **Set-Gruppierung**: Artikel aus demselben Stoff = ein Set = EIN Produkt (z.B. Mütze + Hose + Halstuch aus gleichem Stoff). Gruppierungsvorschlag mit Produktnamen und Preisvorschlägen als Kommentar an BIL-1 ans Board zur Freigabe, BEVOR Produkte angelegt werden — es sei denn, Sabine hat Gruppierung/Preise bereits mitgeliefert.
3. **Neue Produkte in Medusa anlegen**: Bilder hochladen (uploads/ liegt auf Bind-Mount, /static-Route beachten), Varianten + Bestand (Unikate = limitierter Bestand), Preise in **Major Units — NIE ×100**.
4. **Alte Produkte löschen — erst NACH Live-Verifikation der neuen**: Shop darf nie leer sein. Vorher prüfen, dass das nächtliche pg_dump-Backup (Hetzner-Host-Cron) einen aktuellen Stand hat.
5. **Alle Flächen verifizieren**: Katalog, Startseite, PDPs, /fruehchen, und die Konfiguratoren (Turban/Mütze/Dreieckstuch/Hose) — die Konfiguratoren hängen an konkreten Produkten/Assets; was durch die Löschung bricht, mit CEO klären statt still entfernen. Live-Screenshots als Beleg.

## Unblock

**Owner: Sabine (Board).** Aktion: bearbeitete Bilder im Ordner "bilder bearbeitet" bereitstellen und auf BIL-1 Bescheid geben. Der CEO entblockt dieses Ticket dann mit dem konkreten Bilder-Pfad.`;

const bil1Comment = `Verstanden — wir stellen um. Die KI-Freistellung ist gestoppt (BIL-2486 und BIL-2489 storniert), stattdessen warten wir auf deine selbst bearbeiteten Bilder.

**Was ich eingerichtet habe:** Ein neues Ticket fürs Backend-Team: Sobald deine Bilder da sind, bauen wir daraus die neuen Produkte (gleicher Stoff = ein Set = ein Produkt) und löschen danach alles, was bisher im Shop ist. Gelöscht wird erst, wenn die neuen Produkte live und geprüft sind — so ist der Shop nie leer.

**Wenn du mit dem Bearbeiten fertig bist, bitte:**

1. Den Ordner **"bilder bearbeitet"** bereitstellen — am einfachsten die Bilder über die Telegram-Bridge schicken oder den Ordner im Projekt ablegen — und hier auf BIL-1 kurz Bescheid geben.
2. Wenn möglich kennzeichnen, was zusammengehört: z.B. ein Unterordner pro Set oder Dateinamen wie \`set1-muetze.png\`, \`set1-hose.png\`. Falls nicht, gruppieren wir nach Stoff-Optik und legen dir den Vorschlag zur Freigabe vor.
3. Falls du schon Preise pro Set im Kopf hast, schreib sie dazu — sonst machen wir Preisvorschläge, die du absegnest.`;

(async () => {
  // 1. Neues Relaunch-Ticket als Kind von BIL-1, Backend, blocked (wartet auf Sabines Upload).
  const create = await api('POST', `/api/companies/${COMPANY}/issues`, {
    title: `Shop-Relaunch: neue Produkte aus Sabines vorbearbeiteten Bildern (Ordner "bilder bearbeitet"), Sets nach Stoff, alte Produkte danach löschen`,
    description: newIssueDescription,
    parentId: BIL1,
    assigneeAgentId: BACKEND,
    priority: 'high',
    status: 'blocked',
  });
  console.log('CREATE new issue:', create.status, JSON.stringify(create.data).slice(0, 400));
  const newId = create.data && create.data.id;
  const newIdent = create.data && create.data.identifier;
  if (!newId) { console.error('ABORT: no new issue id'); process.exit(1); }

  // Falls status im Create ignoriert wurde: nachziehen.
  if (create.data.status !== 'blocked') {
    const p = await api('PATCH', `/api/issues/${newId}`, { status: 'blocked' });
    console.log('PATCH new issue blocked:', p.status, JSON.stringify(p.data).slice(0, 200));
  }

  // 2. BIL-1-Blocker umhängen: 2486 raus, neues Ticket rein (Reihenfolge: erst neuer Blocker, dann Cancels).
  const swap = await api('PATCH', `/api/issues/${BIL1}`, { blockedByIssueIds: [newId] });
  console.log('PATCH BIL-1 blockers:', swap.status, JSON.stringify(swap.data).slice(0, 200));

  // 3. BIL-2489 stornieren (mir zugewiesen).
  const c2489c = await api('POST', `/api/issues/${BIL2489}/comments`, {
    body: `Storniert per Board-Entscheid 2026-08-17 auf BIL-1: Sabine stellt die Bilder selbst frei und liefert sie im Ordner "bilder bearbeitet". Nachfolger: ${newIdent || newId} (Shop-Relaunch aus vorbearbeiteten Bildern).`,
  });
  console.log('COMMENT BIL-2489:', c2489c.status);
  const c2489 = await api('PATCH', `/api/issues/${BIL2489}`, { status: 'cancelled' });
  console.log('CANCEL BIL-2489:', c2489.status, JSON.stringify(c2489.data).slice(0, 200));

  // 4. BIL-2486 stornieren (Designer-zugewiesen; 403/409 tolerieren, Kommentar reicht dann als Handoff).
  const c2486c = await api('POST', `/api/issues/${BIL2486}/comments`, {
    body: `@Designer Storniert per Board-Entscheid 2026-08-17 auf BIL-1: Sabine bearbeitet die Produktbilder selbst und liefert sie freigestellt im Ordner "bilder bearbeitet". Keine KI-Freistellung mehr nötig — bitte keine weitere Arbeit hieran. Nachfolger: ${newIdent || newId}.`,
  });
  console.log('COMMENT BIL-2486:', c2486c.status);
  const c2486 = await api('PATCH', `/api/issues/${BIL2486}`, { status: 'cancelled' });
  console.log('CANCEL BIL-2486:', c2486.status, JSON.stringify(c2486.data).slice(0, 300));

  // 5. Antwort ans Board auf BIL-1.
  const reply = await api('POST', `/api/issues/${BIL1}/comments`, { body: bil1Comment });
  console.log('COMMENT BIL-1:', reply.status, JSON.stringify(reply.data).slice(0, 200));

  console.log('NEW_ISSUE', newIdent, newId);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
