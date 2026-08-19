// BIL-2531 — die harte Bedingung: das fertige Bild darf sich nicht aendern.
//
// Das Ticket verlangt einen Byte-Vergleich der Vorschau vor/nach der Aenderung.
// bil2528-swap-visual.mjs macht genau das gegen bilulu.de; dieses Skript ist
// dieselbe Aufnahme gegen eine FREI WAEHLBARE Basis-URL, damit der Vergleich
// schon vor dem Deploy gegen einen lokalen Prod-Server laufen kann — sonst muss
// jede Zwischenversion erst auf main.
//
// Aufruf:  node scripts/bil2531-pixel-neutral.mjs <label> [baseUrl]
//
// Jitter-Kontrolle wie in BIL-2492: dieselbe URL zweimal in zwei Kontexten. Sind
// die beiden nicht byte-identisch, misst der Vergleich Rauschen und der md5
// gegen die andere Version beweist nichts.
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LABEL = process.argv[2] ?? "run";
const BASE = process.argv[3] ?? "http://127.0.0.1:3210";
const OUT = resolve(HERE, "../reports/bil2531");
mkdirSync(OUT, { recursive: true });

// Exakt die Deep-Link-URL aus BIL-2528 — die Variante mit Stoff, also die
// einzige, auf der die Relief-Ebene ueberhaupt etwas malt.
const PATH = "/konfigurator/hose?hose=stoff-15&bund=sage";
const PREVIEW = 'div[role="img"][aria-label*="Hose"]';

const browser = await chromium.launch();

async function shoot(name) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => {
    try {
      window.localStorage.setItem(
        "bilulu_cookie_consent_v1",
        JSON.stringify({
          version: "1",
          decidedAt: "2026-01-01T00:00:00.000Z",
          categories: { strict: true, functional: false, analytics: false, marketing: false },
        }),
      );
    } catch {
      /* egal */
    }
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.text().includes("[relief]")) errors.push(m.text());
  });
  await page.goto(BASE + PATH, { waitUntil: "load" });
  await page.locator("#cookie-consent").waitFor({ state: "detached", timeout: 8000 });
  const visibleAt = await page.evaluate(async () => {
    const t0 = performance.now();
    while (performance.now() - t0 < 30000) {
      const c = document.querySelector('canvas[aria-hidden="true"]');
      if (c && getComputedStyle(c).opacity === "1") return Math.round(performance.now() - t0);
      await new Promise((r) => setTimeout(r, 25));
    }
    return null;
  });
  // Kein Canvas auf 1 heisst: die Ebene ist auf die flache CSS-Version
  // zurueckgefallen. Der Screenshot waere dann ein sauberes Bild von der
  // falschen Sache — genau der Fehler, den ein reiner md5-Vergleich nicht sieht.
  if (visibleAt === null) throw new Error(`${name}: Relief-Canvas wurde nie sichtbar`);
  const file = resolve(OUT, `${LABEL}-${name}.png`);
  await page.locator(PREVIEW).first().screenshot({ path: file });
  await ctx.close();
  const md5 = createHash("md5").update(readFileSync(file)).digest("hex");
  console.log(`${LABEL}/${name}  reliefVisibleAfterLoadMs=${visibleAt}  md5=${md5}`);
  if (errors.length) console.log("  console:", errors.slice(0, 5));
  return { name, file, visibleAt, md5, errors };
}

const a = await shoot("desktop");
const b = await shoot("desktop-jitter");
await browser.close();

const stable = a.md5 === b.md5;
writeFileSync(
  resolve(OUT, `${LABEL}.json`),
  JSON.stringify({ label: LABEL, base: BASE, path: PATH, shots: [a, b], stable }, null, 2),
);
console.log(`\nJitter-Kontrolle (zwei Laeufe identisch): ${stable}`);
if (!stable) {
  console.log("WARNUNG: nicht reproduzierbar — jeder md5-Vergleich darauf ist wertlos.");
  process.exit(1);
}
console.log(`md5 fuer ${LABEL}: ${a.md5}`);
