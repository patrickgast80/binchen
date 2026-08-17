import { chromium } from '@playwright/test';
import fs from 'node:fs';

const outDir = 'reports/bil2461-accept';
fs.mkdirSync(outDir, { recursive: true });
const BASE = 'https://bilulu.de';
const CASES = [
  { g: 'hose',   name: 'forest',     q: '?bund=forest&hose=cream&buendchen=terracotta' },
  { g: 'hose',   name: 'navy',       q: '?bund=navy&hose=sky&buendchen=mustard' },
  { g: 'hose',   name: 'rust',       q: '?bund=rust&hose=sand&buendchen=terracotta' },
  { g: 'muetze', name: 'terracotta', q: '?muetze=terracotta&futter=sand' },
  { g: 'muetze', name: 'forest',     q: '?muetze=forest&futter=powder-pink' },
  { g: 'muetze', name: 'mustard',    q: '?muetze=mustard&futter=navy' },
];
const CONSENT = JSON.stringify({
  version: '1', decidedAt: '2026-08-17T00:00:00.000Z',
  categories: { strict: true, functional: false, analytics: false, marketing: false },
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
await ctx.addInitScript(([k, v]) => { try { window.localStorage.setItem(k, v); } catch {} }, ['bilulu_cookie_consent_v1', CONSENT]);
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

for (const c of CASES) {
  await page.goto(`${BASE}/konfigurator/${c.g}${c.q}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(900);
  const stage = page.locator('img[src*="-foto/base.webp"]').first();
  await stage.waitFor({ state: 'visible', timeout: 15000 });

  // Sheet is fixed to the bottom and has no collapse control — scroll the page
  // so the whole preview clears the sheet's top edge before capturing.
  const sheet = page.locator('[aria-label="Farbauswahl-Panel"]').first();
  const sheetTop = (await sheet.count()) ? (await sheet.boundingBox()).y : 844;
  let box = await stage.boundingBox();
  const overshoot = box.y + box.height - (sheetTop - 8);
  if (overshoot > 0) { await page.mouse.wheel(0, overshoot); await page.waitForTimeout(500); box = await stage.boundingBox(); }

  const tag = `${c.g}-${c.name}-390x844`;
  await page.screenshot({ path: `${outDir}/${tag}-page-scrolled.png` });
  await page.screenshot({ path: `${outDir}/${tag}-stage.png`, clip: box });
  console.log(tag, 'sheetTop', Math.round(sheetTop), 'stageBottom', Math.round(box.y + box.height));
}
await browser.close();
console.log('console errors:', errors.length);
