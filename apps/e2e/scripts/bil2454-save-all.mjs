/**
 * BIL-2454: "Merken" round-trip on every konfigurator, live against bilulu.de
 * at iPhone-12 width. Consent is pre-seeded because the banner (z-50) sits over
 * the palette sheet on a first visit by design — the returning-visitor state is
 * the one this checks.
 */
import { chromium } from '@playwright/test';

const KONFIGS = ['hose', 'muetze', 'turban', 'dreieckstuch', 'body'];
const SAVED_KEY = 'bilulu.saved-configs';
const CONSENT_KEY = 'bilulu_cookie_consent_v1';
const CONSENT = JSON.stringify({
  version: '1',
  decidedAt: '2026-08-17T18:00:00.000Z',
  categories: { strict: true, functional: true, analytics: false, marketing: false },
});

const browser = await chromium.launch();
let failures = 0;

for (const id of KONFIGS) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(
    ([k, v]) => window.localStorage.setItem(k, v),
    [CONSENT_KEY, CONSENT],
  );
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto(`https://bilulu.de/konfigurator/${id}`, { waitUntil: 'networkidle' });
  const banner = page.getByTestId('cookie-banner');
  const bannerVisible = await banner.isVisible().catch(() => false);

  // The palette sheet is a fixed overlay (up to 434px tall on the fabric-heavy
  // konfigurators), and Playwright's auto-scroll centres the target in the
  // layout viewport — which on those pages lands it exactly under the sheet
  // edge. Park the button in the free band between sticky header and sheet
  // instead, i.e. where a thumb would actually reach it.
  const merken = page.getByRole('button', { name: /Merken/i }).first();
  await merken.scrollIntoViewIfNeeded();
  const band = await page.evaluate(() => {
    const sheet = document.querySelector('[aria-label="Farbauswahl-Panel"]');
    const header = document.querySelector('header');
    const top = header ? header.getBoundingClientRect().bottom : 0;
    const bottom = sheet ? sheet.getBoundingClientRect().top : window.innerHeight;
    return { top, bottom };
  });
  const box = await merken.boundingBox();
  await page.evaluate(
    (dy) => window.scrollBy(0, dy),
    box.y + box.height / 2 - (band.top + band.bottom) / 2,
  );
  await page.waitForTimeout(300);
  await merken.click({ timeout: 15000 });
  await page.waitForFunction((k) => JSON.parse(localStorage.getItem(k) || '[]').length > 0, SAVED_KEY, { timeout: 10000 });

  await page.reload({ waitUntil: 'domcontentloaded' });
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]'), SAVED_KEY);
  const entry = saved[0] || {};
  const thumbKb = entry.thumbnail ? Math.round(entry.thumbnail.length / 1024) : 0;
  const ok = saved.length === 1 && thumbKb > 2 && errors.length === 0 && !bannerVisible;
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${id.padEnd(13)} entries=${saved.length} thumb=${thumbKb}kB errors=${errors.length} banner=${bannerVisible} name="${entry.name ?? ''}"`,
  );
  if (errors.length) console.log('    ', errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
console.log(failures ? `${failures} konfigurator(s) failed` : 'all konfigurators PASS');
process.exit(failures ? 1 : 0);
