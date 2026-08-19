/** BIL-2522 — Work Products zum Alpha-Fix an der Relief-Map. */
const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const ISSUE = "bf583f0d-8c87-4e2e-bfc1-ecb67ec5f140";
const WORKSPACE_ID = "5e251e01-8c35-4243-9a64-ebccc2ffed74";
const workspaceRef = (relativePath) => ({
  resourceRef: { kind: "workspace_file", workspaceKind: "project_workspace", workspaceId: WORKSPACE_ID, relativePath, displayPath: relativePath },
});
const WPS = [
  {
    type: "commit", provider: "github",
    title: "main@d403571 — relief.webp opak encodieren (libwebp exact=0)",
    url: "https://github.com/patrickgast80/binchen/commit/d403571",
    description:
      "Alpha wird vor dem Encode auf 255 gezogen, damit libwebp die RGB-Werte transparenter " +
      "Pixel nicht mehr ueberschreiben darf. Betraf bis zu 3276 gemalte Pixel pro Teil an der " +
      "Silhouettenkante. Round-Trip-Guard prueft jetzt jedes Pixel statt die transparenten zu " +
      "ueberspringen. Nebeneffekt: alle fuenf Maps sind wieder bit-identisch reproduzierbar — " +
      "turban und dreieckstuch waren es nach der base.webp-Neucodierung aus BIL-2523 nicht mehr.",
    metadata: { commit: "d403571", branch: "main" },
  },
  {
    type: "artifact", provider: "workspace",
    title: "BIL-2522 Vorher/Nachher zum Alpha-Fix (5 Blaetter)",
    description:
      "[vorher | nachher | Differenz x12] je Konfigurator. Der Ausschnitt wird von der Differenz " +
      "gewaehlt, nicht per Auge. Beim Dreieckstuch liegt die Differenz sichtbar auf der Saumkante — " +
      "genau dort, wo die Zonenmaske ueber die Silhouette hinausgreift. Vorher/nachher sind mit " +
      "blossem Auge identisch; das ist die Aussage, nicht der Mangel.",
    metadata: workspaceRef("apps/storefront/reports/bil2522/alpha-fix"),
  },
  {
    type: "artifact", provider: "workspace",
    title: "BIL-2522 Encoder-Sweep — warum relief.webp nicht kleiner wird",
    description:
      "Antwort auf die Payload-Frage aus BIL-2523. Jeder Kandidat wird durch die ausgelieferte " +
      "Mathematik gerendert und gegen den UNENCODIERTEN Puffer verglichen, nicht gegen die alte " +
      "Datei. near-lossless q10 spart 16% fuer 4,5px Warp-Fehler, lossy q95 spart 70% fuer 17px — " +
      "bei +-36px Gesamthub loest sich der Druck damit von der Falte. Kein Spielraum.",
    metadata: workspaceRef("apps/storefront/scripts/bil2522-relief-encode-sweep.mjs"),
  },
];
for (const wp of WPS) {
  const res = await fetch(`${API}/api/issues/${ISSUE}/work-products`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify(wp),
  });
  console.log(res.status, wp.title.slice(0, 60), (await res.text()).slice(0, 120));
}
