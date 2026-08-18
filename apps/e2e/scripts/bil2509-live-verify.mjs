/**
 * BIL-2509 — Live-Abnahme auf bilulu.de.
 *
 * Schiesst Patricks exakte Konfiguration plus einen hellen und einen dunklen
 * Stoff auf beiden Viewports und zoomt auf die Faltenzonen, die das Ticket
 * nennt (Bundübergang, Schritt, Beinansatz).
 *
 * Wichtig aus BIL-2492: Cookie-Banner und das fixe Mobile-Sheet liefern still
 * identische "Belege". Deshalb wird der Consent VORGESETZT (nicht weggeklickt,
 * siehe CONSENT unten), auf Mobile die Vorschau an den oberen Rand gescrollt,
 * und jeder Screenshot per Byte-Hash gegen alle anderen geprueft.
 */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const OUT = "reports/bil2509/live";
await mkdir(OUT, { recursive: true });
const BASE = "https://bilulu.de";

const CASES = [
  {
    name: "hose-kurz-patrick",
    url: `${BASE}/konfigurator/hose-kurz?hose=stoff-04&bund=mustard&rot=90&buendchen=mustard`,
    crops: {
      bundübergang: { x: 0.18, y: 0.24, w: 0.64, h: 0.22 },
      schritt: { x: 0.30, y: 0.60, w: 0.40, h: 0.30 },
    },
  },
  {
    name: "hose-hell",
    url: `${BASE}/konfigurator/hose?hose=stoff-15&bund=cream&buendchen=sage`,
    crops: { bundübergang: { x: 0.15, y: 0.10, w: 0.70, h: 0.22 } },
  },
  {
    name: "hose-dunkel",
    url: `${BASE}/konfigurator/hose?hose=stoff-30&bund=navy&buendchen=navy`,
    crops: { bundübergang: { x: 0.15, y: 0.10, w: 0.70, h: 0.22 } },
  },
  {
    name: "muetze",
    url: `${BASE}/konfigurator/muetze?muetze=stoff-19&futter=powder-pink`,
    crops: { knoten: { x: 0.25, y: 0.45, w: 0.50, h: 0.35 } },
  },
];

const VIEWPORTS = [
  { id: "mobile", width: 390, height: 844, isMobile: true },
  { id: "desktop", width: 1440, height: 900, isMobile: false },
];

/**
 * Consent wird VORGESETZT, nicht weggeklickt.
 *
 * Der erste Lauf hat auf „Alle akzeptieren" geklickt — das entfernt zwar den
 * Banner, setzt dabei aber die optionalen Kategorien, und ein Test soll keine
 * Cookies vergeben, die eine Besucherin nie erlaubt hat. Nur `strict: true`,
 * alles andere false; identisch zu bil2492-control-shots.mjs.
 */
const CONSENT = () => {
  window.localStorage.setItem(
    "bilulu_cookie_consent_v1",
    JSON.stringify({
      version: "1",
      decidedAt: "2026-08-18T00:00:00.000Z",
      categories: { strict: true, functional: false, analytics: false, marketing: false },
    }),
  );
};

const browser = await chromium.launch();
const hashes = new Map();
const results = [];
const consoleErrors = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: vp.isMobile,
    hasTouch: vp.isMobile,
  });
  await ctx.addInitScript(CONSENT);
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`${vp.id}: ${m.text().slice(0, 200)}`);
  });

  for (const c of CASES) {
    await page.goto(c.url, { waitUntil: "networkidle", timeout: 60000 });

    // Der Banner ist durch CONSENT oben schon weg. Bleibt er stehen, ist der
    // Beleg wertlos (er verdeckt auf Mobile die halbe Vorschau) — also laut
    // scheitern statt still ein Swatch-Raster zu fotografieren.
    const banner = page.getByRole("button", { name: /alle akzeptieren|zustimmen/i });
    if (await banner.count()) {
      throw new Error("Cookie-Banner trotz vorgesetztem Consent sichtbar — localStorage-Key geaendert?");
    }
    await page.waitForTimeout(500);

    const preview = page.locator('[role="img"]').first();
    await preview.waitFor({ state: "visible", timeout: 20000 });

    // Auf Mobile liegt das Paletten-Sheet FIX ueber der unteren Bildschirmhaelfte
    // und damit ueber der Vorschau. Ein Element-Screenshot scrollt das Element in
    // den Viewport und fotografiert dann trotzdem das Sheet mit — der erste Lauf
    // lieferte genau das (BIL-2492: "still identische Belege"). Deshalb auf
    // Mobile der ehrliche Viewport-Schuss von oben, auf Desktop das Element.
    const file = path.join(OUT, `${c.name}-${vp.id}.png`);
    let buf;
    if (vp.isMobile) {
      // Die Vorschau an den oberen Rand scrollen — das ist, was eine Besucherin
      // tut. scrollTo(0,0) waere die andere Luege: dort steht die Vorschau noch
      // unter der Hero-Copy und man sieht nur einen Streifen Bund.
      await preview.evaluate((el) => {
        window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 8);
      });
      await page.waitForTimeout(400);
      buf = await page.screenshot();
    } else {
      buf = await preview.screenshot();
    }
    await writeFile(file, buf);
    const hash = createHash("sha256").update(buf).digest("hex").slice(0, 12);
    const clash = hashes.get(hash);
    if (clash) console.log(`!! IDENTISCH zu ${clash}: ${c.name}-${vp.id} (Beleg wertlos)`);
    hashes.set(hash, `${c.name}-${vp.id}`);

    const box = await preview.boundingBox();
    for (const [zone, r] of Object.entries(c.crops)) {
      await page.screenshot({
        path: path.join(OUT, `${c.name}-${vp.id}-${zone}.png`),
        clip: {
          x: box.x + box.width * r.x,
          y: box.y + box.height * r.y,
          width: box.width * r.w,
          height: box.height * r.h,
        },
      });
    }
    results.push({ case: c.name, viewport: vp.id, hash, size: buf.length });
    console.log(`${c.name.padEnd(20)} ${vp.id.padEnd(8)} sha=${hash} ${buf.length}b`);
  }
  await ctx.close();
}
await browser.close();

console.log(`\ndistinct screenshots: ${hashes.size} / ${results.length}`);
console.log(consoleErrors.length ? `console errors:\n  ${consoleErrors.join("\n  ")}` : "console errors: none");
await writeFile(path.join(OUT, "results.json"), JSON.stringify({ results, consoleErrors }, null, 2));
