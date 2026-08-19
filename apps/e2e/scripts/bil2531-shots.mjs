// BIL-2531 — Sichtprüfung der geänderten Fläche an echten Viewports.
//
// Der Byte-Vergleich (bil2531-pixel-neutral.mjs) beweist, dass die VORSCHAU
// unverändert ist. Er sagt nichts darüber, ob die Seite drumherum noch steht
// oder ob die Ebene stumm auf den CSS-Fallback zurückgefallen ist — deshalb
// wartet dieses Skript auf das sichtbare Relief-Canvas und bricht ab, wenn es
// nicht kommt. Ohne diese Bedingung wäre ein sauberer Screenshot vom falschen
// Zustand nicht von einem richtigen zu unterscheiden.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../reports/bil2531/shots");
mkdirSync(OUT, { recursive: true });

const BASE = process.argv[2] ?? "https://bilulu.de";
const PATH = "/konfigurator/hose?hose=stoff-15&bund=sage";
const VIEWPORTS = [
  { name: "mobile-390x844", width: 390, height: 844, mobile: true },
  { name: "desktop-1440x900", width: 1440, height: 900, mobile: false },
];

const browser = await chromium.launch();
for (const v of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: 1,
    isMobile: v.mobile,
    hasTouch: v.mobile,
  });
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
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(BASE + PATH, { waitUntil: "load", timeout: 90000 });
  const visibleAt = await page.evaluate(async () => {
    const t0 = performance.now();
    while (performance.now() - t0 < 30000) {
      const c = document.querySelector('canvas[aria-hidden="true"]');
      if (c && getComputedStyle(c).opacity === "1") return Math.round(performance.now() - t0);
      await new Promise((r) => setTimeout(r, 25));
    }
    return null;
  });
  if (visibleAt === null) throw new Error(`${v.name}: Relief-Canvas wurde nie sichtbar`);
  await page.screenshot({ path: resolve(OUT, `${v.name}.png`) });
  console.log(`${v.name}  reliefVisibleAfterLoadMs=${visibleAt}  console.error=${errors.length}`);
  if (errors.length) console.log("  ", errors.slice(0, 5));
  await ctx.close();
}
await browser.close();
