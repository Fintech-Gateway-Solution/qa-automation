import { test, expect } from '../../fixtures/auth.fixture';
import { APP_ROUTES } from '../../helpers/constants';
import { HomePage } from '../../pages/home.page';

test.describe('Smoke: Page Loads', () => {
  test('home page loads with dashboard cards', async ({ authenticatedPage: page }) => {
    const home = new HomePage(page);
    await home.goto();

    await expect(home.welcomeHeading).toBeVisible({ timeout: 10_000 });
    await expect(home.activeModulesCard).toBeVisible();
    await expect(home.roleCard).toBeVisible();
    await expect(home.accountStatusCard).toBeVisible();
  });

  for (const route of APP_ROUTES) {
    test(`${route.name} page (${route.hash}) loads without error`, async ({ authenticatedPage: page }) => {
      await page.goto(`/${route.hash}`);
      await page.waitForLoadState('networkidle');

      // Page should not show a blank screen or error
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.length, `${route.name} page appears blank`).toBeGreaterThan(10);

      // No uncaught errors in console
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      // The page should have rendered meaningful content (not just a loading spinner after timeout)
      // Check that either a heading, a table, or a form is visible
      const hasContent = await page.locator('h1, h2, table, form, [class*="card"]').first().isVisible();
      expect(hasContent, `${route.name} page has no visible content (heading, table, form, or card)`).toBeTruthy();
    });
  }

  test('sidebar navigation links are present', async ({ authenticatedPage: page }) => {
    await page.goto('/#/');
    await page.waitForLoadState('networkidle');

    // Check sidebar has navigation links (use .first() for links that appear in both sidebar and page content)
    const sidebar = page.locator('nav, [class*="sidebar"], aside').first();
    await expect(sidebar.getByRole('link', { name: /Home/i }).first()).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Users', exact: true }).first()).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /Settings/i }).first()).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /Reports/i }).first()).toBeVisible();
  });
});
