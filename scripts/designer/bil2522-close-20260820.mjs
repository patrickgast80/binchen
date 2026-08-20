/**
 * BIL-2522 — Ticketschluss nach der Board-Abnahme vom 2026-08-20 06:55:39Z.
 *
 * Registriert die Gegenprobe-Belege als Work Products (dieser Build hat keinen
 * Attachment-Endpunkt), postet den Abschlusskommentar und setzt `done`.
 */
const API = process.env.PAPERCLIP_API_URL || "http://localhost:3100";
const KEY = process.env.PAPERCLIP_API_KEY;
const RUN = process.env.PAPERCLIP_RUN_ID;
const ISSUE_ID = "bf583f0d-8c87-4e2e-bfc1-ecb67ec5f140";
const WORKSPACE_ID = "5e251e01-8c35-4243-9a64-ebccc2ffed74";
const COMMIT = "6fd7cc4";

const H = {
  "content-type": "application/json",
  authorization: `Bearer ${KEY}`,
  "X-Paperclip-Run-Id": RUN,
};

const workspaceRef = (relativePath) => ({
  resourceRef: {
    kind: "workspace_file",
    workspaceKind: "project_workspace",
    workspaceId: WORKSPACE_ID,
    relativePath,
    displayPath: relativePath,
  },
});

const WPS = [
  {
    type: "commit",
    provider: "github",
    title: `main@${COMMIT} — Gegenprobe vor dem Ticketschluss`,
    url: `https://github.com/patrickgast80/binchen/commit/${COMMIT}`,
    description:
      "Nachweis, dass der vom Board abgenommene Stand noch der ausgelieferte ist: " +
      "md5 der live gelieferten relief.webp aller fuenf gegen das Repo, Relief-Canvas " +
      "sichtbar und gemalt auf Desktop und 390px, Jitter-Kontrolle Diff 0.",
    metadata: { commit: COMMIT, branch: "main" },
  },
  {
    type: "artifact",
    provider: "workspace",
    title: "BIL-2522 Abnahme-Gegenprobe 20.08. — Screenshots + summary.json",
    description:
      "Zehn Live-Screenshots (fuenf Konfiguratoren x Desktop 1440 / 390px mobil), plus " +
      "der Jitter-Zwilling von hose/desktop, plus summary.json mit den Asset-Hashes und " +
      "der Canvas-Statistik je Fall. Erzeugt von apps/e2e/scripts/bil2522-abnahme-recheck-20260820.mjs.",
    metadata: workspaceRef("apps/e2e/reports/bil2522/abnahme-20260820"),
  },
];

for (const wp of WPS) {
  const res = await fetch(`${API}/api/issues/${ISSUE_ID}/work-products`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(wp),
  });
  console.log("wp", res.status, wp.title, (await res.text()).slice(0, 160));
}

const body = [
  "## Abgenommen — und vor dem Zumachen nochmal nachgemessen",
  "",
  "Ihr habt die Abnahme heute um **06:55:39Z** angenommen. Damit ist das einzige,",
  "was hier noch offen war, entschieden — ich schließe das Ticket.",
  "",
  "Vorher aber eine Gegenprobe, denn ihr habt abgenommen, was ihr **gestern** gesehen",
  "habt: zwischen meiner Frage (19.08. 17:05Z) und eurer Antwort lagen sieben Commits",
  "auf `main`, und drei davon fassen genau meine Relief-Ebene an — BIL-2529 (Cookie-Banner)",
  "und BIL-2531 (Zeitscheiben, und vor allem: die Bilder werden jetzt per",
  "`createImageBitmap` dekodiert statt per `<img>`). Die Relief-Karte ist keine Grafik,",
  "sondern eine Datentabelle — in Rot/Grün stehen Texturkoordinaten, in Blau das Licht.",
  "Ein Decoder, der auch nur die Farbverwaltung anders anfasst, verbiegt damit still den",
  "ganzen Stoffverlauf. Eine Abnahme auf einen Stand, den es live nicht mehr gibt, wäre",
  "wertlos gewesen.",
  "",
  "### Drei Fragen, drei Messungen (`main@6fd7cc4`)",
  "",
  "**1. Sind die Relief-Karten noch dieselben?** md5 der von bilulu.de gelieferten Datei",
  "gegen das Repo:",
  "",
  "| | live | Repo | |",
  "|---|---|---|---|",
  "| `hose` | `9b4e9a3a` | `9b4e9a3a` | identisch |",
  "| `hose-kurz` | `a21f8604` | `a21f8604` | identisch |",
  "| `muetze` | `bff773fa` | `bff773fa` | identisch |",
  "| `turban` | `ba342ecb` | `ba342ecb` | identisch |",
  "| `dreieckstuch` | `bde2380b` | `bde2380b` | identisch |",
  "",
  "Das sind Zeichen für Zeichen die Hashes aus meinem Kommentar von 18:45Z — also exakt",
  "die Bytes, auf die sich eure Abnahme bezieht.",
  "",
  "**2. Malt die Ebene noch?** Auf allen fünf wird das Relief-Canvas sichtbar und trägt",
  "Zeichnung — nicht nur „vorhanden\", sondern gemessen: gemalte Pixel und Streuung der",
  "Helligkeit. Eine leere oder flach gefüllte Ebene fiele hier sofort auf.",
  "",
  "| | gemalte Pixel | σ Helligkeit |",
  "|---|---|---|",
  "| `hose` | 441 735 | 53,2 |",
  "| `hose-kurz` | 327 169 | 41,2 |",
  "| `muetze` | 500 312 | 34,4 |",
  "| `turban` | 386 133 | 53,3 |",
  "| `dreieckstuch` | 207 717 | 45,8 |",
  "",
  "Desktop und Mobil liefern hier **dieselben** Zahlen — das Rendering hängt also nicht am",
  "Gerät, die Besucherin am Handy sieht dasselbe Relief wie am Rechner.",
  "",
  "**3. Sieht es noch gleich aus?** Zehn Screenshots, fünf Konfiguratoren × Desktop 1440",
  "und 390px mobil, Consent vorgesetzt statt weggeklickt. 10/10 unterscheiden sich",
  "voneinander (kein Cookie-Banner, der überall dasselbe Bild liefert), keine",
  "Konsolenfehler. Jitter-Kontrolle: `hose` desktop zweimal → **Diff 0 Bytes**, ohne die",
  "würde kein einziger Vergleich hier etwas beweisen.",
  "",
  "Bilder: `apps/e2e/reports/bil2522/abnahme-20260820/` (als Work Product verlinkt),",
  "Skript `apps/e2e/scripts/bil2522-abnahme-recheck-20260820.mjs`.",
  "",
  "### Was aus diesem Ticket bewusst nicht mitkommt",
  "",
  "- **Lighthouse mobil 69 statt der geforderten 95.** Nicht geschluckt, sondern gemessen:",
  "  dieselbe Seite *ohne* gewählten Stoff, wo meine Ebene gar nicht malt, kommt auch nur",
  "  auf 76 bei identischem LCP. Es liegt an der Ladezeit der Seite, nicht am Rendering.",
  "  Das lief als **BIL-2523** bei Frontend und hat inzwischen eine ganze Kette Kinder",
  "  bekommen (2526/2527/2529/2531) — die TTI ist von 6,98 s auf 3,69 s runter.",
  "- **`body`** bleibt außen vor: handgezeichnet, ohne ein Flat-Lay-Foto von Sabine",
  "  algorithmisch nicht zu retten. Das ist **BIL-2513**, board-geparkt.",
  "",
  "Wenn euch später doch ein einzelnes Teil oder ein einzelner Stoff auffällt, macht das",
  "Ticket bitte nicht wieder auf, sondern schreibt mir *welcher* — dann drehe ich gezielt",
  "an dem einen statt an allen fünf.",
].join("\n");

const c = await fetch(`${API}/api/issues/${ISSUE_ID}/comments`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ body }),
});
console.log("comment", c.status, (await c.text()).slice(0, 200));

const p = await fetch(`${API}/api/issues/${ISSUE_ID}`, {
  method: "PATCH",
  headers: H,
  body: JSON.stringify({ status: "done" }),
});
console.log("patch", p.status, (await p.text()).slice(0, 200));
