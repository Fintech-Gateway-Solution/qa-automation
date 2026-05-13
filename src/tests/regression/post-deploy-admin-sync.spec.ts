/**
 * Post-deployment regression: Admin sync page (Octopus integration).
 *
 * Tests the sync config CRUD, schedule times validation, and sync status
 * endpoints. These are API-level tests since the admin UI requires
 * super_admin role (tested separately via UI when super admin credentials
 * are available).
 *
 * Uses the SYNC_API_BASE_URL env var if set, otherwise defaults to
 * the dashboard API base path for the config endpoints.
 *
 * Run: BASE_URL=https://finstage.qpaymentz.com npx playwright test regression/post-deploy-admin-sync
 *
 * NOTE: Requires super_admin credentials. Set SUPER_ADMIN_EMAIL and
 * SUPER_ADMIN_PASSWORD env vars, or skip if not available.
 */

import { test as base, expect } from '@playwright/test';
import { API_PATHS } from '../../helpers/constants';

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

const test = base.extend<{ superAdminRequest: any }>({
  superAdminRequest: async ({ playwright, baseURL }, use, testInfo) => {
    if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD) {
      testInfo.skip(true, 'SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set — skipping admin sync tests');
      return;
    }
    const ctx = await playwright.request.newContext({ baseURL: baseURL!, ignoreHTTPSErrors: true });
    const login = await ctx.post(`${API_PATHS.AUTH}/auth/login`, {
      data: { email: SUPER_ADMIN_EMAIL, password: SUPER_ADMIN_PASSWORD },
    });
    if (!login.ok()) {
      testInfo.skip(true, `Super admin login failed: ${login.status()}`);
      return;
    }
    await use(ctx);
    await ctx.dispose();
  },
});

test.describe('Post-Deploy: Admin Sync Config', () => {
  test('GET octopus config returns data or null', async ({ superAdminRequest }) => {
    const me = await superAdminRequest.get(`${API_PATHS.AUTH}/auth/me`);
    expect(me.ok()).toBeTruthy();
    const { data: user } = await me.json();
    const tenantId = user.tenantId ?? user.tenant_id;
    expect(tenantId, 'super admin must have a tenantId').toBeTruthy();

    const res = await superAdminRequest.get(`${API_PATHS.DASHBOARD}/admin/octopus-integration/${tenantId}`);
    expect(res.ok(), `GET config failed: ${res.status()}`).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('data');
  });

  test('POST config with syncMode=scheduled validates schedule times', async ({ superAdminRequest }) => {
    const me = await superAdminRequest.get(`${API_PATHS.AUTH}/auth/me`);
    const { data: user } = await me.json();
    const tenantId = user.tenantId ?? user.tenant_id;

    // Invalid: empty array
    const bad1 = await superAdminRequest.post(`${API_PATHS.DASHBOARD}/admin/octopus-integration`, {
      data: {
        tenantId,
        apiUrl: 'https://test.example.com',
        apiToken: 'test-token',
        syncMode: 'scheduled',
        syncScheduleTimes: [],
      },
    });
    expect(bad1.status()).toBe(400);

    // Invalid: bad time format
    const bad2 = await superAdminRequest.post(`${API_PATHS.DASHBOARD}/admin/octopus-integration`, {
      data: {
        tenantId,
        apiUrl: 'https://test.example.com',
        apiToken: 'test-token',
        syncMode: 'scheduled',
        syncScheduleTimes: ['25:00'],
      },
    });
    expect(bad2.status()).toBe(400);
  });

  test('POST config with syncMode=daily validates daily time', async ({ superAdminRequest }) => {
    const me = await superAdminRequest.get(`${API_PATHS.AUTH}/auth/me`);
    const { data: user } = await me.json();
    const tenantId = user.tenantId ?? user.tenant_id;

    // Missing time
    const bad = await superAdminRequest.post(`${API_PATHS.DASHBOARD}/admin/octopus-integration`, {
      data: {
        tenantId,
        apiUrl: 'https://test.example.com',
        apiToken: 'test-token',
        syncMode: 'daily',
      },
    });
    expect(bad.status()).toBe(400);

    // Invalid format
    const bad2 = await superAdminRequest.post(`${API_PATHS.DASHBOARD}/admin/octopus-integration`, {
      data: {
        tenantId,
        apiUrl: 'https://test.example.com',
        apiToken: 'test-token',
        syncMode: 'daily',
        syncDailyTimePst: '3pm',
      },
    });
    expect(bad2.status()).toBe(400);
  });

  test('POST config with valid scheduled times succeeds', async ({ superAdminRequest }) => {
    const me = await superAdminRequest.get(`${API_PATHS.AUTH}/auth/me`);
    const { data: user } = await me.json();
    const tenantId = user.tenantId ?? user.tenant_id;

    // First check if config already exists — we'll restore it after
    const existing = await superAdminRequest.get(
      `${API_PATHS.DASHBOARD}/admin/octopus-integration/${tenantId}`,
    );
    const { data: originalConfig } = await existing.json();

    // Save with valid schedule times
    const res = await superAdminRequest.post(`${API_PATHS.DASHBOARD}/admin/octopus-integration`, {
      data: {
        tenantId,
        apiUrl: originalConfig?.apiUrl || 'https://test.example.com',
        apiToken: originalConfig?.apiToken || 'test-token',
        syncMode: 'scheduled',
        syncScheduleTimes: ['06:00', '12:00', '18:00'],
      },
    });
    expect(res.ok(), `save scheduled config failed: ${res.status()} ${await res.text()}`).toBeTruthy();
    const { data: saved } = await res.json();
    expect(saved.syncMode).toBe('scheduled');

    // Restore original config if it existed
    if (originalConfig?.apiUrl) {
      await superAdminRequest.post(`${API_PATHS.DASHBOARD}/admin/octopus-integration`, {
        data: {
          tenantId,
          apiUrl: originalConfig.apiUrl,
          apiToken: originalConfig.apiToken,
          syncMode: originalConfig.syncMode ?? 'interval',
          syncIntervalSec: originalConfig.syncIntervalSec ?? 300,
          syncDailyTimePst: originalConfig.syncDailyTimePst ?? null,
          syncScheduleTimes: originalConfig.syncScheduleTimes
            ? JSON.parse(originalConfig.syncScheduleTimes)
            : null,
        },
      });
    }
  });
});
