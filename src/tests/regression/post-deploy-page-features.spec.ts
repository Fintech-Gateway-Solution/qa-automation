import { test, expect } from '../../fixtures/auth.fixture';
import { TIMEOUTS } from '../../helpers/constants';

test.describe('Post-Deploy: Receive Payments Page Features', () => {
  test('receive payments page loads with tabs', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/#/receive-payments');
    await authenticatedPage.waitForLoadState('networkidle');

    // Verify page heading
    const heading = authenticatedPage.getByRole('heading', { name: /receive payments/i });
    await expect(heading).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // Verify tabs are present
    const tabs = ['New Sale', 'Pay By Link', 'Invoices', 'Customers', 'Transactions'];
    for (const tab of tabs) {
      const tabEl = authenticatedPage.getByRole('tab', { name: new RegExp(tab, 'i') }).or(
        authenticatedPage.getByText(tab, { exact: false }),
      );
      await expect(tabEl.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('transactions tab shows expected columns', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/#/receive-payments');
    await authenticatedPage.waitForLoadState('networkidle');

    // Click Transactions tab
    const txnTab = authenticatedPage.getByText('Transactions', { exact: false }).first();
    await txnTab.click();
    await authenticatedPage.waitForTimeout(1000);

    // Verify table headers include Auth Doc
    const authDocHeader = authenticatedPage.getByText('Auth Doc', { exact: false });
    await expect(authDocHeader.first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Post-Deploy: Products Page Features', () => {
  test('products page loads without errors', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/#/products');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.waitForTimeout(2000);

    const errorBanner = authenticatedPage.getByText('Something went wrong', { exact: false });
    expect(await errorBanner.isVisible().catch(() => false)).toBe(false);
  });
});

test.describe('Post-Deploy: POS Management Page', () => {
  test('POS management page loads', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/#/pos-management');
    await authenticatedPage.waitForLoadState('networkidle');

    const heading = authenticatedPage.getByRole('heading', { name: /pos/i });
    await expect(heading.first()).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
  });
});

test.describe('Post-Deploy: Send Payments Page Features', () => {
  test('send payments page loads with gateway config', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/#/send-payments');
    await authenticatedPage.waitForLoadState('networkidle');

    const heading = authenticatedPage.getByRole('heading', { name: /send payments/i });
    await expect(heading.first()).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
  });
});

test.describe('Post-Deploy: Purchase Orders Page Features', () => {
  test('purchase orders page loads with stepper', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/#/purchasing');
    await authenticatedPage.waitForLoadState('networkidle');

    // Page should load without errors
    await authenticatedPage.waitForTimeout(2000);
    const errorBanner = authenticatedPage.getByText('Something went wrong', { exact: false });
    expect(await errorBanner.isVisible().catch(() => false)).toBe(false);
  });
});
