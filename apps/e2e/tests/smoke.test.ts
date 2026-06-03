import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Smoke — Binchen Storefront Homepage', () => {
  test('page loads with correct title and key element', async ({ page }) => {
    await page.goto('/');

    // Title must reference the shop brand
    await expect(page).toHaveTitle(/Binchen/i);

    // At least one product card or nav element must be visible
    const shopLink = page.getByRole('navigation');
    await expect(shopLink).toBeVisible();
  });

  test('homepage passes axe-core WCAG AA scan', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('cookie consent banner is present before interaction', async ({ page }) => {
    await page.goto('/');
    // Cookie banner must be visible before any user action
    const banner = page.getByRole('dialog', { name: /cookie|datenschutz/i })
      .or(page.locator('[data-testid="cookie-banner"]'))
      .or(page.locator('#cookie-consent'));
    await expect(banner).toBeVisible({ timeout: 5000 });
  });
});
