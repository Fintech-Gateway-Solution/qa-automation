import { test, expect } from '@playwright/test';
import { ApiClient } from '../../helpers/api-client';
import { API_PATHS, TEST_CREDENTIALS } from '../../helpers/constants';

test.describe('Post-Deploy: Forgot Password', () => {
  let apiClient: ApiClient;

  test.beforeAll(async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: process.env.BASE_URL || 'http://localhost:8080',
      ignoreHTTPSErrors: true,
    });
    apiClient = new ApiClient(ctx);
  });

  test('request reset returns success for existing email', async () => {
    const res = await apiClient.requestPasswordReset(TEST_CREDENTIALS.email);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data.message).toContain('reset link has been sent');
  });

  test('request reset returns success for non-existent email (no enumeration)', async () => {
    const res = await apiClient.requestPasswordReset('nonexistent-user@nowhere.test');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data.message).toContain('reset link has been sent');
  });

  test('request reset validates email field', async () => {
    const res = await apiClient.requestPasswordReset('');
    expect(res.status()).toBe(400);
  });

  test('reset with invalid token is rejected', async () => {
    const res = await apiClient.resetPassword('invalid-token-abc123', 'NewPass1!');
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error.message).toContain('Invalid or expired');
  });

  test('reset validates password length', async () => {
    const res = await apiClient.resetPassword('any-token', '12345');
    expect(res.status()).toBe(400);
  });

  test('reset validates token field', async () => {
    const res = await apiClient.resetPassword('', 'NewPass1!');
    expect(res.status()).toBe(400);
  });

  test('UI forgot password page renders and submits', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/#/forgot-password`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Forgot Password').first()).toBeVisible();

    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
    await emailInput.fill(TEST_CREDENTIALS.email);

    await page.locator('button[type="submit"]').click();

    await expect(page.locator('text=Check Your Email').first()).toBeVisible({ timeout: 10_000 });
  });

  test('UI login page has forgot password link', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/#/login`);
    await page.waitForLoadState('networkidle');

    const forgotLink = page.getByText('Forgot Password');
    await expect(forgotLink).toBeVisible();
    await forgotLink.click();

    await expect(page.locator('text=Forgot Password').first()).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });
});
