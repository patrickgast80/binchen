import { chromium } from '@playwright/test';
const CONSENT_KEY = 'bilulu_cookie_consent_v1';
const CONSENT = JSON.stringify({ version: '1', decidedAt: '2026-08-17T18:00:00.000Z', categories: { strict: true, functional: true, analytics: false, marketing: false } });
const b = await chromium.launch();
for (const id of ['hose', 'muetze', 'turban', 'dreieckstuch', 'body']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [CONSENT_KEY, CONSENT]);
  const p = await ctx.newPage();
  await p.goto(`https://bilulu.de/konfigurator/${id}`, { waitUntil: 'networkidle' });
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(800);
  const r = await p.evaluate(() => {
    const sheet = document.querySelector('[aria-label="Farbauswahl-Panel"]');
    const btn = [...document.querySelectorAll('button')].find((b) => /Merken/i.test(b.textContent || ''));
    const cs = getComputedStyle(document.documentElement).getPropertyValue('--binchen-palette-sheet-h');
    const container = btn?.closest('div.mx-auto.max-w-7xl');
    return {
      sheetTop: sheet ? Math.round(sheet.getBoundingClientRect().top) : null,
      sheetH: sheet ? Math.round(sheet.getBoundingClientRect().height) : null,
      sheetVar: cs.trim() || '(unset)',
      btnTop: btn ? Math.round(btn.getBoundingClientRect().top) : null,
      btnBottom: btn ? Math.round(btn.getBoundingClientRect().bottom) : null,
      padBottom: container ? getComputedStyle(container).paddingBottom : null,
      atBottom: Math.round(window.scrollY + window.innerHeight) >= document.body.scrollHeight - 2,
    };
  });
  const covered = r.btnBottom !== null && r.sheetTop !== null && r.btnBottom > r.sheetTop;
  console.log(`${id.padEnd(13)} sheet top=${r.sheetTop} h=${r.sheetH} var=${r.sheetVar} pad=${r.padBottom} | Merken ${r.btnTop}–${r.btnBottom} → ${covered ? 'VERDECKT' : 'frei'}`);
  await ctx.close();
}
await b.close();
