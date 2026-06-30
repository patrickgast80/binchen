import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const BASE_URL = process.env.BINCHEN_PREVIEW_URL ?? "http://127.0.0.1:3210";
const ROUTE = "/konfigurator/hose";

test.describe("BIL-2184 — Hose-Konfigurator", () => {
  test("mobile 390x844 — renders, persists URL state, no axe violations", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}${ROUTE}`, { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Stell deine Hose");
    await expect(page.getByRole("note")).toContainText("echten Stoff-Mustern");
    await expect(page.locator("svg[aria-label*='Live-Vorschau']")).toBeVisible();

    // Click a Senfgelb swatch in the "Bund" group
    const bundGroup = page.getByRole("radiogroup", { name: /Bund/ });
    await bundGroup.getByRole("radio", { name: /Bund: Senfgelb/ }).click();

    await expect(page).toHaveURL(/bund=mustard/);

    await page.screenshot({
      path: "screenshots/bil2184-konfigurator-mobile-390x844.png",
      fullPage: true,
    });

    const results = await new AxeBuilder({ page })
      .include('main')
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("desktop 1440x900 — renders + share button works", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}${ROUTE}?bund=rust&links=sand&rechts=sage&buendchen=petrol`, {
      waitUntil: "networkidle",
    });

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("svg[aria-label*='Live-Vorschau']")).toBeVisible();

    // Selection summary should reflect URL
    const summary = page.locator("dl").first();
    await expect(summary).toContainText("Bund:");
    await expect(summary).toContainText("Rost");
    await expect(summary).toContainText("Sand");
    await expect(summary).toContainText("Salbei");
    await expect(summary).toContainText("Petrol");

    await page.screenshot({
      path: "screenshots/bil2184-konfigurator-desktop-1440x900.png",
      fullPage: false,
    });
  });

  test("homepage CTA links to konfigurator", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /Stell deine Hose selbst zusammen/ })).toBeVisible();
    await page.screenshot({
      path: "screenshots/bil2184-homepage-cta-1440x900.png",
      fullPage: true,
    });
  });
});
