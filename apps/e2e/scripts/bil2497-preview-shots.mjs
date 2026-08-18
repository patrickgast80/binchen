/**
 * BIL-2497 — Vorschau-Screenshots am echten Renderer, beide Viewports.
 *
 * Der Byte-Check auf der Kachel beweist, dass die Datei nahtlos ist. Das hier
 * beweist, dass sie im Browser auch so ankommt: gleicher Blend-Stack, gleiche
 * Masken, gleiche `background-repeat`-Kachelung wie fuer die Kundin.
 *
 * Zusaetzlich zum vollen Preview wird ein 2x-Zoom auf die Mitte der Vorschau
 * geschnitten. Volle Screenshots verstecken die Naht — das ist genau die Falle
 * aus dem Ticket.
 *
 *   node scripts/bil2497-preview-shots.mjs [baseUrl] [outDir] [suffix]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://127.0.0.1:3312";
const OUT = process.argv[3] ?? path.join(process.cwd(), "reports", "bil2497-preview");
const SUFFIX = process.argv[4] ?? "";

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

/**
 * Alle fuenf Konfiguratoren, je mit ihrem Hauptstoff-Param, und je einem Stoff
 * aus einer anderen Problemklasse — Blumen dunkel (Patricks Foto), gerichteter
 * Print, kraeftige Streifen, feine Streifen, gerichteter Print auf Jeans.
 *
 * `body` ist seit BIL-2496 live 404 (Board-Entscheid, Konfigurator ausgeblendet).
 * Es bleibt in der Liste, damit ein Wiederauftauchen automatisch mitgeprueft
 * wird; nicht erreichbare Routen werden uebersprungen und am Ende gemeldet.
 */
const CASES = [
  { id: "hose", param: "hose", fabric: "stoff-30" },
  { id: "body", param: "hauptteil", fabric: "stoff-04" },
  { id: "turban", param: "turban", fabric: "stoff-20" },
  { id: "muetze", param: "muetze", fabric: "stoff-08" },
  { id: "dreieckstuch", param: "tuch", fabric: "stoff-15" },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const failures = [];
  const skipped = [];

  for (const vp of [
    { name: "mobile", width: 390, height: 844, isMobile: true },
    { name: "desktop", width: 1440, height: 900, isMobile: false },
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile,
    });
    await ctx.addInitScript(CONSENT);
    const page = await ctx.newPage();
    page.on("console", (m) => {
      if (m.type() === "error") failures.push(`console ${vp.name}: ${m.text()}`);
    });

    for (const c of CASES) {
      for (const rot of [0, 90]) {
        const qs = new URLSearchParams({ [c.param]: c.fabric });
        if (rot) qs.set("rot", String(rot));
        const res = await page.goto(`${BASE}/konfigurator/${c.id}?${qs}`, {
          waitUntil: "networkidle",
        });
        // Eine nicht erreichbare Route ist kein Naht-Befund — melden und weiter,
        // statt den ganzen Lauf an einem 404/500 sterben zu lassen.
        if (!res || !res.ok()) {
          skipped.push(`${c.id} ${vp.name} rot${rot}: HTTP ${res?.status() ?? "?"}`);
          continue;
        }
        const preview = page.getByRole("img", { name: /Vorschau/ }).first();
        await preview.waitFor({ state: "visible" });
        // BIL-2492-Lehre: die Auto-Scroll-Position parkt flache Vorschauen
        // unter dem fixen Mobile-Sheet, dann sind alle Shots identisch.
        await preview.evaluate((el) => el.scrollIntoView({ block: "start" }));
        await page.waitForTimeout(600);
        const buf = await preview.screenshot();
        const stem = `${c.id}-${c.fabric}-${vp.name}-rot${rot}${SUFFIX}`;
        await writeFile(path.join(OUT, `${stem}.png`), buf);

        // Zoom auf die Mitte — dort tiled der Stoff ueber die volle Zonenhoehe,
        // also genau dort muesste eine Wiederhol-Naht stehen. Der Ausschnitt
        // kommt aus Playwright selbst (`clip`), damit dieses Skript ohne sharp
        // auskommt: apps/e2e hat es nicht in den Abhaengigkeiten, und ein
        // paralleles `pnpm install` neben anderen Agenten ist tabu.
        const box = await preview.boundingBox();
        if (box) {
          await page.screenshot({
            path: path.join(OUT, `${stem}-zoom.png`),
            clip: {
              x: box.x + box.width * 0.225,
              y: box.y + box.height * 0.275,
              width: box.width * 0.55,
              height: box.height * 0.45,
            },
          });
        }
      }
    }
    await ctx.close();
  }
  await browser.close();

  for (const s of skipped) console.log(`  ⚠ uebersprungen: ${s}`);
  if (failures.length) {
    console.error(`Konsolenfehler (${failures.length}):`);
    for (const f of failures) console.error(`  ✕ ${f}`);
    process.exit(1);
  }
  console.log(`→ ${OUT}  (keine Konsolenfehler)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
