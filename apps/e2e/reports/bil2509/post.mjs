/**
 * BIL-2509 — Abschlusskommentar + zwei Kind-Tickets fuer die andersartigen Rest-Konfiguratoren.
 *
 * Kommentar-Body wird aus der Datei gelesen und als JSON gepostet (Bash-Heredocs
 * fressen Backticks und $ in Markdown, siehe frueheres Ticket).
 */
import { readFile } from "node:fs/promises";

const BASE = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const RUN = process.env.PAPERCLIP_RUN_ID;
const ISSUE = process.env.BIL2509_ISSUE_ID;

if (!BASE || !KEY || !ISSUE) throw new Error("missing PAPERCLIP_API_URL / PAPERCLIP_API_KEY / BIL2509_ISSUE_ID");

async function api(method, path, payload) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "X-Paperclip-Run-Id": RUN ?? "",
      "Content-Type": "application/json",
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep raw */ }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 400)}`);
  return json;
}

const COMPANY = '723a0156-47d4-4ec0-9d21-81a1cebeb182';
if (!process.env.BIL2509_SKIP_COMMENT) {
  const body = await readFile(new URL('./comment.md', import.meta.url), 'utf8');
  const comment = await api('POST', `/api/issues/${ISSUE}/comments`, { body });
  console.log('comment posted:', comment?.id ?? '(no id)');
}

const CHILDREN = [
  {
    title:
      "Konfigurator Turban + Dreieckstuch: Original-Druck aus der Basis entfernen (Rosen/Zoo scheinen unter jedem Stoff durch)",
    description: `## Befund aus BIL-2509

Beim Realismus-Pass kam heraus, dass Turban und Dreieckstuch eine **andere Architektur** haben als Hose/Hose-kurz/Muetze. Ihre \`base.webp\` ist keine entdruckte Shading-Map, sondern die **rohe Foto-Luminanz**:

    const gray = Math.round(60 + (lum / 255) * 175);

(\`scripts/bil2444-build-turban-assets.mjs\` Zeile ~168, \`scripts/bil2446-build-dreieckstuch-assets.mjs\` Zeile ~80)

Folge: die Falten sind echt — das ist gut und der Grund, warum diese beiden in BIL-2509 unveraendert blieben — aber **der Original-Druck ist mit eingebrannt**. Beim Turban liegen die grauen Rosen sichtbar in der Basis und multiplizieren sich unter *jeden* Stoff, den eine Kundin auswaehlt. Beim Dreieckstuch dasselbe mit dem Zoo-Motiv.

Messung (\`scripts/bil2509-detail-probe.mjs\`): sigma auf Faltenskala turban/turban 23.08, turban/schleife 25.45, dreieckstuch/tuch 26.21 — deutlich hoeher als bei allen anderen Konfiguratoren, was hier aber Druck-Restsignal ist und keine Stofflichkeit.

## Auftrag

Entdruck-Stufe fuer diese beiden, ohne die echten Falten zu verlieren.

- \`foldsFromPhoto\` aus \`scripts/lib/konfigurator-folds.mjs\` macht bereits genau diese Trennung (Chroma-Ausreisser inpainten, dann Bandpass) — hier ist sie aber auf die **Basis selbst** anzuwenden, nicht nur auf den Faltenanteil.
- Vorher pruefen, ob der Deckungsgrad das ueberhaupt hergibt: \`scripts/bil2509-band-probe.mjs\` auf beide Quellen ansetzen. Wenn der Druck zu dicht ist, gilt dasselbe Urteil wie beim Dino-Korpus — dann lieber ehrlich synthetisch als mit Geistern.
- Fallen aus BIL-2509: NIE blur zum Entdrucken; 255 unter multiply = reine Swatch-Farbe (Ridge-Clipping-Outline); Masken nicht gegen die Silhouette federn; Nahtlos-Kachelung aus BIL-2497 liegt UEBER dem Druck und darf nicht angefasst werden.

## Verifikation

\`base.webp\` als PNG dumpen und ansehen — der Druck muss weg und die Falten muessen bleiben. Danach \`scripts/bil2509-evidence.mjs --konfig turban\` bzw. \`--konfig dreieckstuch\` fuer den Vorher/Nachher-Beleg, plus ein heller und ein dunkler Stoff.`,
  },
  {
    title:
      "Konfigurator Body: Basis ist eine gezeichnete Vektorform, kein Foto — Produktfoto von Sabine noetig",
    description: `## Befund aus BIL-2509

Der Body-Konfigurator hat als einziger **gar kein Foto** als Grundlage. Seine \`base.webp\` wird in \`scripts/bil2455-build-body-assets.mjs\` (ab Zeile ~221) von Hand gezeichnet:

    let gray = 150;
    // Subtle shading: ...
    gray += Math.round(hl * hl * HL_STRENGTH);
    if (isHalsbundArr[p]) gray -= 14;

Das Ergebnis ist eine graue Vektorsilhouette mit ein paar Verlaeufen — sichtbar, wenn man die Basis als PNG dumpt.

Messung (\`scripts/bil2509-detail-probe.mjs\`), sigma auf Faltenskala:

    body/hauptteil    2.07
    body/halsbund     3.58
    body/aermelbund   2.35

Zum Vergleich nach dem BIL-2509-Pass: hose/buendchen 16.71, muetze/futter 14.23. Der Body ist mit Abstand der flachste Konfigurator und der einzige, bei dem Patricks „so wie im Originalbild" gar nicht erfuellbar ist — es gibt kein Originalbild.

## Auftrag / Blocker

**Board-Entscheidung noetig:** ein Flat-Lay-Foto des echten Bodys von Sabine, gleiche Aufnahmebedingungen wie Pumphose/Dino-Shorts (neutraler Hintergrund, moeglichst plan ausgelegt, Bund und Baendchen sichtbar). Sobald das da ist, laeuft der Body durch dieselbe Pipeline wie die kurze Hose (\`bil2499-build-dinoshorts-assets.mjs\` ist die naechste Vorlage) und bekommt echte Falten aus dem Foto.

Ohne Foto ist hier nichts zu machen, was den Namen Realismus verdient — deshalb blockiert und nicht stillschweigend offen gelassen.`,
  },
];

for (const child of CHILDREN) {
  const created = await api("POST", `/api/companies/${COMPANY}/issues`, {
    title: child.title,
    description: child.description,
    parentId: ISSUE,
    priority: "medium",
  });
  console.log("child created:", created?.identifier ?? created?.id ?? JSON.stringify(created).slice(0, 200));
}
