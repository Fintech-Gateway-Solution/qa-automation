import { test as base, expect, type Page, type BrowserContext } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { TEST_CREDENTIALS, API_PATHS } from '../helpers/constants';

/**
 * Extended test fixture that provides:
 * - `authenticatedPage`: A page with a logged-in session (cookies set via API login)
 * - `apiClient`: An ApiClient instance bound to the authenticated request context
 */

type AuthFixtures = {
  authenticatedPage: Page;
  apiClient: ApiClient;
};

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ browser, baseURL }, use) => {
    const context = await browser.newContext({ baseURL });

    // Login via API to get auth cookies (faster than UI login)
    const response = await context.request.post(`${API_PATHS.AUTH}/auth/login`, {
      data: {
        email: TEST_CREDENTIALS.email,
        password: TEST_CREDENTIALS.password,
      },
    });

    expect(response.ok(), `Login failed: ${response.status()} ${response.statusText()}`).toBeTruthy();

    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  apiClient: async ({ playwright, baseURL }, use) => {
    // Create an API request context with login cookies
    const requestContext = await playwright.request.newContext({
      baseURL: baseURL!,
      ignoreHTTPSErrors: true,
    });

    // Login to get cookies
    const loginResponse = await requestContext.post(`${API_PATHS.AUTH}/auth/login`, {
      data: {
        email: TEST_CREDENTIALS.email,
        password: TEST_CREDENTIALS.password,
      },
    });

    expect(loginResponse.ok(), `API login failed: ${loginResponse.status()}`).toBeTruthy();

    const client = new ApiClient(requestContext);
    await use(client);
    await requestContext.dispose();
  },
});

export { expect } from '@playwright/test';
