/**
 * CLI: list-or-delete QA test fixtures matching strict prefix+email rules.
 *
 *   BASE_URL=https://findev.qpaymentz.com pnpm cleanup            # dry-run
 *   BASE_URL=https://findev.qpaymentz.com pnpm cleanup --execute  # actually delete
 *
 * Run via:  npx tsx scripts/cleanup-qa-data.ts [--execute]
 */
import { request } from '@playwright/test';
import { cleanupQaData } from '../src/lib/cleanup';

async function main() {
  const dryRun = !process.argv.includes('--execute');
  const baseURL = process.env.BASE_URL || 'http://localhost:8080';
  const email = process.env.TEST_USER_EMAIL || 'admin@fintech.dev';
  const password = process.env.TEST_USER_PASSWORD || 'admin123';

  const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
  try {
    const res = await cleanupQaData({ baseURL, email, password, dryRun, request: ctx });
    if (res.notes.length) {
      console.log('\nNotes:');
      for (const n of res.notes) console.log(`  - ${n}`);
    }
    if (dryRun) {
      console.log('\n(dry-run) re-run with --execute to actually delete.');
    }
  } finally {
    await ctx.dispose();
  }
}

main().catch((err) => {
  console.error('cleanup failed:', err);
  process.exit(1);
});
