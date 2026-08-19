// BIL-2522 — Heartbeat 2026-08-19 ~17:2xZ.
// Der Wake war ein Echo meines eigenen 17:04-Kommentars (board-scoped gepostet,
// deshalb als `local-board` attribuiert). Keine neue Board-Rueckmeldung.
// Statt einer Echo-Antwort: nachweisen, dass live seit den Belegen nichts
// gewandert ist — Nachbar-Tickets haben schon einmal Assets veraendert.
const url = process.env.PAPERCLIP_API_URL || "http://localhost:3100";
const key = process.env.PAPERCLIP_API_KEY;
const runId = process.env.PAPERCLIP_RUN_ID;
const ISSUE = "bf583f0d-8c87-4e2e-bfc1-ecb67ec5f140";

const body = [
  "## Kein neuer Stand — nur nachgewiesen, dass der ausgelieferte hält",
  "",
  "Dieser Heartbeat kam von einem Wake-Echo meines eigenen Kommentars von 17:04Z,",
  "nicht von einer Rückmeldung von euch. Die Abnahme-Frage steht also weiter offen",
  "(Confirmation *„Alle fünf Konfiguratoren live — täuschend echt genug?\"*).",
  "",
  "Weil Nachbar-Tickets im geteilten Checkout schon einmal Assets unter mir",
  "verändert haben, habe ich nicht einfach gewartet, sondern gegengeprüft:",
  "",
  "| | live | Repo | |",
  "|---|---|---|---|",
  "| `hose` | `26a698e3…` | `26a698e3…` | identisch |",
  "| `hose-kurz` | `5b0afe28…` | `5b0afe28…` | identisch |",
  "| `muetze` | `f1dd984f…` | `f1dd984f…` | identisch |",
  "| `turban` | `4fd876e5…` | `4fd876e5…` | identisch |",
  "| `dreieckstuch` | `d7dc9e8e…` | `d7dc9e8e…` | identisch |",
  "",
  "md5 der von bilulu.de ausgelieferten `relief.webp` gegen die Datei im Repo, alle",
  "fünf 200. `origin/main` steht unverändert auf `c122d2b`, also hat auch niemand",
  "sonst seit den Belegen an den Konfiguratoren gedreht. Die Kontaktbögen zeigen",
  "damit weiterhin das, was der Shop wirklich rendert.",
  "",
  "**Offen bleibt genau eine Sache: eure Abnahme.** „Täuschend echt\" ist subjektiv,",
  "das kann ich nicht selbst abhaken. Wenn ein einzelnes Teil oder ein einzelner",
  "Stoff rausfällt, sagt mir welcher — dann drehe ich gezielt daran.",
  "",
  "Der Performance-Rest (Ladezeit der Konfigurator-Seiten, nicht das Rendering)",
  "läuft als **BIL-2523** bei Frontend und ist dort `in_progress`.",
].join("\n");

const r = await fetch(`${url}/api/issues/${ISSUE}/comments`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    "X-Paperclip-Run-Id": runId,
  },
  body: JSON.stringify({ body }),
});
console.log("comment", r.status, (await r.text()).slice(0, 200));

const p = await fetch(`${url}/api/issues/${ISSUE}`, {
  method: "PATCH",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    "X-Paperclip-Run-Id": runId,
  },
  body: JSON.stringify({ status: "in_review" }),
});
console.log("patch", p.status, (await p.text()).slice(0, 200));
