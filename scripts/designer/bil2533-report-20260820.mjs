/**
 * BIL-2533 — Work Products, Abschlussbericht und Abnahme-Anfrage ans Board.
 *
 * Dieser Build hat keinen Attachment-Endpunkt (siehe BIL-2522), deshalb werden
 * die Belege als Work Products mit `resourceRef: workspace_file` registriert.
 */
const API = process.env.PAPERCLIP_API_URL || "http://localhost:3100";
const KEY = process.env.PAPERCLIP_API_KEY;
const RUN = process.env.PAPERCLIP_RUN_ID;
const ISSUE_ID = "e62131d9-0cc1-4f8c-83a0-9a5c254de1c4";
const WORKSPACE_ID = "5e251e01-8c35-4243-9a64-ebccc2ffed74";

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
    title: "main@943b152 — Falten sichtbar, Bund-Ripp, Nähte",
    url: "https://github.com/patrickgast80/binchen/commit/943b152",
    description:
      "warpDrape trennt den Gain der erfundenen Falten vom fotografierten; Uni-Zonen " +
      "laufen durch die Relief-Ebene; Ripp und Nähte kommen pro Zusammenhangskomponente " +
      "aus der Zonenmaske. Nur hose-kurz, opt-in per ZONE_STRUCTURE/uniZones.",
    metadata: { commit: "943b152", branch: "main" },
  },
  {
    type: "commit",
    provider: "github",
    title: "main@e8234dd — die TTI-Regression, die der erste Commit einbrachte",
    url: "https://github.com/patrickgast80/binchen/commit/e8234dd",
    description:
      "Uni-Zonen durch den Catmull-Rom-Sampler kosteten live TTI 3,5 -> 7,4 s (4/4 Läufe). " +
      "1x1-Kurzschluss in relief-math.mjs, byte-gleich über 162816 geprüfte Fälle.",
    metadata: { commit: "e8234dd", branch: "main" },
  },
  {
    type: "artifact",
    provider: "workspace",
    title: "BIL-2533 Vorher/Nachher live — 4 Konfigurationen x 2 Viewports + Jitter-Zwillinge",
    description:
      "24 Live-Screenshots gegen bilulu.de: je Fall nachher / Jitter-Zwilling / Vorher-Kontrolle " +
      "(relief.webp abgewürgt = dokumentierter CSS-Fallback, also exakt der Stand, den Patrick " +
      "fotografiert hat). Beide Hälften aus demselben Lauf gegen denselben Server. " +
      "sheet-desktop.png ist der Bogen fürs Board. Erzeugt von apps/e2e/scripts/bil2533-evidence.mjs.",
    metadata: workspaceRef("apps/e2e/reports/bil2533/evidence"),
  },
  {
    type: "artifact",
    provider: "workspace",
    title: "BIL-2533 Live-Repro der Cache-Frage (Schritt 1)",
    description:
      "Patricks Konfiguration live nachgestellt, vor jeder Änderung: Relief-Canvas sichtbar " +
      "nach 1105 ms (Desktop) / 418 ms (390px), 0 console.error, Jitter-Diff 0. Damit war " +
      "belegt, dass er den aktuellen Stand sah und nicht einen Cache.",
    metadata: workspaceRef("apps/e2e/reports/bil2533/live-repro"),
  },
  {
    type: "artifact",
    provider: "workspace",
    title: "BIL-2533 Perf-Messungen (Lighthouse, gepinnte Version)",
    description:
      "Drei Messreihen mit unveränderten Kontrollen im selben Lauf: vorher (lh/), die " +
      "Wiederholung der Uni-Regression (lh-uni-repeat/, 4/4), nachher (lh-after/). " +
      "summary.md je Reihe, long-tasks.json mit jedem einzelnen Long Task.",
    metadata: workspaceRef("apps/e2e/reports/bil2533"),
  },
];

const run = async () => {
  for (const wp of WPS) {
    const res = await fetch(`${API}/api/issues/${ISSUE_ID}/work-products`, {
      method: "POST",
      headers: H,
      body: JSON.stringify(wp),
    });
    console.log("wp", res.status, wp.title.slice(0, 55), (await res.text()).slice(0, 90));
  }

  const { readFileSync } = await import("node:fs");
  const body = readFileSync(
    new URL("./bil2533-final-comment.md", import.meta.url),
    "utf8",
  );
  const c = await fetch(`${API}/api/issues/${ISSUE_ID}/comments`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ body }),
  });
  console.log("comment", c.status, (await c.text()).slice(0, 120));
};

run().then(() => console.log("OK")).catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
