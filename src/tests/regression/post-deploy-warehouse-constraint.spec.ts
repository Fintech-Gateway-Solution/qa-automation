/**
 * Post-deployment regression: Single-warehouse constraint (auto-delink).
 *
 * Verifies that only one vendor can be linked to a given warehouse at a time.
 * When vendor B is linked to warehouse X, vendor A (previously linked) gets
 * auto-delinked to third_party.
 *
 * Run: BASE_URL=https://finstage.qpaymentz.com npx playwright test regression/post-deploy-warehouse-constraint
 */

import { test, expect } from '../../fixtures/auth.fixture';
import { qaThirdPartyVendor } from '../../helpers/test-data';

test.describe('Post-Deploy: Single Warehouse Constraint', () => {
  let vendorAId: string;
  let vendorBId: string;
  let warehouseId: string;
  let warehouseLocationId: string | null;

  test.beforeAll(async ({ apiClient }, testInfo) => {
    const whRes = await apiClient.getWarehouses();
    expect(whRes.ok()).toBeTruthy();
    const { data: warehouses } = await whRes.json();
    const inhouse = (warehouses as any[]).find((w) => w.source === 'location');
    if (!inhouse) {
      testInfo.skip(true, 'No in-house warehouse available');
      return;
    }
    warehouseId = inhouse.id;
    warehouseLocationId = inhouse.locationId ?? null;

    // Create two third-party vendors
    const [resA, resB] = await Promise.all([
      apiClient.createDashboardPayee(qaThirdPartyVendor()),
      apiClient.createDashboardPayee(qaThirdPartyVendor()),
    ]);
    expect(resA.ok()).toBeTruthy();
    expect(resB.ok()).toBeTruthy();
    vendorAId = (await resA.json()).data.id;
    vendorBId = (await resB.json()).data.id;
  });

  test('link vendor A to warehouse', async ({ apiClient }) => {
    const res = await apiClient.updateDashboardPayee(vendorAId, {
      vendorType: 'warehouse',
      linkedWarehouseId: warehouseId,
      linkedWarehouseLocationId: warehouseLocationId,
    });
    expect(res.ok()).toBeTruthy();
    const { data } = await res.json();
    expect(data.vendorType).toBe('warehouse');
    expect(data.linkedWarehouseId).toBe(warehouseId);
  });

  test('link vendor B to same warehouse → vendor A auto-delinked', async ({ apiClient }) => {
    // Link vendor B
    const linkRes = await apiClient.updateDashboardPayee(vendorBId, {
      vendorType: 'warehouse',
      linkedWarehouseId: warehouseId,
      linkedWarehouseLocationId: warehouseLocationId,
    });
    expect(linkRes.ok()).toBeTruthy();
    const { data: vendorB } = await linkRes.json();
    expect(vendorB.vendorType).toBe('warehouse');
    expect(vendorB.linkedWarehouseId).toBe(warehouseId);

    // Verify vendor A was auto-delinked
    const aRes = await apiClient.getDashboardPayee(vendorAId);
    expect(aRes.ok()).toBeTruthy();
    const { data: vendorA } = await aRes.json();
    expect(vendorA.vendorType).toBe('third_party');
    expect(vendorA.linkedWarehouseId).toBeNull();
    expect(vendorA.linkedWarehouseLocationId).toBeNull();
  });

  test('create vendor C linked to warehouse via POST → vendor B auto-delinked', async ({ apiClient }) => {
    const vendorData = qaThirdPartyVendor();
    const createRes = await apiClient.createDashboardPayee({
      ...vendorData,
      vendorType: 'warehouse',
      linkedWarehouseId: warehouseId,
      linkedWarehouseLocationId: warehouseLocationId,
    });
    expect(createRes.ok(), `create linked vendor failed: ${createRes.status()}`).toBeTruthy();
    const { data: vendorC } = await createRes.json();
    expect(vendorC.vendorType).toBe('warehouse');
    expect(vendorC.linkedWarehouseId).toBe(warehouseId);

    // Verify vendor B was auto-delinked
    const bRes = await apiClient.getDashboardPayee(vendorBId);
    expect(bRes.ok()).toBeTruthy();
    const { data: vendorB } = await bRes.json();
    expect(vendorB.vendorType).toBe('third_party');
    expect(vendorB.linkedWarehouseId).toBeNull();
  });
});
