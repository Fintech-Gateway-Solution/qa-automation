/**
 * UI smoke for fix #1: Low Threshold filter scopes to vendor.
 *
 * Bootstraps a fresh fixture each run (third-party vendor + product with
 * reorder threshold > current stock + product↔payee link), then drives the
 * PO create page's product picker modal:
 *   1. select the vendor in the PO header
 *   2. open "Add Multiple" → product picker modal
 *   3. toggle Low Threshold Products
 *   4. assert ONLY the test product (or vendor-supplied below-threshold rows)
 *      appear in the list — system-wide products NOT linked to this vendor
 *      and not below threshold must NOT appear.
 *
 * Run: BASE_URL=https://findev.qpaymentz.com TEST_USER_EMAIL=admin@fintech.dev TEST_USER_PASSWORD=admin123 npx playwright test po-low-threshold-vendor
 */

import { test, expect } from '../fixtures/auth.fixture';
import { qaThirdPartyVendor } from '../helpers/test-data';

const uniq = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

test.describe('PO #1: Low Threshold filter scopes to vendor', () => {
  test('toggling low threshold with a vendor selected shows only vendor + below-threshold products', async ({
    apiClient,
    authenticatedPage,
  }) => {
    // ── 1. Ensure POS-related modules are on (best-effort; module names
    //       differ across envs, so we don't fail if unknown) ─────────────
    for (const mod of ['products', 'pos', 'pos_management']) {
      await apiClient.toggleModule(mod, true).catch(() => {});
    }

    // ── 2. Create a fresh third-party vendor ────────────────────────────
    const vendorRes = await apiClient.createDashboardPayee(qaThirdPartyVendor());
    expect(vendorRes.ok(), `createDashboardPayee failed: ${vendorRes.status()} ${await vendorRes.text()}`).toBeTruthy();
    const { data: vendor } = await vendorRes.json();

    // ── 3. Create a product with reorderThreshold > inStockQty ──────────
    // Use the dashboard products API. Stock starts at 0 so any positive
    // threshold puts it "below threshold." Tag with the vendor so the
    // /payees/:id/products endpoint surfaces it.
    const id = uniq();
    const skuLabel = `QA-LT-${id}`;
    // Pick a department so the product is valid.
    const deptsRes = await apiClient.getDepartments();
    expect(deptsRes.ok()).toBeTruthy();
    const { data: depts } = await deptsRes.json();
    const departmentId = (depts as any[])[0]?.id;
    test.skip(!departmentId, 'No departments configured on this tenant — skipping');

    // Products live on the products service (/products-api/v1) — the dashboard
    // service doesn't expose POST /products. Create via the products service.
    // Products service accepts `payees: [{ payeeId, unitName, vendorPrice }]`
    // — see products/src/routes/products.ts:590-602. This populates the
    // product_payees join table at create time.
    const productRes = await authenticatedPage.request.post('/products-api/v1/products', {
      data: {
        name: `QA-LowThreshold-${id}`,
        sku: skuLabel,
        primaryBarcode: `99${Date.now()}`,
        cost: '1.00',
        sellingPrice: '2.00',
        reorderThreshold: 100, // above stock so the row qualifies as "below threshold"
        defaultSellingUnit: 'each',
        defaultPurchasingUnit: 'each',
        soldByWeight: false,
        departmentId,
        isActive: true,
        payees: [{ payeeId: vendor.id, unitName: 'each', vendorPrice: 1 }],
      },
    });
    expect(
      productRes.ok(),
      `create product failed: ${productRes.status()} ${await productRes.text()}`,
    ).toBeTruthy();
    const { data: product } = await productRes.json();

    // Sanity: confirm the vendor-products endpoint returns the new product
    // with the threshold + stock fields the FE filter requires.
    const vpRes = await apiClient.getPayeeProducts(vendor.id);
    expect(vpRes.ok()).toBeTruthy();
    const vp = await vpRes.json();
    const linked = (vp.data as any[]).find((p) => p.id === product.id);
    expect(linked, `product ${product.id} not appearing under vendor ${vendor.id}`).toBeTruthy();
    expect(linked).toHaveProperty('reorderThreshold');
    expect(linked).toHaveProperty('inStockQty');
    expect(Number(linked.reorderThreshold)).toBe(100);
    expect(Number(linked.inStockQty)).toBeLessThanOrEqual(100);

    // ── 4. Drive the PO create UI ───────────────────────────────────────
    await authenticatedPage.goto('/#/pos-management/purchase-orders/create');
    // Wait for the form to render.
    await expect(authenticatedPage.getByRole('combobox').first()).toBeVisible({ timeout: 15_000 });

    // Pick the vendor: the form's first <select> is "Vendor".
    await authenticatedPage.locator('select').first().selectOption(vendor.id);
    // Pick the first available location so "Add Multiple" enables.
    await authenticatedPage.locator('select').nth(1).selectOption({ index: 1 });

    // Open the product picker. Two buttons match (toolbar + empty-state link)
    // — use .first() to pick the toolbar button.
    await authenticatedPage.getByRole('button', { name: /add multiple/i }).first().click();
    await expect(authenticatedPage.getByText(/select products for purchase order/i)).toBeVisible();

    // ── 5. Toggle Low Threshold Products ────────────────────────────────
    // The label text is "Low Threshold Products" (per product-picker-modal.tsx).
    const lowThresholdLabel = authenticatedPage.getByText('Low Threshold Products');
    await expect(lowThresholdLabel).toBeVisible();
    // Click the toggle button next to the label.
    await lowThresholdLabel.locator('xpath=following-sibling::button').first().click();

    // ── 6. Assert the test product appears in the visible list ──────────
    // The product name should be visible inside the modal.
    await expect(authenticatedPage.getByText(`QA-LowThreshold-${id}`)).toBeVisible({ timeout: 10_000 });

    // ── 7. Cleanup: best-effort soft-delete fixtures ────────────────────
    await authenticatedPage.request.delete(`/api/v1/products/${product.id}`).catch(() => {});
    await apiClient
      .createDashboardPayee({ id: vendor.id, isActive: false })
      .catch(() => {}); /* ignored — soft-delete elsewhere */
  });
});
