/**
 * Regression tests for Purchase Order flow fixes.
 *
 * Covers the four issues that have a direct API surface:
 *   #1 Low Threshold filtering when scoped to a vendor (/payees/:id/products
 *      returns reorderThreshold + inStockQty so the picker filter works)
 *   #3 Email resend endpoint
 *   #4 NIB warehouse PO appears in the warehouse-orders feed
 *   #6 Status filter accepts 'generated' (label "Sent" — UI-only)
 *
 * Issues #2 (named print tab) and #5/#6 label rendering are UI-only — covered
 * by separate browser specs if/when needed; not in this API-level suite.
 *
 * Run against dev:   BASE_URL=https://findev.qpaymentz.com npx playwright test purchase-orders
 * Run against local: npx playwright test purchase-orders
 */

import { test, expect } from '../fixtures/auth.fixture';
import {
  qaThirdPartyVendor,
  qaWarehouseVendor,
  qaPurchaseOrder,
} from '../helpers/test-data';

async function getFirstLocation(apiClient: { getLocations(): Promise<any> }, testInfo: any) {
  const res = await apiClient.getLocations();
  expect(res.ok(), `GET /locations failed: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  const locations: any[] = body.data ?? body;
  if (locations.length === 0) testInfo.skip(true, 'No locations configured — skipping PO tests');
  return locations[0];
}

async function getFirstProduct(apiClient: any, testInfo: any) {
  const res = await apiClient.getProducts();
  expect(res.ok(), `GET /products failed: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  const products: any[] = body.data ?? body;
  if (products.length === 0) testInfo.skip(true, 'No products configured — skipping PO tests');
  return products[0];
}

// ─── #1 Low Threshold + Vendor scoping ────────────────────────────────────────

test.describe('PO #1: /payees/:id/products returns reorderThreshold + inStockQty', () => {
  test('vendor products endpoint exposes fields the low-threshold filter needs', async ({ apiClient }, testInfo) => {
    // Create a third-party vendor (idempotent factory)
    const vendorRes = await apiClient.createDashboardPayee(qaThirdPartyVendor());
    expect(vendorRes.ok(), `createDashboardPayee failed: ${vendorRes.status()} ${await vendorRes.text()}`).toBeTruthy();
    const { data: vendor } = await vendorRes.json();

    const res = await apiClient.getPayeeProducts(vendor.id);
    expect(res.ok(), `getPayeeProducts failed: ${res.status()} ${await res.text()}`).toBeTruthy();
    const body = await res.json();
    const products: any[] = body.data ?? [];

    if (products.length === 0) testInfo.skip(true, 'Vendor has no products linked — cannot validate field shape');
    for (const p of products) {
      // The low-threshold client filter requires both fields. Either may be
      // null (no threshold set) but the keys must exist on the row.
      expect(p, `product row missing reorderThreshold key: ${JSON.stringify(p)}`).toHaveProperty('reorderThreshold');
      expect(p, `product row missing inStockQty key: ${JSON.stringify(p)}`).toHaveProperty('inStockQty');
    }
  });
});

// ─── #3 Resend email ──────────────────────────────────────────────────────────

test.describe('PO #3: resend-email endpoint', () => {
  test('returns 400 with NO_VENDOR_EMAIL when vendor has no email', async ({ apiClient }, testInfo) => {
    const location = await getFirstLocation(apiClient, testInfo);
    const product = await getFirstProduct(apiClient, testInfo);

    // Vendor with no email field
    const vendor = qaThirdPartyVendor();
    delete (vendor as any).email;
    const vendorRes = await apiClient.createDashboardPayee(vendor);
    expect(vendorRes.ok()).toBeTruthy();
    const { data: vendorRow } = await vendorRes.json();

    const poRes = await apiClient.createPurchaseOrder(
      qaPurchaseOrder({ payeeId: vendorRow.id, locationId: location.id, productId: product.id }),
    );
    expect(poRes.ok(), `createPurchaseOrder failed: ${poRes.status()} ${await poRes.text()}`).toBeTruthy();
    const { data: po } = await poRes.json();

    const resendRes = await apiClient.resendPurchaseOrderEmail(po.id);
    expect(resendRes.status()).toBe(400);
    const body = await resendRes.json();
    expect(body.error?.code).toBe('NO_VENDOR_EMAIL');
  });

  test('returns 200 + recipient when vendor has an email', async ({ apiClient }, testInfo) => {
    const location = await getFirstLocation(apiClient, testInfo);
    const product = await getFirstProduct(apiClient, testInfo);

    const vendorRes = await apiClient.createDashboardPayee(qaThirdPartyVendor());
    expect(vendorRes.ok()).toBeTruthy();
    const { data: vendor } = await vendorRes.json();

    const poRes = await apiClient.createPurchaseOrder(
      qaPurchaseOrder({ payeeId: vendor.id, locationId: location.id, productId: product.id }),
    );
    expect(poRes.ok(), `createPurchaseOrder failed: ${poRes.status()} ${await poRes.text()}`).toBeTruthy();
    const { data: po } = await poRes.json();

    const resendRes = await apiClient.resendPurchaseOrderEmail(po.id);
    expect(resendRes.ok(), `resend failed: ${resendRes.status()} ${await resendRes.text()}`).toBeTruthy();
    const body = await resendRes.json();
    expect(body.data?.sent).toBe(true);
    expect(body.data?.to).toBe(vendor.email);
  });

  test('returns 404 for unknown PO id', async ({ apiClient }) => {
    const res = await apiClient.resendPurchaseOrderEmail('00000000-0000-0000-0000-000000000000');
    expect([404, 400]).toContain(res.status());
  });
});

// ─── #4 NIB warehouse PO appears in warehouse-orders ──────────────────────────

test.describe('PO #4: NIB warehouse PO surfaces in warehouse-orders feed', () => {
  test('PO from store → in-house warehouse vendor appears for the same tenant', async ({ apiClient }, testInfo) => {
    const warehousesRes = await apiClient.getWarehouses();
    expect(warehousesRes.ok(), `getWarehouses failed: ${warehousesRes.status()}`).toBeTruthy();
    const { data: warehouses } = await warehousesRes.json();
    const inhouse = (warehouses as any[]).find((w) => w.source === 'location');
    if (!inhouse) testInfo.skip(true, 'No in-house warehouse-type location — cannot validate NIB flow');

    // Pick a non-warehouse store location to be the buyer
    const locsRes = await apiClient.getLocations();
    const { data: locations } = await locsRes.json();
    const storeLocation = (locations as any[]).find((l) => l.type !== 'warehouse');
    if (!storeLocation) testInfo.skip(true, 'No store-type location to place buyer side');

    // Create the in-house warehouse vendor
    const vendorRes = await apiClient.createDashboardPayee(
      qaWarehouseVendor(inhouse.id, inhouse.locationId ?? null),
    );
    expect(vendorRes.ok(), `create whse vendor failed: ${vendorRes.status()} ${await vendorRes.text()}`).toBeTruthy();
    const { data: vendor } = await vendorRes.json();

    // Need a product the warehouse stocks at the linked location. Pull the
    // first product from the vendor's catalog (resolveVendorProductIds joins
    // product_locations for in-house warehouses).
    const vpRes = await apiClient.getPayeeProducts(vendor.id);
    expect(vpRes.ok()).toBeTruthy();
    const vpBody = await vpRes.json();
    const product = (vpBody.data as any[])[0];
    if (!product) testInfo.skip(true, 'Warehouse has no stock — cannot place NIB PO');

    const poRes = await apiClient.createPurchaseOrder(
      qaPurchaseOrder({ payeeId: vendor.id, locationId: storeLocation.id, productId: product.id, quantity: 1 }),
    );
    // Warehouse stock check could legitimately reject if availability is 0;
    // skip rather than fail in that case.
    if (!poRes.ok()) {
      const txt = await poRes.text();
      if (txt.includes('INSUFFICIENT_WAREHOUSE_STOCK') || txt.includes('not_stocked')) {
        testInfo.skip(true, `warehouse stock check rejected: ${txt}`);
      }
      throw new Error(`createPurchaseOrder failed: ${poRes.status()} ${txt}`);
    }
    const { data: po } = await poRes.json();
    expect(po.warehouseTenantId).toBeTruthy();
    expect(po.sourceType).toBe('warehouse');

    // The same tenant viewing /warehouse-orders should now see this row.
    const woRes = await apiClient.getWarehouseOrders();
    expect(woRes.ok(), `getWarehouseOrders failed: ${woRes.status()}`).toBeTruthy();
    const { data: warehouseOrders } = await woRes.json();
    const found = (warehouseOrders as any[]).find((o) => o.id === po.id);
    expect(found, `PO ${po.id} not visible in /warehouse-orders for this tenant`).toBeTruthy();
  });
});

// ─── #6 PO status filter ──────────────────────────────────────────────────────

test.describe("PO #6: status filter still accepts 'generated' (UI label 'Sent')", () => {
  test('GET /purchase-orders?status=generated returns only generated rows', async ({ apiClient }) => {
    const res = await apiClient.getPurchaseOrders({ status: 'generated' });
    expect(res.ok()).toBeTruthy();
    const { data } = await res.json();
    for (const po of data) {
      expect(po.status).toBe('generated');
    }
  });
});
