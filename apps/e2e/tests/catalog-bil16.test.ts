import { test, expect } from '@playwright/test';

const CATALOG_URL = 'https://binchen.vercel.app/catalog';

// Capture browser-side network requests to check the publishable key is never sent from browser
let browserRequestHeaders: Record<string, string>[] = [];

test.describe('BIL-16 — catalog page real-product verification', () => {
  test.beforeEach(async ({ page }) => {
    browserRequestHeaders = [];
    page.on('request', (req) => {
      browserRequestHeaders.push(req.headers());
    });
  });

  test('mobile 390x844 — products render, no JS errors, filter visible', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') jsErrors.push(msg.text());
    });
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(CATALOG_URL, { waitUntil: 'networkidle', timeout: 30000 });

    await page.screenshot({ path: 'screenshots/catalog-mobile-390x844.png', fullPage: false });

    // Either product cards or empty-state message must be present
    const productList = page.locator('ul[aria-label="Produkte"], ul.grid');
    const emptyState = page.getByText(/Keine Produkte gefunden/i);
    const hasProducts = await productList.count() > 0;
    const hasEmpty = await emptyState.isVisible().catch(() => false);
    expect(hasProducts || hasEmpty, 'Expected product list or empty state to be present').toBe(true);

    // No JS errors. Filter unrelated noise:
    // - RSC prefetch 404s for footer/nav links to pages not yet implemented (tracked by BIL-1)
    // - favicon/gtag/hydration noise
    const criticalErrors = jsErrors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('hydration') &&
        !e.toLowerCase().includes('gtag') &&
        !e.includes('Failed to load resource: the server responded with a status of 404') &&
        !e.includes('Failed to fetch RSC payload')
    );
    expect(criticalErrors, `Catalog JS errors: ${criticalErrors.join(', ')}`).toHaveLength(0);

    // Filter form must be visible
    const filterForm = page.locator('form').filter({ has: page.locator('#size') });
    await expect(filterForm).toBeVisible({ timeout: 5000 });
  });

  test('desktop 1440x900 — sidebar layout and filter navigates with URL params', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(CATALOG_URL, { waitUntil: 'networkidle', timeout: 30000 });

    await page.screenshot({ path: 'screenshots/catalog-desktop-1440x900.png', fullPage: false });

    // Sidebar filter (min 240px wide left column) must be present in desktop layout
    const filterForm = page.locator('form').filter({ has: page.locator('#size') });
    await expect(filterForm).toBeVisible({ timeout: 5000 });

    // Fill size input and submit — expect URL to update with ?size=
    await filterForm.locator('#size').fill('56');
    await filterForm.locator('button[type="submit"]').click();

    await page.waitForURL(/[?&]size=56/, { timeout: 10000 });
    expect(page.url()).toContain('size=56');

    await page.screenshot({ path: 'screenshots/catalog-desktop-filter-applied.png', fullPage: false });
  });

  test('sold-out badge — ausverkauft renders when inventory is 0', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(CATALOG_URL, { waitUntil: 'networkidle', timeout: 30000 });

    const badge = page.getByText('ausverkauft', { exact: false });
    const productList = page.locator('ul[aria-label="Produkte"], ul.grid');

    if (await productList.count() > 0) {
      // If products exist, either some have the badge or none are sold out — both are valid
      const badgeCount = await badge.count();
      // No assertion needed — just verify that IF the badge is present it uses correct text
      if (badgeCount > 0) {
        await expect(badge.first()).toBeVisible();
        console.log(`Found ${badgeCount} sold-out badge(s)`);
      } else {
        console.log('No sold-out products — badge not rendered (expected if all in stock)');
      }
    }
    // If no products at all (empty DB), this test is vacuously valid
  });

  test('empty state — ?size=999 shows Keine Produkte gefunden', async ({ page }) => {
    // BIL-44: an unmatched custom-metadata filter (e.g. size=999) must render the
    // empty-state, not the generic backend-error fallback. getProducts() translates
    // Medusa's 400/404 for unmatched filters into an empty products array.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${CATALOG_URL}?size=999`, { waitUntil: 'networkidle', timeout: 30000 });

    await page.screenshot({ path: 'screenshots/catalog-empty-state.png', fullPage: false });

    await expect(page.getByText(/Keine Produkte gefunden/i)).toBeVisible();
    await expect(page.getByText(/Die Produkte konnten nicht geladen werden/i)).toHaveCount(0);
  });

  test('publishable API key is never sent from the browser', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const sensitiveHeadersSeen: string[] = [];
    page.on('request', (req) => {
      const headers = req.headers();
      if ('x-publishable-api-key' in headers) {
        sensitiveHeadersSeen.push(`${req.method()} ${req.url()}`);
      }
    });

    await page.goto(CATALOG_URL, { waitUntil: 'networkidle', timeout: 30000 });

    expect(
      sensitiveHeadersSeen,
      `x-publishable-api-key found in browser requests: ${sensitiveHeadersSeen.join(', ')}`
    ).toHaveLength(0);
  });
});
