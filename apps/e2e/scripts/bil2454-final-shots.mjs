import { chromium } from '@playwright/test';
const CONSENT = JSON.stringify({ version: '1', decidedAt: '2026-08-17T18:00:00.000Z', categories: { strict: true, functional: true, analytics: false, marketing: false } });
const OUT = 'reports/bil2454-og-20260817';
const b = await chromium.launch();
for (const [id, vp, tag] of [
  ['muetze', { width: 390, height: 844 }, 'mobile-390x844'],
  ['hose', { width: 390, height: 844 }, 'mobile-390x844'],
  ['muetze', { width: 1440, height: 900 }, 'desktop-1440x900'],
]) {
  const ctx = await b.newContext({ viewport: vp });
  await ctx.addInitScript((v) => localStorage.setItem('bilulu_cookie_consent_v1', v), CONSENT);
  const p = await ctx.newPage();
  await p.goto(`https://bilulu.de/konfigurator/${id}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/${id}-${tag}.png` });
  await ctx.close();
}
await b.close();
console.log('shots written');
