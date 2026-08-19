// BIL-2531 — beweist, dass das Scheiben der Kachel NICHTS am Ergebnis aendert.
//
// Die harte Bedingung des Tickets ist "am gerenderten Bild kein Pixel anders".
// Live belegt das der md5-Vergleich der Vorschau (bil2528-swap-visual.mjs). Der
// hier deckt die Haelfte ab, die man offline und deterministisch pruefen kann:
// `buildTile` lief bisher am Stueck, im Browser laeuft es jetzt zeilenweise
// ueber `resampleTileRows` / `rotateTileRows`.
//
// Die Behauptung ist "die Partitionierung ist egal". Ein Lauf mit EINER festen
// Aufteilung wuerde das nicht zeigen — geprueft werden deshalb pro Rotation
// mehrere pseudo-zufaellige Aufteilungen gegen den Einzelaufruf.
//
// Und ein Test, der nur bestehen kann, ist kein Test: `--selftest` verlangt ein
// FAIL. Es laesst absichtlich eine Zeile aus; meldet der Vergleich das nicht,
// ist der Vergleich kaputt und alle gruenen Zeilen darueber sind wertlos.
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const STOREFRONT = resolve(HERE, "../../storefront");

const math = await import(
  new URL(
    `file://${resolve(STOREFRONT, "src/app/konfigurator/_shared/relief-math.mjs").replaceAll("\\", "/")}`,
  ).href
);
const { buildTile, resampleTileRows, rotateTileRows, rotatedTileSize } = math;

const { default: sharp } = await import(
  new URL(`file://${resolve(STOREFRONT, "node_modules/sharp/lib/index.js").replaceAll("\\", "/")}`)
    .href
);

const md5 = (b) => createHash("md5").update(Buffer.from(b.buffer, b.byteOffset, b.byteLength)).digest("hex");

/** Deterministischer PRNG — ein Lauf mit anderen Grenzen waere kein Beleg. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Zufaellige, lueckenlose Aufteilung von [0,total) in Baender. */
function partition(total, next) {
  const cuts = [];
  let y = 0;
  while (y < total) {
    y = Math.min(total, y + 1 + Math.floor(next() * 97));
    cuts.push(y);
  }
  return cuts;
}

/** Der Browser-Pfad aus relief-layer.tsx, ohne die await-Pausen dazwischen. */
function buildTileSliced(src, sw, sh, stride, px, rotation, bands, { skipRow = -1 } = {}) {
  const scaled = new Uint8ClampedArray(px * px * 3);
  let y = 0;
  for (const end of bands.resample) {
    const from = y === skipRow ? Math.min(end, y + 1) : y;
    resampleTileRows(scaled, src, sw, sh, stride, px, px, from, end);
    y = end;
  }
  const { TW, TH } = rotatedTileSize(px, px, rotation);
  if (rotation % 360 === 0) return { data: scaled, TW, TH, stride: 3 };
  const turned = new Uint8ClampedArray(TW * TH * 3);
  y = 0;
  for (const end of bands.rotate) {
    rotateTileRows(turned, scaled, px, px, TW, rotation, y, end);
    y = end;
  }
  return { data: turned, TW, TH, stride: 3 };
}

const selftest = process.argv.includes("--selftest");

const { data, info } = await sharp(resolve(STOREFRONT, "public/stoffe/stoff-15.webp"))
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
console.log(`Quelle stoff-15.webp ${info.width}x${info.height}x${info.channels}`);

// Beide Strides, weil die zwei Aufrufer sich genau darin unterscheiden: der
// Node-Renderer reicht sharp-RGB (3) herein, der Browser ImageData-RGBA (4).
const rgba = new Uint8ClampedArray(info.width * info.height * 4);
for (let p = 0; p < info.width * info.height; p++) {
  rgba[p * 4] = data[p * 3];
  rgba[p * 4 + 1] = data[p * 3 + 1];
  rgba[p * 4 + 2] = data[p * 3 + 2];
  rgba[p * 4 + 3] = 255;
}

// 378 = tilePx(900, scale 1), die Groesse der Hose-Vorschau. 355 = scale 0.94
// (buendchen) und faellt nicht glatt auf, deckt also den Rest-Zeilen-Fall ab.
const SIZES = [378, 355];
const ROTATIONS = [0, 90, 180, 270];
const PARTITIONS = 4;

let checks = 0;
let failures = 0;

for (const [label, src, stride] of [
  ["rgb ", data, 3],
  ["rgba", rgba, 4],
]) {
  for (const px of SIZES) {
    for (const rotation of ROTATIONS) {
      const one = buildTile(src, info.width, info.height, stride, px, rotation);
      const want = md5(one.data);
      for (let k = 0; k < PARTITIONS; k++) {
        const next = rng(0x2531 + k * 7919 + px * 31 + rotation);
        const bands = { resample: partition(px, next), rotate: partition(px, next) };
        const got = buildTileSliced(src, info.width, info.height, stride, px, rotation, bands);
        checks++;
        const same =
          got.TW === one.TW && got.TH === one.TH && md5(got.data) === want;
        if (!same) {
          failures++;
          console.log(
            `FAIL ${label} px=${px} rot=${rotation} p${k}: ${md5(got.data)} != ${want}`,
          );
        }
      }
      console.log(
        `ok   ${label} px=${px} rot=${rotation}  ${one.TW}x${one.TH}  md5 ${want.slice(0, 12)}  (${PARTITIONS} Aufteilungen)`,
      );
    }
  }
}

if (selftest) {
  // Muss rot werden. Eine ausgelassene Zeile ist der kleinste Fehler, den das
  // Scheiben ueberhaupt machen kann.
  const px = 378;
  const one = buildTile(data, info.width, info.height, 3, px, 90);
  const next = rng(0xbadc0de);
  const bands = { resample: partition(px, next), rotate: partition(px, next) };
  const broken = buildTileSliced(data, info.width, info.height, 3, px, 90, bands, {
    skipRow: bands.resample.length > 1 ? 0 : -1,
  });
  const caught = md5(broken.data) !== md5(one.data);
  console.log(`selftest: ausgelassene Zeile ${caught ? "ERKANNT (ok)" : "NICHT ERKANNT"}`);
  if (!caught) {
    console.log("SELFTEST FAILED — der Vergleich beweist nichts.");
    process.exit(2);
  }
}

console.log(`\n${checks - failures}/${checks} Vergleiche bit-identisch`);
process.exit(failures === 0 ? 0 : 1);
