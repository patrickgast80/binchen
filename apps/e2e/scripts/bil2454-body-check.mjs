import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.addInitScript(() => localStorage.setItem('bilulu.cookie-consent', JSON.stringify({ status: 'accepted', categories: { necessary: true } })));
await p.goto('https://bilulu.de/konfigurator/body', { waitUntil: 'networkidle' });
await p.screenshot({ path: 'reports/bil2454-og-20260817/body-live-page.png' });
await b.close();
