import { test, expect } from '../../fixtures/auth.fixture';

test.describe('Post-Deploy: Modules', () => {
  let modules: any[];

  test('list modules returns array with expected shape', async ({ apiClient }) => {
    const res = await apiClient.getModules();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    modules = body.data ?? body;
    expect(Array.isArray(modules)).toBe(true);
    expect(modules.length).toBeGreaterThan(0);

    const first = modules[0];
    expect(first).toHaveProperty('moduleName');
    expect(first).toHaveProperty('isActive');
  });

  test('toggle module OFF then ON restores state', async ({ apiClient }) => {
    const res = await apiClient.getModules();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const mods: any[] = body.data ?? body;
    const target = mods.find((m: any) => m.isActive);
    expect(target, 'need at least one active module to test toggle').toBeTruthy();

    const offRes = await apiClient.toggleModule(target.moduleName, false);
    expect(offRes.ok(), `toggle OFF failed: ${offRes.status()}`).toBeTruthy();
    const offBody = await offRes.json();
    expect((offBody.data ?? offBody).isActive).toBe(false);

    const onRes = await apiClient.toggleModule(target.moduleName, true);
    expect(onRes.ok(), `toggle ON failed: ${onRes.status()}`).toBeTruthy();
    const onBody = await onRes.json();
    expect((onBody.data ?? onBody).isActive).toBe(true);
  });
});
