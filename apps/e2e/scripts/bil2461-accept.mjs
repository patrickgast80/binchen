import { chromium } from '@playwright/test';
import fs from 'node:fs';

const outDir = 'reports/bil2461-accept';
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const BASE = 'https://bilulu.de';
const CASES = [
  { g: 'hose',   name: 'default',    q: '' },
  { g: 'hose',   name: 'forest',     q: '?bund=forest&hose=cream&buendchen=terracotta' },
  { g: 'hose',   name: 'navy',       q: '?bund=navy&hose=sky&buendchen=mustard' },
  { g: 'hose',   name: 'rust',       q: '?bund=rust&hose=sand&buendchen=terracotta' },
  { g: 'muetze', name: 'default',    q: '' },
  { g: 'muetze', name: 'terracotta', q: '?muetze=terracotta&futter=sand' },
  { g: 'muetze', name: 'forest',     q: '?muetze=forest&futter=powder-pink' },
  { g: 'muetze', name: 'mustard',    q: '?muetze=mustard&futter=navy' },
];
const VIEWPORTS = [
  { key: '390x844',  width: 390,  height: 844 },
  { key: '1440x900', width: 1440, height: 900 },
];

// Consent: everything non-essential DECLINED. We never auto-grant for a screenshot pass.
const CONSENT = JSON.stringify({
  version: '1',
  decidedAt: '2026-08-17T00:00:00.000Z',
  categories: { strict: true, functional: false, analytics: false, marketing: false },
});

const browser = await chromium.launch();
const errors = [];
const report = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
  });
  await ctx.addInitScript(([k, v]) => {
    try { window.localStorage.setItem(k, v); } catch {}
  }, ['bilulu_cookie_consent_v1', CONSENT]);

  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${vp.key} ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${vp.key} pageerror ${String(e)}`));

  for (const c of CASES) {
    const url = `${BASE}/konfigurator/${c.g}${c.q}`;
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(900);

    const banner = await page.getByRole('button', { name: /Alle ablehnen/i }).count();
    const stage = page.locator('img[src*="-foto/base.webp"]').first();
    await stage.waitFor({ state: 'visible', timeout: 15000 });
    await stage.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const box = await stage.boundingBox();

    const tag = `${c.g}-${c.name}-${vp.key}`;
    await page.screenshot({ path: `${outDir}/${tag}-page.png` });
    await page.screenshot({ path: `${outDir}/${tag}-stage.png`, clip: box });
    const zoom = c.g === 'hose'
      ? { x: box.x, y: box.y + box.height * 0.62, width: box.width, height: box.height * 0.38 }
      : { x: box.x, y: box.y + box.height * 0.45, width: box.width, height: box.height * 0.55 };
    await page.screenshot({ path: `${outDir}/${tag}-seamzoom.png`, clip: zoom });

    report.push({ tag, url, http: res?.status() ?? null, bannerVisible: banner > 0, stage: { w: Math.round(box.width), h: Math.round(box.height) } });
    console.log(tag, res?.status(), `${Math.round(box.width)}x${Math.round(box.height)}`, banner > 0 ? 'BANNER!' : 'banner-dismissed');
  }
  await ctx.close();
}
await browser.close();

fs.writeFileSync(`${outDir}/report.json`, JSON.stringify({ report, errors }, null, 2));
console.log('\nconsole errors:', errors.length);
errors.slice(0, 20).forEach((e) => console.log('  ', e));
