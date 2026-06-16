import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Smoke — Bilulu Storefront Homepage', () => {
  test('page loads with correct title and key element', async ({ page }) => {
    await page.goto('/');

    // Title must reference the shop brand (renamed Binchen → Bilulu)
    await expect(page).toHaveTitle(/Bilulu/i);

    // Navigation surface must be visible: <nav> on desktop, hamburger toggle on mobile
    // (mobile <nav> is `hidden md:flex` until the hamburger sheet opens)
    const navOrMenuToggle = page
      .getByRole('navigation')
      .or(page.getByRole('button', { name: /men[üu]/i }));
    await expect(navOrMenuToggle.first()).toBeVisible();
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
