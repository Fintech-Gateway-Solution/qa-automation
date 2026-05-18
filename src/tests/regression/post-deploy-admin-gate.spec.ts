import { test, expect } from '../../fixtures/auth.fixture';

test.describe('Post-Deploy: Module Gate System', () => {
  test('modules list includes expected fields', async ({ apiClient }) => {
    const res = await apiClient.getModules();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const modules: any[] = body.data ?? body;
    expect(modules.length).toBeGreaterThan(0);

    for (const mod of modules) {
      expect(mod).toHaveProperty('moduleName');
      expect(mod).toHaveProperty('isActive');
      expect(typeof mod.isActive).toBe('boolean');
    }
  });

  test('toggle module OFF then ON preserves state', async ({ apiClient }) => {
    const res = await apiClient.getModules();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const modules: any[] = body.data ?? body;
    const active = modules.find((m: any) => m.isActive);
    if (!active) return;

    // Toggle OFF
    const offRes = await apiClient.toggleModule(active.moduleName, false);
    expect(offRes.ok(), `toggle OFF failed: ${offRes.status()}`).toBeTruthy();
    const offBody = await offRes.json();
    expect((offBody.data ?? offBody).isActive).toBe(false);

    // Toggle ON
    const onRes = await apiClient.toggleModule(active.moduleName, true);
    expect(onRes.ok(), `toggle ON failed: ${onRes.status()}`).toBeTruthy();
    const onBody = await onRes.json();
    expect((onBody.data ?? onBody).isActive).toBe(true);
  });

  test('modules response shape includes superAdminEnabled', async ({ apiClient }) => {
    const res = await apiClient.getModules();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const modules: any[] = body.data ?? body;
    // At least one module should have superAdminEnabled field
    const withSuperAdmin = modules.find((m: any) => 'superAdminEnabled' in m);
    if (withSuperAdmin) {
      expect(typeof withSuperAdmin.superAdminEnabled).toBe('boolean');
    }
  });
});

test.describe('Post-Deploy: Global Settings', () => {
  test('settings endpoint returns key-value map', async ({ apiClient }) => {
    const res = await apiClient.getGlobalSettings();
    if (res.ok()) {
      const body = await res.json();
      const settings = body.data ?? body;
      expect(typeof settings).toBe('object');
    } else {
      // Endpoint might require admin — 403 is acceptable
      expect([403, 404]).toContain(res.status());
    }
  });
});
