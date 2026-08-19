// BIL-2531 — beweist, dass der neue Decode-Pfad dieselben Pixel liefert.
//
// Die Aenderung tauscht `new Image() + img.decode()` gegen
// `createImageBitmap(blob)`, damit der Decode auf einem Worker-Thread laeuft.
// Das ist genau die Sorte Aenderung, bei der stillschweigend Farbraum- oder
// Premultiply-Konvertierung dazwischenfunkt: das Bild sieht "gleich" aus und
// einzelne Kanaele sind um 1 daneben. Ein Screenshot-md5 der Vorschau wuerde
// das zwar auch fangen, aber erst am Ende der ganzen Kette und ohne zu sagen,
// welches Asset schuld war.
//
// Dieses Skript vergleicht deshalb direkt an der Quelle: fuer JEDES der drei
// Assets, die die Relief-Ebene laedt, wird dasselbe Canvas einmal ueber den
// alten und einmal ueber den neuen Pfad befuellt und die volle RGBA-Rueckgabe
// Byte fuer Byte verglichen. Laeuft im echten Browser gegen die echte Datei —
// eine Node-Nachbildung wuerde einen anderen Decoder benutzen und nichts
// beweisen.
//
// `--selftest` verlangt einen Fehlschlag: ein einzelnes absichtlich
// verfaelschtes Byte MUSS erkannt werden, sonst prueft der Vergleich nichts.
//
// Aufruf:  node scripts/bil2531-decode-equivalence.mjs [baseUrl] [--selftest]
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../reports/bil2531");
mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const SELFTEST = args.includes("--selftest");
const BASE = args.find((a) => !a.startsWith("--")) ?? "https://bilulu.de";

// Exakt die Assets, die `hose?hose=stoff-15&bund=sage` durch `decodeImage`
// schickt: Relief-Karte, Zonenmaske, Stoff-Kachel. Andere Groessen, anderer
// Alpha-Gehalt, anderer Encoder-Pfad — die drei decken den Fall ab.
const ASSETS = [
  "/konfigurator/hose-foto/relief.webp",
  "/konfigurator/hose-foto/mask-hose.webp",
  "/stoffe/stoff-15.webp",
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
const page = await ctx.newPage();
// Irgendeine Seite derselben Origin, damit die Fetches same-origin sind.
await page.goto(`${BASE}/konfigurator/hose`, { waitUntil: "domcontentloaded", timeout: 90000 });

const results = await page.evaluate(
  async ({ assets, selftest }) => {
    function scratch(w, h) {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      return c.getContext("2d", { willReadFrequently: true });
    }

    async function viaImgElement(src) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = src;
      await img.decode();
      const ctx2 = scratch(img.naturalWidth, img.naturalHeight);
      ctx2.drawImage(img, 0, 0);
      return ctx2.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
    }

    async function viaImageBitmap(src) {
      const res = await fetch(src, { credentials: "same-origin" });
      const bmp = await createImageBitmap(await res.blob());
      const ctx2 = scratch(bmp.width, bmp.height);
      ctx2.drawImage(bmp, 0, 0);
      bmp.close();
      return ctx2.getImageData(0, 0, ctx2.canvas.width, ctx2.canvas.height);
    }

    const out = [];
    for (const src of assets) {
      let err = null;
      let same = false;
      let firstDiff = null;
      let w = 0;
      let h = 0;
      let diffs = 0;
      try {
        const a = await viaImgElement(src);
        const b = await viaImageBitmap(src);
        w = a.width;
        h = a.height;
        if (a.width !== b.width || a.height !== b.height) {
          err = `Groesse ${a.width}x${a.height} vs ${b.width}x${b.height}`;
        } else {
          // Der Selbsttest verfaelscht genau ein Byte in der Mitte. Faellt der
          // Vergleich darauf nicht herein, vergleicht er nicht wirklich.
          if (selftest) b.data[Math.floor(b.data.length / 2)] ^= 1;
          for (let i = 0; i < a.data.length; i++) {
            if (a.data[i] !== b.data[i]) {
              diffs++;
              if (firstDiff === null) firstDiff = i;
            }
          }
          same = diffs === 0;
        }
      } catch (e) {
        err = String(e && e.message ? e.message : e);
      }
      out.push({ src, w, h, same, diffs, firstDiff, err });
    }
    return out;
  },
  { assets: ASSETS, selftest: SELFTEST },
);

await browser.close();

for (const r of results) {
  const tag = r.err ? "FEHLER" : r.same ? "ok    " : "ABWEICHUNG";
  console.log(
    `${tag} ${r.src}  ${r.w}x${r.h}` +
      (r.err ? `  ${r.err}` : r.same ? "  byte-identisch" : `  ${r.diffs} Bytes, erstes @${r.firstDiff}`),
  );
}

writeFileSync(
  resolve(OUT, SELFTEST ? "decode-equivalence-selftest.json" : "decode-equivalence.json"),
  JSON.stringify({ base: BASE, selftest: SELFTEST, results }, null, 2),
);

const allSame = results.every((r) => !r.err && r.same);
if (SELFTEST) {
  // Umgekehrte Erwartung: hier MUSS es knallen.
  if (allSame) {
    console.log("\nselftest: das verfaelschte Byte blieb UNENTDECKT — der Vergleich ist wertlos");
    process.exit(1);
  }
  console.log("\nselftest: verfaelschtes Byte ERKANNT (ok)");
  process.exit(0);
}
console.log(`\n${results.filter((r) => r.same).length}/${results.length} Assets byte-identisch`);
process.exit(allSame ? 0 : 1);
