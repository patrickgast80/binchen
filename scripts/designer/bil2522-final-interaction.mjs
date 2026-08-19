/**
 * BIL-2522 — Abnahme-Interaktion nach dem Rollout.
 *
 * Das Ticket sagt ausdruecklich, die finale "taeuschend echt"-Abnahme macht das
 * Board. Schema-Fallen (beide schon einmal bezahlt): `title`/`summary` gehoeren
 * auf die oberste Ebene, `payload` braucht `version: 1` und einen `prompt` mit
 * maximal 1000 Zeichen.
 */
const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const ISSUE = process.env.PAPERCLIP_TASK_ID;
const H = { "content-type": "application/json", authorization: `Bearer ${KEY}` };

const prompt = [
  "Der Rollout ist durch und live auf bilulu.de: hose, hose-kurz, muetze, turban,",
  "dreieckstuch. Das Muster folgt jetzt den Falten, rollt um die Rundungen und",
  "reagiert auf Licht.",
  "",
  "Zum Draufschauen im Repo (dieser Build hat keinen Attachment-Endpunkt):",
  "· reports/bil2522/<name>-alle-stoffe.png — JEDER der 35 Stoffe neben dem",
  "  Originalfoto. So ist eure Latte 'mit jedem Stoff' ueberhaupt pruefbar.",
  "· reports/bil2522/turban-stoff-15-sage.png — Vorher | Nachher | Originalfoto.",
  "Oder klicken: bilulu.de/konfigurator/turban",
  "",
  "ABNEHMEN: ich schliesse das Ticket.",
  "NACHJUSTIEREN: sagt mir WELCHES Teil oder WELCHER Stoff rausfaellt, dann drehe",
  "ich gezielt daran statt an allen fuenf. Beim Dreieckstuch ist der Effekt",
  "bewusst am zurueckhaltendsten, weil das Tuch flach liegt.",
  "",
  "Nicht verschwiegen: Lighthouse mobil 69 statt 95 — dieselbe Seite ohne Stoff",
  "kommt aber auch nur auf 76, es liegt an der Ladezeit, nicht am Konfigurator",
  "(Kind-Issue bei Frontend). Body bleibt aussen vor (BIL-2513).",
].join("\n");

if (prompt.length > 1000) throw new Error(`prompt ist ${prompt.length} Zeichen, erlaubt sind 1000`);

const res = await fetch(`${API}/api/issues/${ISSUE}/interactions`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    kind: "request_confirmation",
    idempotencyKey: `confirmation:${ISSUE}:rollout-abnahme:5ed0ae5`,
    continuationPolicy: "wake_assignee",
    title: "Alle fünf Konfiguratoren live — täuschend echt genug?",
    summary: "Rollout auf allen fünf Foto-Konfiguratoren ist live; Abnahme entscheidet über den Ticketschluss.",
    payload: { version: 1, prompt, allowDeclineReason: true, supersedeOnUserComment: true },
  }),
});
console.log("interaction", res.status, (await res.text()).slice(0, 300));
