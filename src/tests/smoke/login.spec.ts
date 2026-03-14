import { test, expect } from '@playwright/test';
import { TEST_CREDENTIALS, API_PATHS } from '../../helpers/constants';
import { LoginPage } from '../../pages/login.page';

test.describe('Smoke: Login Flow', () => {
  test('login page renders correctly', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.signInButton).toBeVisible();
    await expect(loginPage.signInButton).toHaveText(/Sign In/i);
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
    await loginPage.waitForDashboard();

    // Verify we're on the home page
    await expect(page.getByText(/Welcome back/i)).toBeVisible({ timeout: 10_000 });
  });

  test('login API sets auth cookies', async ({ request }) => {
    const response = await request.post(`${API_PATHS.AUTH}/auth/login`, {
      data: {
        email: TEST_CREDENTIALS.email,
        password: TEST_CREDENTIALS.password,
      },
    });

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    // API wraps responses in { data: { user: {...} } }
    const user = body.data?.user ?? body.user;
    expect(user).toBeTruthy();
    expect(user).toHaveProperty('email', TEST_CREDENTIALS.email);
  });

  test('authenticated /auth/me returns user info', async ({ request }) => {
    // Login first
    const loginResponse = await request.post(`${API_PATHS.AUTH}/auth/login`, {
      data: {
        email: TEST_CREDENTIALS.email,
        password: TEST_CREDENTIALS.password,
      },
    });
    expect(loginResponse.ok()).toBeTruthy();

    // Now call /auth/me with the cookies
    const meResponse = await request.get(`${API_PATHS.AUTH}/auth/me`);
    expect(meResponse.ok()).toBeTruthy();

    const body = await meResponse.json();
    // /auth/me returns { data: { email, id, ... } }
    const user = body.data?.user ?? body.data ?? body.user;
    expect(user).toBeTruthy();
    expect(user.email).toBe(TEST_CREDENTIALS.email);
  });

  test('invalid credentials show error', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.login('wrong@email.com', 'wrongpassword');

    // Should stay on login page and show an error
    await expect(page).toHaveURL(/#\/login/);
    // Wait for error message (toast or inline)
    await expect(
      page.getByText(/invalid|incorrect|unauthorized|failed/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });
});
