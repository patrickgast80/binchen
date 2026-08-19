/**
 * BIL-2522 — work products for the relief pass.
 *
 * This Paperclip build has no attachment endpoint (POST .../attachments is a
 * 404), so the evidence sheets cannot be uploaded to the ticket. They are
 * registered as `artifact` work products with a workspace-relative path
 * instead, and the branch is registered as the handoff.
 */
const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const ISSUE_ID = "bf583f0d-8c87-4e2e-bfc1-ecb67ec5f140";
// The shared _default checkout every agent works in.
const WORKSPACE_ID = "5e251e01-8c35-4243-9a64-ebccc2ffed74";

const WPS = [
  {
    type: "branch",
    provider: "github",
    title: "designer/bil2522-relief-fabric — Relief-Stoffebene (Hose)",
    url: "https://github.com/patrickgast80/binchen/tree/designer/bil2522-relief-fabric",
    description:
      "Relief-Map-Pipeline + Browser-Ebene fuer den Hose-Konfigurator. Commit 8f7fc25. " +
      "Noch nicht auf main — wartet auf die Board-Steuerung, bevor auf die restlichen " +
      "vier Foto-Konfiguratoren ausgerollt wird.",
    metadata: { commit: "8f7fc25", branch: "designer/bil2522-relief-fabric" },
  },
  {
    type: "artifact",
    provider: "workspace",
    title: "BIL-2522 Vorher/Nachher/Realfoto — Beweisblätter Hose",
    description:
      "Drei Side-by-side-Blätter (flache Kachel | Relief-Stoff | echtes Produktfoto) fuer " +
      "stoff-04, stoff-15 und stoff-20 mit rot=90, plus die Einzelrenderings. Erzeugt von " +
      "apps/storefront/scripts/bil2522-evidence.mjs aus denselben Assets, die der Browser laedt.",
    metadata: {
      resourceRef: {
        kind: "workspace_file",
        workspaceKind: "project_workspace",
        workspaceId: WORKSPACE_ID,
        relativePath: "apps/storefront/reports/bil2522",
        displayPath: "apps/storefront/reports/bil2522",
      },
    },
  },
  {
    type: "artifact",
    provider: "workspace",
    title: "BIL-2522 Live-Browser-Belege + Paritaetsnachweis",
    description:
      "Chromium-Screenshots der echten Konfigurator-Seite (Desktop 1440 + mobil 390) je Stoff, " +
      "jeweils mit Jitter-Kontrolle (gleiche URL zweimal = identische Bytes) und einem " +
      "Fallback-Shot mit blockierter relief.webp. parity.json belegt Browser vs. Node " +
      "mean |Δ| = 0.005 / max 4 von 255.",
    metadata: {
      resourceRef: {
        kind: "workspace_file",
        workspaceKind: "project_workspace",
        workspaceId: WORKSPACE_ID,
        relativePath: "apps/storefront/reports/bil2522/live",
        displayPath: "apps/storefront/reports/bil2522/live",
      },
    },
  },
];

for (const wp of WPS) {
  const res = await fetch(`${API}/api/issues/${ISSUE_ID}/work-products`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify(wp),
  });
  console.log(res.status, wp.title, (await res.text()).slice(0, 240));
}
