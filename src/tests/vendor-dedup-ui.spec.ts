/**
 * UI smoke for the vendor dedup change.
 *
 * 1. Seed an existing vendor via the dashboard payees API.
 * 2. Open the PO create page → Add Vendor modal.
 * 3. Submit a new vendor with the same email.
 * 4. Assert the 409 amber banner appears with the existing vendor name.
 * 5. Click "Use existing vendor" → the dropdown should auto-pick the existing
 *    vendor (its name appears as the selected option in the Vendor select).
 *
 * Run: BASE_URL=https://findev.qpaymentz.com TEST_USER_EMAIL=admin@fintech.dev TEST_USER_PASSWORD=admin123 npx playwright test vendor-dedup-ui
 */

import { test, expect } from '../fixtures/auth.fixture';

const uniq = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

test.describe('Vendor dedup: PO form AddVendorModal', () => {
  test('409 + Use existing vendor swaps the dropdown to the existing record', async ({
    apiClient,
    authenticatedPage,
  }) => {
    // ── 1. Seed an existing vendor with a unique email ──────────────────
    const id = uniq();
    const email = `qa-dedup-${id}@test.local`;
    const seedFirst = `QASeedFirst${id}`;
    const seedLast = `QASeedLast${id}`;
    const seedFullName = `${seedFirst} ${seedLast}`;
    const seedRes = await apiClient.createDashboardPayee({
      name: seedFullName,
      email,
      contactName: seedFullName,
      vendorType: 'third_party',
    });
    expect(seedRes.ok(), `seed createDashboardPayee failed: ${seedRes.status()}`).toBeTruthy();
    const { data: seed } = await seedRes.json();

    // ── 2. Drive the PO create UI → Add Vendor modal ────────────────────
    await authenticatedPage.goto('/#/pos-management/purchase-orders/create');
    await expect(authenticatedPage.locator('select').first()).toBeVisible({ timeout: 15_000 });

    // Click "New" (the AddVendor trigger next to the Vendor dropdown).
    // Match by title attribute, which is "Add new vendor".
    await authenticatedPage.getByTitle('Add new vendor').click();
    await expect(authenticatedPage.getByText('Add Vendor', { exact: true })).toBeVisible();

    // ── 3. Fill the form with the SAME email → expect 409 banner ────────
    // Use unique alpha-only first/last names that pass the form's validators
    // (alphabets and spaces only, min 2 chars). The email is the duplicate.
    await authenticatedPage.getByPlaceholder('John', { exact: true }).fill('Dup');
    await authenticatedPage.getByPlaceholder('Smith', { exact: true }).fill('Tester');
    await authenticatedPage.getByPlaceholder('john@example.com').fill(email);
    await authenticatedPage.getByPlaceholder('Company name').fill('DupCo');

    await authenticatedPage.getByRole('button', { name: /create vendor/i }).click();

    // ── 4. Assert dedup banner appears with the seeded vendor's name ────
    const banner = authenticatedPage.getByText('A vendor with this email already exists').locator('..');
    await expect(banner).toBeVisible({ timeout: 10_000 });
    // The seed name appears INSIDE the banner span (the modal also has the
    // name in the closed Vendor dropdown option, which is why we scope to
    // the banner ancestor).
    await expect(banner.getByText(seedFullName)).toBeVisible();

    // ── 5. Click "Use existing vendor" ──────────────────────────────────
    await authenticatedPage.getByRole('button', { name: /use existing vendor/i }).click();

    // The modal should close and the Vendor dropdown should reflect the
    // seeded vendor — the first <select> on the form is the Vendor picker.
    await expect(authenticatedPage.getByText('Add Vendor', { exact: true })).not.toBeVisible();
    const selectedVendor = await authenticatedPage.locator('select').first().inputValue();
    expect(selectedVendor).toBe(seed.id);

    // ── Cleanup: best-effort soft-delete the seeded vendor ─────────────
    await authenticatedPage.request.delete(`/api/v1/payees/${seed.id}`).catch(() => {});
  });
});
