/**
 * BIL-2533 — was macht das Displacement auf hose-kurz eigentlich?
 *
 * Patricks Vorwurf ist "keine Falte, Stoff glatt drübergelegt". Die Kontrolle
 * (Relief-Ebene aus, apps/e2e/scripts/bil2533-live-repro.mjs) beweist, dass
 * Pass 2 die Streifen ÜBERHAUPT bewegt — sie sagt aber nicht, ob die Bewegung
 * groß genug ist, um als Falte gelesen zu werden. Genau das misst dieses
 * Skript, pro Zone, und stellt die Zahl der Streifen-Geometrie gegenüber:
 *
 *   Eine Falte ist sichtbar, wenn das Muster ÜBER DIE FALTENBREITE genug
 *   Versatz-DIFFERENZ aufsammelt. Ein konstanter Versatz verschiebt das ganze
 *   Muster und fällt niemandem auf; erst die lokale Variation verbiegt einen
 *   Streifen. Deshalb ist die Kennzahl nicht mean|D|, sondern die
 *   Standardabweichung von D über eine Faltenbreite.
 *
 *   node scripts/bil2533-measure-warp.mjs [konfig...]
 */
import sharp from "sharp";
import path from "node:path";

import { KONFIGS } from "./bil2509-composite.mjs";
import { WARP_RANGE, TILE_PERCENT } from "../src/app/konfigurator/_shared/relief-math.mjs";

const ids = process.argv.slice(2).length ? process.argv.slice(2) : ["hose-kurz", "hose", "turban", "muetze", "dreieckstuch"];

/** Fensterradius, über den ein Streifen "eine Falte breit" ist, in px. */
const WIN = 40;

async function raw(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height };
}

for (const id of ids) {
  const k = KONFIGS[id];
  const dir = path.join("public/konfigurator", k.dir);
  const { data: rel, W, H } = await raw(path.join(dir, "relief.webp"));

  // Zonenmasken dieses Konfigurators einsammeln.
  const zones = [];
  for (const name of k.zones ?? []) {
    try {
      const m = await raw(path.join(dir, `mask-${name}.webp`));
      zones.push({ name, alpha: m.data });
    } catch {
      /* Maske fehlt -> Zone überspringen */
    }
  }

  console.log(`\n=== ${id}  ${W}x${H}  Kachel ${Math.round((TILE_PERCENT / 100) * W)}px ===`);
  for (const z of zones) {
    const dx = new Float32Array(W * H);
    const dy = new Float32Array(W * H);
    const inZone = new Uint8Array(W * H);
    let n = 0;
    let sumAbs = 0;
    let shadeSum = 0;
    let shadeMin = 1;
    let shadeMax = 0;
    for (let p = 0; p < W * H; p++) {
      if (z.alpha[p * 4 + 3] < 200) continue;
      inZone[p] = 1;
      dx[p] = ((rel[p * 4] - 128) / 127) * WARP_RANGE;
      dy[p] = ((rel[p * 4 + 1] - 128) / 127) * WARP_RANGE;
      const sh = rel[p * 4 + 2] / 255;
      shadeSum += sh;
      shadeMin = Math.min(shadeMin, sh);
      shadeMax = Math.max(shadeMax, sh);
      sumAbs += Math.hypot(dx[p], dy[p]);
      n++;
    }
    if (!n) continue;

    // Lokale Streuung: wie stark variiert der Versatz INNERHALB eines Fensters
    // von WIN px? Das ist die Größe, die einen Streifen sichtbar verbiegt.
    let locSum = 0;
    let locN = 0;
    let locMax = 0;
    for (let y = WIN; y < H - WIN; y += 12) {
      for (let x = WIN; x < W - WIN; x += 12) {
        const p = y * W + x;
        if (!inZone[p]) continue;
        let mx = 0;
        let my = 0;
        let c = 0;
        for (let j = -WIN; j <= WIN; j += 8) {
          for (let i = -WIN; i <= WIN; i += 8) {
            const q = (y + j) * W + (x + i);
            if (!inZone[q]) continue;
            mx += dx[q];
            my += dy[q];
            c++;
          }
        }
        if (c < 12) continue;
        mx /= c;
        my /= c;
        let v = 0;
        for (let j = -WIN; j <= WIN; j += 8) {
          for (let i = -WIN; i <= WIN; i += 8) {
            const q = (y + j) * W + (x + i);
            if (!inZone[q]) continue;
            v += (dx[q] - mx) ** 2 + (dy[q] - my) ** 2;
          }
        }
        const sd = Math.sqrt(v / c);
        locSum += sd;
        locN++;
        locMax = Math.max(locMax, sd);
      }
    }
    console.log(
      `  ${z.name.padEnd(11)} px=${String(n).padStart(7)}  |D|mean=${(sumAbs / n).toFixed(2)}px  ` +
      `lokal-SD(${WIN * 2}px)=${(locSum / Math.max(1, locN)).toFixed(2)}px  max=${locMax.toFixed(2)}px  ` +
      `shade ${shadeMin.toFixed(2)}..${shadeMax.toFixed(2)} mean=${(shadeSum / n).toFixed(3)}`,
    );
  }
}
