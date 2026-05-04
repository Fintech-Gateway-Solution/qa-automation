/**
 * Playwright globalTeardown — runs once after every `npx playwright test`
 * invocation. Purges QA-prefixed fixtures the suite created against the
 * BASE_URL the run targeted, so dev/stage data never accumulates.
 *
 * Set CLEANUP=skip to bypass (useful for debugging when you want to inspect
 * what the tests created). Default is to run.
 */
import { request, type FullConfig } from '@playwright/test';
import { cleanupQaData } from './src/lib/cleanup';

export default async function globalTeardown(_config: FullConfig) {
  if (process.env.CLEANUP === 'skip') {
    console.log('[teardown] CLEANUP=skip — leaving QA fixtures in place.');
    return;
  }

  const baseURL = process.env.BASE_URL || 'http://localhost:8080';
  const email = process.env.TEST_USER_EMAIL || 'admin@fintech.dev';
  const password = process.env.TEST_USER_PASSWORD || 'admin123';

  const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
  try {
    await cleanupQaData({
      baseURL,
      email,
      password,
      dryRun: false,
      request: ctx,
      log: (m) => console.log(`[teardown] ${m}`),
    });
  } catch (err) {
    // Don't fail the whole run if cleanup hiccups — surface and continue.
    console.error('[teardown] cleanup error (non-fatal):', err);
  } finally {
    await ctx.dispose();
  }
}
