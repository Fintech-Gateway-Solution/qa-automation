import { test, expect } from '../../fixtures/auth.fixture';
import { test as baseTest } from '@playwright/test';
import { APP_ROUTES, AUTH_ROUTES, TIMEOUTS } from '../../helpers/constants';

baseTest.describe('Post-Deploy: Public Page Navigation', () => {
  for (const route of AUTH_ROUTES) {
    baseTest(`${route.name} page loads`, async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/${route.hash}`);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('body')).not.toBeEmpty();
      await expect(page.locator('input').first()).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
    });
  }
});

test.describe('Post-Deploy: Authenticated Page Navigation', () => {
  for (const route of APP_ROUTES) {
    test(`${route.name} page loads`, async ({ authenticatedPage, baseURL }) => {
      await authenticatedPage.goto(`${baseURL}/${route.hash}`);
      await authenticatedPage.waitForLoadState('networkidle');
      await expect(authenticatedPage.locator('body')).not.toBeEmpty();
    });
  }
});
