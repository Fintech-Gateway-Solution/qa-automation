/**
 * Post-deployment regression: Login flow.
 *
 * Verifies auth service is up, login works via API and UI, and session
 * cookies are set correctly.
 *
 * Run: BASE_URL=https://finstage.qpaymentz.com npx playwright test regression/post-deploy-login
 */

import { test, expect } from '@playwright/test';
import { TEST_CREDENTIALS, API_PATHS, HEALTH_ENDPOINTS } from '../../helpers/constants';
import { LoginPage } from '../../pages/login.page';

test.describe('Post-Deploy: Health Checks', () => {
  for (const ep of HEALTH_ENDPOINTS) {
    test(`${ep.name} health returns 200`, async ({ request }) => {
      const res = await request.get(ep.path);
      expect(res.ok(), `${ep.name} health failed: ${res.status()} ${await res.text()}`).toBeTruthy();
    });
  }
});

test.describe('Post-Deploy: Login', () => {
  test('API login returns user with valid session', async ({ request }) => {
    const login = await request.post(`${API_PATHS.AUTH}/auth/login`, {
      data: { email: TEST_CREDENTIALS.email, password: TEST_CREDENTIALS.password },
    });
    expect(
      login.ok(),
      `Login failed (${login.status()}). Set TEST_USER_EMAIL / TEST_USER_PASSWORD env vars for this environment.`,
    ).toBeTruthy();

    const me = await request.get(`${API_PATHS.AUTH}/auth/me`);
    expect(me.ok(), `/auth/me failed after login: ${me.status()}`).toBeTruthy();
    const body = await me.json();
    const user = body.data?.user ?? body.data ?? body.user;
    expect(user).toBeTruthy();
    expect(user.email).toBe(TEST_CREDENTIALS.email);
  });

  test('UI login page renders and accepts credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.signInButton).toBeVisible();

    await loginPage.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
    await loginPage.waitForDashboard();

    await expect(page.getByText(/Welcome back/i)).toBeVisible({ timeout: 10_000 });
  });
});
