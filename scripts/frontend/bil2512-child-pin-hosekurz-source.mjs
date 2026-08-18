// BIL-2512 → Kind-Issue: dieselbe Fehlerklasse, anderer Konfigurator.
//
// BIL-2512 hat die Quellfotos von Turban und Dreieckstuch gepinnt, weil eine
// Katalog-Normalisierung sie überschrieben und die Rebuilds still kaputtgemacht
// hatte. Bei hose-kurz ist die Quelle gar nicht im Repo, sondern ein lokaler
// Desktop-Pfad. Nicht kaputt, aber genauso wenig reproduzierbar — eigenes
// Ticket statt Scope-Ausweitung, weil es einen Konfigurator betrifft, den
// BIL-2512 nicht anfassen sollte.
const KEY = process.env.PAPERCLIP_API_KEY;
const BASE = process.env.PAPERCLIP_API_URL || "http://127.0.0.1:3100";
const CID = process.env.PAPERCLIP_COMPANY_ID;
const PARENT = process.env.BIL2512_ID;
const H = { Authorization: "Bearer " + KEY, "Content-Type": "application/json" };

const description = `## Befund aus BIL-2512

BIL-2512 hat einen stillen Reproduzierbarkeits-Bug gefunden: \`bil2444-build-turban-assets.mjs\` und \`bil2446-build-dreieckstuch-assets.mjs\` lasen ihr Quellfoto aus \`public/products/…\`, und Commit \`b576357\` ("BIL-2455 followup — uniform product-photo backgrounds") hat genau diese Dateien auf eine einheitliche 1200x1200-Leinwand umgesetzt. Der Hintergrund-Flood-Fill keyt auf das originale kühle Studiograu und trifft die neue Matte nicht — Ergebnis: nichts wird freigestellt, \`base.webp\` kommt als graues Vollquadrat heraus, **Exit-Code 0**. Gefixt durch Pinnen unter \`apps/storefront/scripts/sources/\`.

Beim Aufräumen geprüft, welche Builder sonst noch betroffen sind:

| Konfigurator | Quelle | Stand |
| --- | --- | --- |
| turban, dreieckstuch | war \`public/products/\` | gepinnt in BIL-2512 |
| hose (bil2417), muetze (bil2445) | \`public/products/\` | **unkritisch** — in BIL-2509 nach \`b576357\` neu gebaut, beide bauen byte-identisch nach (\`md5sum -c\` verifiziert) |
| **hose-kurz (bil2499)** | \`C:/Users/Besitzer/Desktop/bilulu/bilder bearbeitet/09712b22-….jpeg\` | **offen — diese Ticket** |

## Auftrag

\`scripts/bil2499-build-dinoshorts-assets.mjs\` liest per Default aus einem lokalen Desktop-Pfad (überschreibbar per \`BIL2499_SRC\`). Auf jeder anderen Maschine und in jedem CI-Lauf ist dieser Pfad leer — der Konfigurator lässt sich dort also nicht neu bauen, und niemand merkt es, bis jemand es versucht.

- Quellfoto nach \`apps/storefront/scripts/sources/\` kopieren (liegt unter \`scripts/\`, also nicht im Next-Bundle — kostet zur Laufzeit nichts).
- \`SRC\` darauf zeigen lassen, \`BIL2499_SRC\`-Override behalten.
- Zeile in \`scripts/sources/README.md\` ergänzen.

Gleiche Prüfung wie in BIL-2512 machen: \`scripts/bil2509-band-probe.mjs\` liest denselben Desktop-Pfad hart kodiert und sollte mitgezogen werden.

## Verifikation

Der Beleg, dass die gepinnte Quelle die richtige ist, ist **nicht** "sieht gleich aus": vor dem Rebuild \`md5sum public/konfigurator/hose-kurz-foto/* > before.md5\`, danach \`md5sum -c before.md5\`. Es müssen **alle** Dateien byte-identisch sein, weil dieses Ticket nichts am Aussehen ändern soll. Wenn eine abweicht, ist die gepinnte Quelle nicht die, aus der die ausgelieferten Assets gebaut wurden.

## Priorität

Niedrig — nichts ist kaputt, es ist eine Zeitbombe. Sie zündet erst, wenn jemand die Assets neu bauen muss und der Desktop-Pfad nicht existiert.`;

const create = async () => {
  if (!PARENT) {
    console.error("BIL2512_ID env missing");
    process.exit(1);
  }
  const res = await fetch(`${BASE}/api/companies/${CID}/issues`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      // parentId in the CREATE body — a post-hoc PATCH races a sibling run.
      parentId: PARENT,
      title: "Konfigurator hose-kurz: Quellfoto liegt nur auf einem lokalen Desktop-Pfad, Rebuild ausserhalb dieser Maschine unmoeglich",
      description,
      status: "backlog",
      priority: "low",
      workMode: "standard",
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error("create failed", res.status, body.slice(0, 500));
    process.exit(1);
  }
  const issue = JSON.parse(body);
  console.log("created", issue.identifier || issue.id, issue.id);
};

create();
