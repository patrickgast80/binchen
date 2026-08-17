// BIL-2483 follow-up: prove the Konfigurator hub mat is now 12% and viewport-stable.
// Shoots the hub at both required viewports and measures the rendered mat ratio
// straight out of the DOM, so the claim is not eyeballed off a screenshot.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = 'reports/bil2483-hub';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844, dpr: 3 },
  { name: '1440x900', width: 1440, height: 900, dpr: 2 },
];

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
  });
  await page.goto(`${BASE}/konfigurator`, { waitUntil: 'networkidle' });

  // Hide the consent banner for the shot instead of clicking "accept" — the tile
  // is what we are reviewing, and granting consent to get a clean screenshot
  // would be exactly the auto-consent we are not allowed to do.
  await page.addStyleTag({
    content: '[class*="fixed"][class*="bottom-0"], [role="dialog"] { display: none !important; }',
  });

  const measured = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img[alt$="Vorschaubild"]')];
    return imgs.map((img) => {
      const tile = img.parentElement;
      const cs = getComputedStyle(img);
      const tileW = tile.getBoundingClientRect().width;
      const pad = parseFloat(cs.paddingLeft);
      return {
        alt: img.getAttribute('alt'),
        tileW: Math.round(tileW),
        padPx: Math.round(pad * 10) / 10,
        matPct: Math.round((pad / tileW) * 1000) / 10,
      };
    });
  });
  console.log(`\n=== ${vp.name}`);
  for (const m of measured) console.log(`  ${m.tileW}px tile · ${m.padPx}px pad · ${m.matPct}% mat · ${m.alt}`);

  await page.screenshot({ path: `${OUT}/hub-${vp.name}.png`, fullPage: false });

  const firstTile = page.locator('img[alt$="Vorschaubild"]').first();
  await firstTile.locator('xpath=..').screenshot({ path: `${OUT}/tile-${vp.name}.png` });
  await page.close();
}
await browser.close();
console.log(`\nScreenshots in apps/e2e/${OUT}/`);
