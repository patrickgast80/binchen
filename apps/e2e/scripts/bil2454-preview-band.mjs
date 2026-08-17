import { chromium } from '@playwright/test';
const CONSENT = JSON.stringify({ version: '1', decidedAt: '2026-08-17T18:00:00.000Z', categories: { strict: true, functional: true, analytics: false, marketing: false } });
const b = await chromium.launch();
for (const id of ['hose', 'muetze', 'turban', 'dreieckstuch', 'body']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((v) => localStorage.setItem('bilulu_cookie_consent_v1', v), CONSENT);
  const p = await ctx.newPage();
  await p.goto(`https://bilulu.de/konfigurator/${id}`, { waitUntil: 'networkidle' });
  // Bring the preview into the band between sticky header and sheet.
  const r = await p.evaluate(() => {
    const sheet = document.querySelector('[aria-label="Farbauswahl-Panel"]');
    const header = document.querySelector('header');
    const img = document.querySelector('main img');
    const fig = img?.closest('div');
    const bandTop = header ? header.getBoundingClientRect().height : 0;
    const bandBottom = sheet ? sheet.getBoundingClientRect().top : innerHeight;
    const box = fig.getBoundingClientRect();
    window.scrollBy(0, box.top + box.height / 2 - (bandTop + bandBottom) / 2);
    return { band: Math.round(bandBottom - bandTop), preview: Math.round(box.height) };
  });
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => {
    const sheet = document.querySelector('[aria-label="Farbauswahl-Panel"]');
    const header = document.querySelector('header');
    const fig = document.querySelector('main img')?.closest('div').getBoundingClientRect();
    return {
      top: Math.round(fig.top), bottom: Math.round(fig.bottom),
      headerBottom: Math.round(header.getBoundingClientRect().bottom),
      sheetTop: Math.round(sheet.getBoundingClientRect().top),
    };
  });
  const clear = after.top >= after.headerBottom - 1 && after.bottom <= after.sheetTop + 1;
  console.log(`${id.padEnd(13)} band=${r.band}px preview=${r.preview}px → ${clear ? 'PREVIEW FREI' : 'überlappt'} (preview ${after.top}–${after.bottom}, band ${after.headerBottom}–${after.sheetTop})`);
  if (id === 'muetze' || id === 'hose') await p.screenshot({ path: `reports/bil2454-og-20260817/${id}-mobile-inuse-390x844.png` });
  await ctx.close();
}
await b.close();
