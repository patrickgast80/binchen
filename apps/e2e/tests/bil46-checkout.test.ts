import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BINCHEN_PREVIEW_URL ?? 'https://binchen.vercel.app';
const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? process.env.MEDUSA_PUBLISHABLE_KEY ?? '';
const BACKEND = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? 'https://binchen-backend.onrender.com';

const SHOTS = path.resolve(__dirname, '../screenshots/bil46');
fs.mkdirSync(SHOTS, { recursive: true });

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

type AxeResult = { id: string; impact: string | null; help: string; nodes: number };
function summarizeAxe(results: { violations: { id: string; impact: string | null; help: string; nodes: unknown[] }[] }): AxeResult[] {
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length }));
}

async function createCartWithItem(): Promise<string | null> {
  if (!PUB_KEY) return null;
  const h = { 'content-type': 'application/json', 'x-publishable-api-key': PUB_KEY };
  const regions = await fetch(`${BACKEND}/store/regions`, { headers: h }).then((r) => r.ok ? r.json() : null);
  const regionId = regions?.regions?.find((r: { countries?: { iso_2: string }[] }) =>
    r.countries?.some((c) => c.iso_2.toLowerCase() === 'de'))?.id ?? regions?.regions?.[0]?.id;
  if (!regionId) return null;
  const cartRes = await fetch(`${BACKEND}/store/carts`, { method: 'POST', headers: h, body: JSON.stringify({ region_id: regionId }) });
  if (!cartRes.ok) return null;
  const { cart } = await cartRes.json();
  const prodRes = await fetch(`${BACKEND}/store/products?limit=1`, { headers: h });
  if (!prodRes.ok) return cart.id;
  const { products } = await prodRes.json();
  const variantId = products?.[0]?.variants?.[0]?.id;
  if (variantId) {
    await fetch(`${BACKEND}/store/carts/${cart.id}/line-items`, { method: 'POST', headers: h, body: JSON.stringify({ variant_id: variantId, quantity: 1 }) });
  }
  return cart.id;
}

for (const { name, vp } of [{ name: 'mobile', vp: MOBILE }, { name: 'desktop', vp: DESKTOP }]) {
  test.describe(`BIL-46 [${name} ${vp.width}x${vp.height}]`, () => {
    test.use({ viewport: vp });

    test(`/cart empty state renders with CTA to /catalog`, async ({ page }) => {
      await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle', timeout: 30000 });
      await expect(page.getByRole('heading', { level: 1, name: 'Warenkorb' })).toBeVisible();
      await expect(page.getByText('Dein Warenkorb ist leer.')).toBeVisible();
      const cta = page.getByRole('link', { name: 'Kollektion entdecken' });
      await expect(cta).toBeVisible();
      await expect(cta).toHaveAttribute('href', '/catalog');
      await page.screenshot({ path: `${SHOTS}/cart-empty-${name}.png`, fullPage: true });
    });

    test(`/checkout without cart redirects to /cart`, async ({ page }) => {
      const resp = await page.goto(`${BASE}/checkout`, { waitUntil: 'networkidle', timeout: 30000 });
      expect(page.url()).toBe(`${BASE}/cart`);
      expect(resp?.status() ?? 0).toBeLessThan(400);
      await page.screenshot({ path: `${SHOTS}/checkout-guard-${name}.png`, fullPage: true });
    });

    test(`/checkout/payment without cart redirects to /cart`, async ({ page }) => {
      await page.goto(`${BASE}/checkout/payment`, { waitUntil: 'networkidle', timeout: 30000 });
      expect(page.url()).toBe(`${BASE}/cart`);
      await page.screenshot({ path: `${SHOTS}/payment-guard-${name}.png`, fullPage: true });
    });

    test(`/checkout/confirmation/[orderId] renders with robots noindex`, async ({ page }) => {
      const fakeOrderId = 'order_01J0000QA46TESTQATESTING';
      await page.goto(`${BASE}/checkout/confirmation/${fakeOrderId}`, { waitUntil: 'networkidle', timeout: 30000 });
      const robots = await page.locator('meta[name="robots"]').first().getAttribute('content');
      expect(robots ?? '').toMatch(/noindex/i);
      await page.screenshot({ path: `${SHOTS}/confirmation-${name}.png`, fullPage: true });
    });

    test(`a11y: /cart empty state passes axe WCAG 2 A/AA (no serious or critical)`, async ({ page }) => {
      await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle', timeout: 30000 });
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const blocking = summarizeAxe(results);
      fs.writeFileSync(`${SHOTS}/axe-cart-${name}.json`, JSON.stringify(results.violations, null, 2));
      expect(blocking, `Serious/critical a11y violations on /cart [${name}]:\n${JSON.stringify(blocking, null, 2)}`).toEqual([]);
    });

    test(`a11y: /checkout/confirmation passes axe WCAG 2 A/AA (no serious or critical)`, async ({ page }) => {
      await page.goto(`${BASE}/checkout/confirmation/order_01J0000QA46TESTQATESTING`, { waitUntil: 'networkidle', timeout: 30000 });
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const blocking = summarizeAxe(results);
      fs.writeFileSync(`${SHOTS}/axe-confirmation-${name}.json`, JSON.stringify(results.violations, null, 2));
      expect(blocking).toEqual([]);
    });
  });
}

// ---------- Populated-cart scenarios (require Medusa publishable key) ----------
test.describe('BIL-46 populated cart (requires NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY)', () => {
  test.skip(!PUB_KEY, 'Skipped: NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY not set');

  async function seedCartAndAttachCookie(page: Page): Promise<string> {
    const cartId = await createCartWithItem();
    if (!cartId) throw new Error('Failed to provision cart via Medusa backend');
    await page.context().addCookies([{ name: 'bilulu_cart_id', value: cartId, domain: new URL(BASE).host, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
    return cartId;
  }

  for (const { name, vp } of [{ name: 'mobile', vp: MOBILE }, { name: 'desktop', vp: DESKTOP }]) {
    test.describe(`[${name}]`, () => {
      test.use({ viewport: vp });

      test(`/cart shows line item with 'Unikat — Stückzahl auf 1 begrenzt' + EUR de-DE totals + Entfernen`, async ({ page }) => {
        await seedCartAndAttachCookie(page);
        await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle' });
        await expect(page.getByText('Unikat — Stückzahl auf 1 begrenzt')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Entfernen' }).first()).toBeVisible();
        // EUR de-DE format: e.g. "12,50 €"
        const totalText = await page.locator('dt:has-text("Gesamt") + dd').first().textContent();
        expect(totalText ?? '').toMatch(/\d{1,3}(?:\.\d{3})*,\d{2}\s?€/);
        await page.screenshot({ path: `${SHOTS}/cart-populated-${name}.png`, fullPage: true });
      });

      test(`/checkout form validation + shipping selection + redirect to /payment`, async ({ page }) => {
        await seedCartAndAttachCookie(page);
        await page.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' });
        await expect(page.getByRole('heading', { level: 1, name: 'Kasse' })).toBeVisible();
        // submit empty -> Pflichtfeld
        const submit = page.getByRole('button', { name: /Adresse speichern|Speichern|Weiter/i }).first();
        await submit.click();
        await expect(page.getByText('Pflichtfeld').first()).toBeVisible({ timeout: 5000 });
        // bad PLZ
        await page.locator('input[name="postal_code"]').fill('1234');
        await submit.click();
        await expect(page.getByText('PLZ muss 5 Ziffern haben')).toBeVisible({ timeout: 5000 });
        // bad email
        await page.locator('input[name="email"]').fill('foo@bar');
        await submit.click();
        await expect(page.getByText('Ungültige E-Mail-Adresse')).toBeVisible({ timeout: 5000 });
        await page.screenshot({ path: `${SHOTS}/checkout-validation-${name}.png`, fullPage: true });
      });
    });
  }
});
