/**
 * Post-deployment regression: Warehouse link / unlink on vendor.
 *
 * Tests linking a vendor to an in-house warehouse, verifying it persists,
 * then unlinking back to third_party.
 *
 * Run: BASE_URL=https://finstage.qpaymentz.com npx playwright test regression/post-deploy-warehouse-link
 */

import { test, expect } from '../../fixtures/auth.fixture';
import { qaThirdPartyVendor } from '../../helpers/test-data';

test.describe('Post-Deploy: Warehouse Link / Unlink', () => {
  let vendorId: string;
  let warehouseId: string;
  let warehouseLocationId: string | null;

  test.beforeAll(async ({ apiClient }, testInfo) => {
    // Find an in-house warehouse
    const whRes = await apiClient.getWarehouses();
    expect(whRes.ok()).toBeTruthy();
    const { data: warehouses } = await whRes.json();
    const inhouse = (warehouses as any[]).find((w) => w.source === 'location');
    if (!inhouse) {
      testInfo.skip(true, 'No in-house warehouse available — skipping link/unlink tests');
      return;
    }
    warehouseId = inhouse.id;
    warehouseLocationId = inhouse.locationId ?? null;

    // Create a third-party vendor
    const vendorRes = await apiClient.createDashboardPayee(qaThirdPartyVendor());
    expect(vendorRes.ok(), `create vendor failed: ${vendorRes.status()}`).toBeTruthy();
    const { data: vendor } = await vendorRes.json();
    vendorId = vendor.id;
  });

  test('link vendor to in-house warehouse', async ({ apiClient }) => {
    const res = await apiClient.updateDashboardPayee(vendorId, {
      vendorType: 'warehouse',
      linkedWarehouseId: warehouseId,
      linkedWarehouseLocationId: warehouseLocationId,
    });
    expect(res.ok(), `link failed: ${res.status()} ${await res.text()}`).toBeTruthy();
    const { data: updated } = await res.json();
    expect(updated.vendorType).toBe('warehouse');
    expect(updated.linkedWarehouseId).toBe(warehouseId);
  });

  test('GET confirms warehouse link persists', async ({ apiClient }) => {
    const res = await apiClient.getDashboardPayee(vendorId);
    expect(res.ok()).toBeTruthy();
    const { data: vendor } = await res.json();
    expect(vendor.vendorType).toBe('warehouse');
    expect(vendor.linkedWarehouseId).toBe(warehouseId);
  });

  test('unlink vendor back to third_party', async ({ apiClient }) => {
    const res = await apiClient.updateDashboardPayee(vendorId, {
      vendorType: 'third_party',
      linkedWarehouseId: null,
      linkedWarehouseLocationId: null,
    });
    expect(res.ok(), `unlink failed: ${res.status()} ${await res.text()}`).toBeTruthy();
    const { data: updated } = await res.json();
    expect(updated.vendorType).toBe('third_party');
    expect(updated.linkedWarehouseId).toBeNull();
  });

  test('GET confirms unlink persists', async ({ apiClient }) => {
    const res = await apiClient.getDashboardPayee(vendorId);
    expect(res.ok()).toBeTruthy();
    const { data: vendor } = await res.json();
    expect(vendor.vendorType).toBe('third_party');
    expect(vendor.linkedWarehouseId).toBeNull();
  });
});
