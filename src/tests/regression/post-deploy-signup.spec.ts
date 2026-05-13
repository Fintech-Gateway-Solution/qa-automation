import { test, expect } from '@playwright/test';
import { ApiClient } from '../../helpers/api-client';
import { API_PATHS, TEST_CREDENTIALS } from '../../helpers/constants';

const TS = Date.now();
const SIGNUP_EMAIL = `qa-signup-${TS}@test.local`;
const SIGNUP_PASSWORD = 'Test1234!';
const SIGNUP_NAME = `QA Signup ${TS}`;

test.describe('Post-Deploy: Signup', () => {
  let apiClient: ApiClient;

  test.beforeAll(async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: process.env.BASE_URL || 'http://localhost:8080',
      ignoreHTTPSErrors: true,
    });
    apiClient = new ApiClient(ctx);
  });

  test('API signup creates a new user', async () => {
    const res = await apiClient.signup({
      name: SIGNUP_NAME,
      email: SIGNUP_EMAIL,
      password: SIGNUP_PASSWORD,
    });
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.data.user.email).toBe(SIGNUP_EMAIL);
    expect(body.data.user.name).toBe(SIGNUP_NAME);
    expect(body.data.user.role).toBe('owner');
    expect(body.data.user.tenantId).toBeNull();
  });

  test('API signup rejects duplicate email with existing tenant', async () => {
    const res = await apiClient.signup({
      name: 'Dup User',
      email: TEST_CREDENTIALS.email,
      password: SIGNUP_PASSWORD,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain('already exists');
  });

  test('API signup validates required fields', async () => {
    const noEmail = await apiClient.signup({ name: 'X', email: '', password: SIGNUP_PASSWORD });
    expect(noEmail.status()).toBe(400);

    const noPassword = await apiClient.signup({ name: 'X', email: 'x@test.local', password: '' });
    expect(noPassword.status()).toBe(400);

    const noName = await apiClient.signup({ name: '', email: 'x@test.local', password: SIGNUP_PASSWORD });
    expect(noName.status()).toBe(400);
  });

  test('API signup rejects short password', async () => {
    const res = await apiClient.signup({
      name: 'Short',
      email: `qa-short-${TS}@test.local`,
      password: '12345',
    });
    expect(res.status()).toBe(400);
  });

  test('new user can log in after signup', async () => {
    const freshEmail = `qa-login-${TS}@test.local`;
    const signupRes = await apiClient.signup({
      name: 'QA Login Test',
      email: freshEmail,
      password: SIGNUP_PASSWORD,
    });
    expect(signupRes.status()).toBe(201);

    const loginRes = await apiClient.login(freshEmail, SIGNUP_PASSWORD);
    expect(loginRes.ok()).toBeTruthy();
    const body = await loginRes.json();
    expect(body.data.user.email).toBe(freshEmail);
  });

  test('UI signup page renders', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/#/signup`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Create your account').first()).toBeVisible();
    await expect(page.locator('input').first()).toBeVisible();
  });
});
