/**
 * BIL-2522 — work products after the rollout to all five Konfiguratoren.
 *
 * This Paperclip build has no attachment endpoint (POST .../attachments is a
 * 404), so the sheets are registered as `artifact` work products with a
 * workspace-relative path, and the merge commit as the handoff.
 */
const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const ISSUE_ID = "bf583f0d-8c87-4e2e-bfc1-ecb67ec5f140";
/** The shared _default checkout every agent works in. */
const WORKSPACE_ID = "5e251e01-8c35-4243-9a64-ebccc2ffed74";
const COMMIT = "4112822";

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
    title: `main@${COMMIT} — Relief-Stoffebene auf allen fuenf Foto-Konfiguratoren`,
    url: `https://github.com/patrickgast80/binchen/commit/${COMMIT}`,
    description:
      "Merge von designer/bil2522-relief-fabric nach main, nach Board-Freigabe des " +
      "Hose-Proofs (Confirmation angenommen 19.08. 15:28Z). Enthaelt die relief.webp fuer " +
      "hose-kurz, muetze, turban und dreieckstuch, die Silhouetten-Reparatur von " +
      "dreieckstuch und turban, sowie die verdrahteten Vorschau-Komponenten.",
    metadata: { commit: COMMIT, branch: "main" },
  },
  {
    type: "artifact",
    provider: "workspace",
    title: "BIL-2522 Kontaktboegen — jeder der 35 Stoffe neben dem Originalfoto",
    description:
      "Fuenf Blaetter (<konfigurator>-alle-stoffe.png), je 35 Zellen plus das gepinnte " +
      "Originalfoto im Kopf. Das ist die Form, in der die Board-Latte vom 19.08. 11:54Z " +
      "('mit jedem gewaehlten stoff') ueberhaupt pruefbar ist — zwei Beispielstoffe koennen " +
      "sie nicht belegen, und ein einzelner Ausreisser-Stoff faellt nur im Raster auf.",
    metadata: workspaceRef("apps/storefront/reports/bil2522"),
  },
  {
    type: "artifact",
    provider: "workspace",
    title: "BIL-2522 Live-Browser-Belege + Paritaetsnachweis (alle fuenf)",
    description:
      "Chromium-Screenshots der echten Konfigurator-Seiten, Desktop 1440 und 390px mobil, " +
      "je Konfigurator drei Stoffe inkl. rot=90. Jede Aufnahme mit Jitter-Kontrolle " +
      "(gleiche URL zweimal = identische Bytes) und einem Fallback-Shot mit blockierter " +
      "relief.webp, der sich unterscheiden MUSS — sonst malt die Relief-Ebene gar nicht. " +
      "parity/parity.json: 11/11 gruen, Jitter 0 Bytes, max |Δ| = 4 von 255.",
    metadata: workspaceRef("apps/storefront/reports/bil2522/live"),
  },
];

for (const wp of WPS) {
  const res = await fetch(`${API}/api/issues/${ISSUE_ID}/work-products`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify(wp),
  });
  console.log(res.status, wp.title, (await res.text()).slice(0, 200));
}
