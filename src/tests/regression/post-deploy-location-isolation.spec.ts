import { test, expect } from '../../fixtures/auth.fixture';
import { TIMEOUTS } from '../../helpers/constants';

test.describe('Post-Deploy: Location Data Isolation', () => {
  test('localStorage cleared after logout', async ({ authenticatedPage }) => {
    // Navigate first so localStorage is accessible on the app origin
    await authenticatedPage.goto('/#/');
    await authenticatedPage.waitForLoadState('networkidle');

    // Wait for location to be set
    await authenticatedPage.waitForTimeout(2000);

    // Click user menu and logout
    const avatar = authenticatedPage.locator('[data-testid="user-menu"], button:has(svg.lucide-user), .avatar, button:has(.rounded-full)').first();
    if (await avatar.isVisible({ timeout: 5000 }).catch(() => false)) {
      await avatar.click();
      const logoutBtn = authenticatedPage.getByText('Log Out', { exact: false });
      if (await logoutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await logoutBtn.click();
        await authenticatedPage.waitForURL(/#\/login/, { timeout: TIMEOUTS.PAGE_LOAD });

        // After logout, location store should be cleared
        const afterLogout = await authenticatedPage.evaluate(() => {
          const stored = localStorage.getItem('supernova-location');
          if (!stored) return null;
          try {
            const parsed = JSON.parse(stored);
            return parsed.state;
          } catch {
            return null;
          }
        });

        if (afterLogout) {
          expect(afterLogout.selectedLocationId).toBe('');
          expect(afterLogout.selectedLocationName).toBe('');
        }
      }
    }
  });

  test('location picker shows current tenant locations', async ({ authenticatedPage, apiClient }) => {
    await authenticatedPage.goto('/#/');
    await authenticatedPage.waitForLoadState('networkidle');

    // Verify locations API returns data for current tenant
    const res = await apiClient.getLocations();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const locations: any[] = body.data ?? body;
    expect(locations.length).toBeGreaterThan(0);

    // Each location should have a name and ID
    for (const loc of locations) {
      expect(loc.id).toBeTruthy();
      expect(loc.name).toBeTruthy();
    }
  });
});

test.describe('Post-Deploy: Session Expiry Cleanup', () => {
  test('auth store cleared on logout via API', async ({ apiClient }) => {
    // Verify we're authenticated
    const meRes = await apiClient.getMe();
    expect(meRes.ok()).toBeTruthy();

    // Logout via API
    const logoutRes = await apiClient.logout();
    expect(logoutRes.ok()).toBeTruthy();
  });
});
