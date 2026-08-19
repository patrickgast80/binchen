// Frontend 2026-08-19: BIL-2523 — warum Lighthouse auf `hose` genau EINEN
// Stoff-Chip laedt und auf `turban` 35, obwohl beide 35 im SSR-HTML haben.
// Ohne diese Erklaerung waere `hose` als "Kontrolle" nur zufaellig unbewegt.
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../reports/bil2523/post-2524');
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  ['turban', 'https://bilulu.de/konfigurator/turban?turban=stoff-15&schleife=sage'],
  ['hose', 'https://bilulu.de/konfigurator/hose?hose=stoff-15&bund=sage'],
];
const VIEWPORTS = [
  ['mobile', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  ['desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }],
];

const browser = await chromium.launch();
for (const [vpName, vp] of VIEWPORTS) {
  for (const [name, url] of ROUTES) {
    const ctx = await browser.newContext({
      ...vp,
      userAgent: vp.isMobile ? devices['iPhone 13'].userAgent : undefined,
    });
    // Consent setzen, sonst verdeckt das Banner die Palette und jeder
    // Screenshot sieht gleich aus (siehe reference_cookie_banner_aria_name_beats_visible_text).
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('bilulu_cookie_consent_v1', JSON.stringify({
          version: '1',
          decidedAt: '2026-08-19T00:00:00.000Z',
          categories: { strict: true, functional: false, analytics: false, marketing: false },
        }));
      } catch {}
    });
    const page = await ctx.newPage();
    const chipRequests = new Set();
    page.on('request', (r) => { if (/\/stoffe\/stoff-\d+-96\.webp/.test(r.url())) chipRequests.add(r.url()); });
    await page.goto(url, { waitUntil: 'networkidle' });

    const dom = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('img[src*="/stoffe/stoff-"]')];
      const visible = imgs.filter((i) => {
        const r = i.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(i).visibility !== 'hidden';
      });
      const inViewport = visible.filter((i) => {
        const r = i.getBoundingClientRect();
        return r.bottom > 0 && r.top < innerHeight * 2;
      });
      return {
        total: imgs.length,
        rendered: visible.length,
        nearViewport: inViewport.length,
        firstRenderedBox: visible[0] ? [Math.round(visible[0].getBoundingClientRect().width), Math.round(visible[0].getBoundingClientRect().height)] : null,
      };
    });

    // Der Consent-Dialog verdeckt sonst die halbe Seite und liefert fuer jede
    // Route denselben "Beleg" — also nachweisen, dass er weg ist.
    const bannerVisible = await page.locator('#cookie-consent').isVisible().catch(() => false);
    if (bannerVisible) throw new Error(`${name}/${vpName}: Cookie-Banner steht noch im Bild`);

    // Palette in den Blick scrollen, sonst zeigt der Screenshot nur den Hero.
    // `:visible` ist Pflicht: auf `turban`/`muetze`/`dreieckstuch` liegt die
    // erste Chip-Instanz im fuer diese Breite ausgeblendeten Panel.
    const firstVisibleChip = page.locator('img[src*="/stoffe/stoff-"]:visible').first();
    if (await firstVisibleChip.count()) {
      await firstVisibleChip.scrollIntoViewIfNeeded({ timeout: 10_000 });
      await page.waitForTimeout(300);
    }

    console.log(JSON.stringify({ route: name, viewport: vpName, chipRequests: chipRequests.size, bannerVisible, ...dom }));
    await page.screenshot({ path: resolve(OUT, `${name}-${vpName}-palette.png`), fullPage: false });
    await ctx.close();
  }
}
await browser.close();
