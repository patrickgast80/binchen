/**
 * BIL-2492 — one-off codemod that wires the fabric rotation into the four
 * konfigurator clients that share the Hose's structure (the Hose itself was
 * edited by hand as the reference implementation).
 *
 * Kept in the repo so the next person can see exactly which mechanical edit
 * was applied to four near-identical files instead of diffing them by eye.
 * Idempotent: re-running is a no-op once `ROTATION_PARAM` is imported.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "src", "app", "konfigurator");

/** file, main fabric zone param + its default swatch, and the zone's UI label. */
const TARGETS = [
  {
    file: "body/body-konfigurator.tsx",
    id: "body",
    mainParam: "hauptteil",
    mainDefault: "cream",
    zoneLabel: "Hauptteil",
    regionsConst: "BODY_REGIONS",
    regionType: "BodyRegionDef",
  },
  {
    file: "turban/turban-konfigurator.tsx",
    id: "turban",
    mainParam: "turban",
    mainDefault: "cream",
    zoneLabel: "Turban",
    regionsConst: "TURBAN_REGIONS",
    regionType: "TurbanRegionDef",
  },
  {
    file: "muetze/muetze-konfigurator.tsx",
    id: "muetze",
    mainParam: "muetze",
    mainDefault: "sage",
    zoneLabel: "Mütze",
    regionsConst: "MUETZE_REGIONS",
    regionType: "MuetzeRegionDef",
  },
  {
    file: "dreieckstuch/dreieckstuch-konfigurator.tsx",
    id: "dreieckstuch",
    mainParam: "tuch",
    mainDefault: "powder-pink",
    zoneLabel: "Tuch",
    regionsConst: "DREIECKSTUCH_REGIONS",
    regionType: "DreieckstuchRegionDef",
  },
];

function must(src, next, what, file) {
  if (src === next) throw new Error(`${file}: no change for "${what}"`);
  return next;
}

for (const t of TARGETS) {
  const full = path.join(ROOT, t.file);
  const raw = readFileSync(full, "utf8");
  // The checkout is on Windows, so these files are CRLF on disk. Normalise for
  // matching and restore the original ending on write — otherwise every anchor
  // that spans a line break silently fails to match.
  const crlf = raw.includes("\r\n");
  let s = crlf ? raw.replace(/\r\n/g, "\n") : raw;
  if (s.includes("ROTATION_PARAM")) {
    console.log(`skip (already wired): ${t.file}`);
    continue;
  }

  // 1) imports
  s = must(
    s,
    s.replace(
      'import { SavedConfigsSection } from "../_shared/saved-configs-section";',
      'import { SavedConfigsSection } from "../_shared/saved-configs-section";\n' +
        'import { MusterRotationControl } from "../_shared/muster-rotation-control";\n' +
        "import {\n" +
        "  ROTATION_PARAM,\n" +
        "  nextRotation,\n" +
        "  parseRotation,\n" +
        "  rotationLabel,\n" +
        '} from "../_shared/rotation";',
    ),
    "imports",
    t.file,
  );

  // 2) read the rotation off the query string
  s = must(
    s,
    s.replace(
      "  const selection = React.useMemo(() => buildSelection(searchParams), [searchParams]);\n",
      "  const selection = React.useMemo(() => buildSelection(searchParams), [searchParams]);\n" +
        "  // BIL-2492 — quarter turn for the fabric print. Lives in the query string so\n" +
        "  // shared links and saved configurations carry it like every colour choice.\n" +
        "  const rotation = parseRotation(searchParams?.get(ROTATION_PARAM));\n",
    ),
    "rotation state",
    t.file,
  );

  // 3) feed it into the paints + expose whether the main zone carries a print
  s = must(
    s,
    s
      .replace(
        "      return { hex: s.hex, textureSrc: s.textureSrc };\n    };",
        "      return { hex: s.hex, textureSrc: s.textureSrc, rotation };\n    };",
      )
      .replace(
        `    return { ${t.mainParam}: { hex: s.hex, textureSrc: s.textureSrc } };`,
        `    return { ${t.mainParam}: { hex: s.hex, textureSrc: s.textureSrc, rotation } };`,
      ),
    "paints",
    t.file,
  );
  s = must(
    s,
    s.replace(
      "  }, [selection]);\n\n  const updateRegion",
      "  }, [rotation, selection]);\n\n" +
        "  /** True while the main zone actually carries a print worth rotating. */\n" +
        `  const hasFabric = Boolean(resolveSwatch(selection.${t.mainParam}, "${t.mainDefault}").textureSrc);\n\n` +
        "  const updateRegion",
    ),
    "paints deps",
    t.file,
  );

  // 4) the rotate handler, mirroring updateRegion's URL handling
  s = must(
    s,
    s.replace(
      "  const handleReset = React.useCallback(() => {",
      "  const handleRotate = React.useCallback(() => {\n" +
        '    const next = new URLSearchParams(searchParams?.toString() ?? "");\n' +
        "    const value = nextRotation(rotation);\n" +
        "    if (value === 0) next.delete(ROTATION_PARAM);\n" +
        "    else next.set(ROTATION_PARAM, String(value));\n" +
        "    const query = next.toString();\n" +
        "    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });\n" +
        '    setLastChanged({ region: "Muster", swatch: `${rotationLabel(value)} gedreht` });\n' +
        '    setShareStatus("idle");\n' +
        "  }, [pathname, rotation, router, searchParams]);\n\n" +
        "  const handleReset = React.useCallback(() => {",
    ),
    "handleRotate",
    t.file,
  );

  // 5) a rotated print is a non-default state — keep Zurücksetzen reachable
  s = must(
    s,
    s.replace(
      "  const showReset = !isDefaultSelection(selection);",
      "  const showReset = !isDefaultSelection(selection) || rotation !== 0;",
    ),
    "showReset",
    t.file,
  );

  // 6) desktop control, first in the action row under the preview
  s = must(
    s,
    s.replace(
      // The share <Button> is formatted on one line in some files and wrapped in
      // others, so anchor on the wrapper div and keep whatever follows.
      /( *)<div className="flex flex-wrap gap-2">\n/,
      (_m, indent) =>
        `${indent}<div className="flex flex-wrap gap-2">\n` +
        `${indent}  {hasFabric && (\n` +
        `${indent}    <MusterRotationControl\n` +
        `${indent}      rotation={rotation}\n` +
        `${indent}      onRotate={handleRotate}\n` +
        `${indent}      zoneLabel="${t.zoneLabel}"\n` +
        `${indent}    />\n` +
        `${indent}  )}\n`,
    ),
    "action row",
    t.file,
  );

  // 7) saved configs render the rotated thumbnail
  s = must(
    s,
    s.replace(
      `            konfigurator="${t.id}"\n            selection={selection}\n`,
      `            konfigurator="${t.id}"\n            selection={selection}\n            rotation={rotation}\n`,
    ),
    "saved configs",
    t.file,
  );

  // 8) orientation travels with the order
  s = must(
    s,
    s.replace(
      '            <input\n              type="hidden"\n              name="configHref"',
      "            {/* Orientation travels with the order so the cart line — and Sabine's\n" +
        "                sewing note — say which way the print runs. */}\n" +
        '            <input type="hidden" name="musterRotation" value={String(rotation)} />\n' +
        '            <input\n              type="hidden"\n              name="configHref"',
    ),
    "cart field",
    t.file,
  );

  // 9) mobile sheet gets the same control in the thumb zone
  s = must(
    s,
    s.replace(
      `      <MobilePaletteSheet\n        regions={${t.regionsConst}}\n        selection={selection}\n`,
      `      <MobilePaletteSheet\n        regions={${t.regionsConst}}\n        selection={selection}\n        rotation={rotation}\n        onRotate={handleRotate}\n`,
    ),
    "mobile sheet",
    t.file,
  );

  writeFileSync(full, crlf ? s.replace(/\n/g, "\r\n") : s);
  console.log(`wired: ${t.file}`);
}
