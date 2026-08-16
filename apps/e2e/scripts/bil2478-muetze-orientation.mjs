/**
 * BIL-2478 — verify the Mützen-Konfigurator preview is upright after the
 * 90° CCW rotation of the four photo layers.
 *
 * Usage: node scripts/bil2478-muetze-orientation.mjs [baseUrl]
 * Default baseUrl is the local dev server.
 */
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const OUT = process.env.BIL2478_OUT ?? 'reports/bil2478';
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

const browser = await chromium.launch();
const summary = [];

for (const vp of VIEWPORTS) {
  // AxeBuilder requires a page created from an explicit context.
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });

  // Pre-seed a "reject all" consent so the banner never overlays the preview.
  // Same shape the CookieConsent component persists (bilulu_cookie_consent_v1).
  await context.addInitScript(() => {
    window.localStorage.setItem(
      'bilulu_cookie_consent_v1',
      JSON.stringify({
        version: '1',
        decidedAt: '2026-08-16T00:00:00.000Z',
        categories: { strict: true, functional: false, analytics: false, marketing: false },
      }),
    );
  });

  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  await page.goto(`${BASE}/konfigurator/muetze`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const preview = page.getByRole('img', { name: /Live-Vorschau der konfigurierten Bilulu-Mütze/i }).first();
  // On mobile the fixed palette sheet covers the lower half of the viewport, so
  // pin the preview to the top of the scroll area before shooting it.
  await preview.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(400);
  await preview.screenshot({ path: `${OUT}/muetze-preview-${vp.name}.png` });
  await page.screenshot({ path: `${OUT}/muetze-page-${vp.name}.png`, fullPage: false });

  const layers = await preview.locator('img').evaluateAll((els) =>
    els.map((el) => ({
      src: new URL(el.src).pathname,
      w: el.naturalWidth,
      h: el.naturalHeight,
      complete: el.complete,
    })),
  );

  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

  summary.push({
    viewport: vp.name,
    layers,
    consoleErrors,
    axeViolations: axe.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
  });
  await page.close();
  await context.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
