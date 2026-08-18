/**
 * BIL-2497 — live-Gegenprobe auf bilulu.de: sind die Stoffdrucke nahtlos?
 *
 * Bewusst NICHT screenshot-getrieben. Ein voller Seiten-Screenshot versteckt
 * die Naht (BIL-2492-Lehre: Cookie-Banner und fixes Mobile-Sheet liefern still
 * identische "Belege"), und die Naht ist im Preview nur ein paar Pixel breit.
 * Stattdessen:
 *
 *   1. Die deployte Kachel-Datei selbst holen und die Naht-Energie messen —
 *      also den Byte, den der Browser wirklich tiled. Ein Deploy, der die alte
 *      Kachel ausliefert, faellt hier sofort auf.
 *   2. Die Kachel so wiederholen wie es die CSS tut und den Crop genau auf die
 *      Wiederhol-Grenze legen, bei 0 Grad und bei 90 Grad (BIL-2492).
 *   3. Die OG-Karte je Konfigurator ziehen und pruefen, dass sie ein echtes PNG
 *      ist und den Stoff-Pfad genommen hat (x-og-photo-Header, ...F = Fabric-
 *      Zonen). next/og scheitert bei WebP still — deshalb der Byte-Check.
 *
 *   node scripts/bil2497-live-verify.mjs [baseUrl] [outDir]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { decodeRaw, seamEnergy } from "../../storefront/scripts/bil2497-seamless-lib.mjs";

const BASE = process.argv[2] ?? "https://bilulu.de";
const OUT = process.argv[3] ?? path.join(process.cwd(), "reports", "bil2497-live");

/** Repraesentative Stichprobe: Patricks Blumenstoff, gerichtete Prints, Streifen, Punkte. */
const FABRICS = [
  { id: "stoff-30", note: "Blumen dunkel — der Stoff aus Patricks Foto" },
  { id: "stoff-04", note: "gerichteter Print (Einhoerner/Monde)" },
  { id: "stoff-15", note: "gerichteter Print (Einhoerner auf Jeans)" },
  { id: "stoff-20", note: "Streifen kraeftig" },
  { id: "stoff-08", note: "Streifen fein" },
  { id: "stoff-19", note: "Punkte/Herzen — Kontrolle, war schon nahtlos" },
];

/** Alle fuenf Konfiguratoren, mit ihrem Hauptstoff-Param. */
const KONFIGS = [
  { id: "hose", param: "hose" },
  { id: "body", param: "hauptteil" },
  { id: "turban", param: "turban" },
  { id: "muetze", param: "muetze" },
  { id: "dreieckstuch", param: "tuch" },
];

/** Muss TILE_PERCENT in zone-overlay.tsx entsprechen — die echte Paint-Groesse. */
const PAINT = 260;

async function tiledCrop(buf, rotation) {
  const rotated = rotation ? await sharp(buf).rotate(rotation).toBuffer() : buf;
  const tile = await sharp(rotated).resize(PAINT, PAINT, { fit: "fill" }).png().toBuffer();
  const full = await sharp({
    create: { width: PAINT * 3, height: PAINT * 3, channels: 3, background: "#000" },
  })
    .composite([{ input: tile, tile: true }])
    .png()
    .toBuffer();
  const half = Math.round(PAINT * 0.9);
  const crop = await sharp(full)
    .extract({ left: PAINT * 2 - half, top: PAINT * 2 - half, width: half * 2, height: half * 2 })
    .png()
    .toBuffer();
  const w = half * 2;
  const svg = `<svg width="${w}" height="${w}" xmlns="http://www.w3.org/2000/svg">
  <line x1="${w / 2}" y1="0" x2="${w / 2}" y2="${w}" stroke="#ff2d55" stroke-dasharray="7 7"/>
  <line x1="0" y1="${w / 2}" x2="${w}" y2="${w / 2}" stroke="#ff2d55" stroke-dasharray="7 7"/>
</svg>`;
  return sharp(crop).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const failures = [];
  const results = { base: BASE, fabrics: [], og: [] };

  for (const f of FABRICS) {
    const url = `${BASE}/stoffe/${f.id}.webp`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      failures.push(`${f.id}: HTTP ${res.status}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buf).metadata();
    const energy = seamEnergy(await decodeRaw(buf));
    const worst = Math.max(energy.x, energy.y);
    // 2.0 ist grosszuegig: unter ~2 liegt die Wiederhol-Kante in derselben
    // Groessenordnung wie jede andere Pixelkante im Stoff, also unsichtbar.
    // Glatte, kontrastarme Stoffe ziehen das Verhaeltnis hoch, ohne dass eine
    // Kante zu sehen waere — deshalb zusaetzlich die Crops als Augenschein.
    if (worst > 2.0) failures.push(`${f.id}: Naht-Energie ${worst.toFixed(2)}x > 2.0`);

    for (const rot of [0, 90]) {
      await writeFile(
        path.join(OUT, `${f.id}${rot ? `-rot${rot}` : ""}-live-tile.png`),
        await tiledCrop(buf, rot),
      );
    }
    results.fabrics.push({
      ...f,
      bytes: buf.byteLength,
      size: `${meta.width}x${meta.height}`,
      format: meta.format,
      seam: { x: +energy.x.toFixed(3), y: +energy.y.toFixed(3) },
    });
    console.log(
      `  ${f.id}  ${meta.width}x${meta.height} ${meta.format} ${(buf.byteLength / 1024).toFixed(1)} kB  ` +
        `Naht x ${energy.x.toFixed(2)} y ${energy.y.toFixed(2)}`,
    );
  }

  console.log("\nOG-Karten:");
  for (const k of KONFIGS) {
    for (const rot of [0, 90]) {
      const url = `${BASE}/api/og/konfig/${k.id}?${k.param}=stoff-30${rot ? `&rot=${rot}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      const trace = res.headers.get("x-og-photo") ?? "-";
      const buf = Buffer.from(await res.arrayBuffer());
      let format = "?";
      try {
        format = (await sharp(buf).metadata()).format ?? "?";
      } catch {
        format = "undecodable";
      }
      const ok = res.ok && format === "png" && /:[1-9]\d*F:/.test(trace);
      if (!ok) failures.push(`OG ${k.id} rot${rot}: status=${res.status} format=${format} trace=${trace}`);
      await writeFile(path.join(OUT, `og-${k.id}${rot ? `-rot${rot}` : ""}.png`), buf);
      results.og.push({ konfig: k.id, rot, status: res.status, format, trace, bytes: buf.byteLength });
      console.log(`  ${k.id} rot${rot}  ${res.status} ${format} ${(buf.byteLength / 1024).toFixed(0)} kB  ${trace}`);
    }
  }

  results.failures = failures;
  await writeFile(path.join(OUT, "result.json"), JSON.stringify(results, null, 2) + "\n", "utf8");
  console.log(`\n→ ${OUT}`);
  if (failures.length) {
    console.error(`\nFEHLER (${failures.length}):`);
    for (const f of failures) console.error(`  ✕ ${f}`);
    process.exit(1);
  }
  console.log("\nAlle Checks gruen.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
