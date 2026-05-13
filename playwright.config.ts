import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src/tests',
  // Auto-purge QA fixtures (payees, funding accounts, POs whose names match
  // the strict QA-prefix + @test.local rule) after every run. Bypass with
  // CLEANUP=skip if you want to inspect leftover state.
  globalTeardown: './globalTeardown.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ...(process.env.CI ? [['github' as const]] : []),
    ['list'],
  ],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8080',
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: 'smoke',
      testMatch: /smoke\/.*/,
      timeout: 30_000,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'regression',
      testMatch: /regression\/.*/,
      timeout: 60_000,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [/smoke\/.*/, /regression\/.*/],
    },
  ],
});
