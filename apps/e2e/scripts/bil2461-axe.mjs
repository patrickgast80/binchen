import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';

const CONSENT = JSON.stringify({
  version: '1', decidedAt: '2026-08-17T00:00:00.000Z',
  categories: { strict: true, functional: false, analytics: false, marketing: false },
});
const URLS = [
  'https://bilulu.de/konfigurator/hose?bund=navy&hose=sky&buendchen=mustard',
  'https://bilulu.de/konfigurator/muetze?muetze=forest&futter=powder-pink',
];
const browser = await chromium.launch();
const out = [];
for (const vp of [{ w: 390, h: 844 }, { w: 1440, h: 900 }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  await ctx.addInitScript(([k, v]) => { try { window.localStorage.setItem(k, v); } catch {} }, ['bilulu_cookie_consent_v1', CONSENT]);
  const page = await ctx.newPage();
  for (const url of URLS) {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(800);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    out.push({ url, vp: `${vp.w}x${vp.h}`, violations: r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })) });
    console.log(`${vp.w}x${vp.h}`, url.split('/konfigurator/')[1].split('?')[0], '→', r.violations.length, 'violations',
      r.violations.map(v => `${v.id}(${v.impact})`).join(', '));
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync('reports/bil2461-accept/axe.json', JSON.stringify(out, null, 2));
