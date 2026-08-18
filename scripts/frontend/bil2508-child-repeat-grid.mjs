// BIL-2508 → Kind-Issue: zweite, eigenständige Fehlerklasse, die bei der
// Systemprüfung aller 35 Stoffe aufgefallen ist.
//
// BIL-2508 hat die *Naht* repariert. Bei vier Stoffen mit ausgewaschenem
// Grund (Jeans-/Aquarellwäsche) ist die Naht danach sauber, aber der Grund
// selbst wiederholt sich sichtbar — das ist kein Nahtproblem und lässt sich
// mit keiner Nahtmethode lösen. Deshalb eigenes Ticket statt Scope-Ausweitung.
const KEY = process.env.PAPERCLIP_API_KEY;
const BASE = process.env.PAPERCLIP_API_URL || "http://127.0.0.1:3100";
const CID = process.env.PAPERCLIP_COMPANY_ID;
const PARENT = "dbff9b28-ee14-4002-aca2-e3598fe1b9f0"; // BIL-2508
const H = { Authorization: "Bearer " + KEY, "Content-Type": "application/json" };

const description = `## Kontext

Bei der Systemprüfung aller 35 Stoffe in BIL-2508 (Belege: \`apps/e2e/reports/bil2508/sheets/grid-after-{0,1,2}.webp\`) blieb eine **zweite Fehlerklasse** übrig, die BIL-2508 bewusst nicht angefasst hat, weil sie eine andere Ursache hat:

**stoff-05, stoff-06, stoff-15, stoff-19** — die Naht ist sauber (kein Versatz, keine Chevrons), aber der **ausgewaschene Grund selbst wiederholt sich sichtbar**. Bei stoff-18/19 ist es die Jeans-Waschung, bei stoff-05/06 die Aquarell-Wolke. Jede Kachel zeigt dieselbe helle bzw. dunkle Wolke an derselben Stelle, und ab der zweiten Wiederholung liest das Auge daraus ein Raster.

Das ist **kein Nahtproblem**. Es lässt sich mit keiner Nahtmethode lösen — die Naht ist ja schon unsichtbar. Es ist die Wiederholung des Inhalts.

## Was schon ausgeschlossen ist (nicht nochmal probieren)

- **Flat-Field höherer Ordnung.** Die Vermutung "das ist Beleuchtung, ein stärkeres Flat-Field bügelt es weg" wurde geprüft: Polynom-Ordnung 2 gegen 4 gegen 6, Beleg \`apps/e2e/reports/bil2508/sheets/flatorder-stoff-18.webp\` und \`-stoff-31.webp\`. **Ändert nichts.** Die Wolken sind Teil des Drucks, nicht der Ausleuchtung — deshalb kann eine Beleuchtungskorrektur sie per Konstruktion nicht entfernen.
- **Blur / Weichzeichnen.** Tötet die Faltenstruktur, auf die der multiply/screen-Stack angewiesen ist (BIL-2444ff.).
- **Spiegel-Kachelung.** Die Kollektion hat gerichtete Drucke; ein gespiegelter Rapport erzeugt Schmetterlings-Artefakte.

## Lösungsrichtungen (eine entscheiden, nicht alle bauen)

1. **Größere Kachel auf dem Bildschirm.** Bei ~190 CSS px pro Kachel (BIL-2493 gemessen) liegen 2–3 Wiederholungen über dem Hosenbein. Bei ~300 px wäre es etwa eine — dann sieht man das Raster nicht mehr, aber der Druck wird größer als er in echt ist. **Designentscheidung, gehört ans Board.**
2. **Mosaik statt Rapport.** Statt einer Kachel mehrere Varianten derselben Kachel (verschoben/rotiert) versetzt nebeneinander legen. Bricht das Raster, kostet aber Bytes auf dem LCP-Pfad und braucht eine neue Render-Ebene.
3. **Breitere Stofffotos von Sabine.** Ein Foto, das zwei bis drei Rapporte des Drucks zeigt, macht die Kachel groß genug, dass die Wäsche nicht mehr als Einzelmotiv wiedererkennbar ist. Sauberste Lösung, braucht aber Zulieferung.

## Priorität

Niedriger als BIL-2508: das war eine erfundene Geometrie (Chevrons, die es im Stoff nicht gibt), das hier ist ein echter Rapport, der nur enger sitzt als bei echtem Stoff. Vier von 35 Stoffen betroffen, davon keiner in Patricks bisherigen Reklamationen.

## Verifikation

Wie BIL-2508: 3×3-Kachelbelege vorher/nachher plus Live-Check auf bilulu.de bei 390x844 und 1440x900, Byte-Vergleich der deployten Kachel bevor ein Screenshot zählt.`;

const create = async () => {
  const res = await fetch(`${BASE}/api/companies/${CID}/issues`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      // parentId in the CREATE body — a post-hoc PATCH races a sibling run.
      parentId: PARENT,
      title: "Konfigurator: ausgewaschene Stoffgründe zeigen sichtbares Wiederhol-Raster (stoff-05/06/15/19)",
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
