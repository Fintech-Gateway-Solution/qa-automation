/**
 * Post-deployment regression: PO paid toggle.
 *
 * Creates a PO, sends it, receives it (status=received), then toggles
 * orderPaid ON (should become completed) and OFF (should revert to received).
 *
 * Run: BASE_URL=https://finstage.qpaymentz.com npx playwright test regression/post-deploy-po-paid
 */

import { test, expect } from '../../fixtures/auth.fixture';
import { qaThirdPartyVendor, qaPurchaseOrder } from '../../helpers/test-data';

async function getFirstLocation(apiClient: any) {
  const res = await apiClient.getLocations();
  expect(res.ok()).toBeTruthy();
  const { data: locations } = await res.json();
  expect(locations.length).toBeGreaterThan(0);
  return locations[0];
}

async function getFirstProduct(apiClient: any) {
  const res = await apiClient.getProducts();
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const products: any[] = body.data ?? body;
  expect(products.length).toBeGreaterThan(0);
  return products[0];
}

test.describe('Post-Deploy: PO Paid Toggle', () => {
  let poId: string;

  test('setup: create PO and move to received status', async ({ apiClient }) => {
    const location = await getFirstLocation(apiClient);
    const product = await getFirstProduct(apiClient);

    const vendorRes = await apiClient.createDashboardPayee(qaThirdPartyVendor());
    expect(vendorRes.ok(), `create vendor failed: ${vendorRes.status()}`).toBeTruthy();
    const { data: vendor } = await vendorRes.json();

    const poRes = await apiClient.createPurchaseOrder(
      qaPurchaseOrder({ payeeId: vendor.id, locationId: location.id, productId: product.id }),
    );
    expect(poRes.ok(), `create PO failed: ${poRes.status()} ${await poRes.text()}`).toBeTruthy();
    const { data: po } = await poRes.json();
    poId = po.id;

    const sendRes = await apiClient.sendPurchaseOrder(poId);
    expect(sendRes.ok(), `send PO failed: ${sendRes.status()} ${await sendRes.text()}`).toBeTruthy();

    const receiveRes = await apiClient.receivePurchaseOrder(poId);
    expect(receiveRes.ok(), `receive PO failed: ${receiveRes.status()} ${await receiveRes.text()}`).toBeTruthy();

    const getRes = await apiClient.getPurchaseOrder(poId);
    expect(getRes.ok()).toBeTruthy();
    const { data: receivedPo } = await getRes.json();
    expect(receivedPo.status).toBe('received');
  });

  test('toggle paid ON: received → completed', async ({ apiClient }) => {
    const res = await apiClient.updatePurchaseOrder(poId, { orderPaid: true });
    expect(res.ok(), `paid ON failed: ${res.status()} ${await res.text()}`).toBeTruthy();
    const { data: updated } = await res.json();
    expect(updated.orderPaid).toBe(true);
    expect(updated.status).toBe('completed');
  });

  test('toggle paid OFF: completed → received', async ({ apiClient }) => {
    const res = await apiClient.updatePurchaseOrder(poId, { orderPaid: false });
    expect(res.ok(), `paid OFF failed: ${res.status()} ${await res.text()}`).toBeTruthy();
    const { data: updated } = await res.json();
    expect(updated.orderPaid).toBe(false);
    expect(updated.status).toBe('received');
  });

  test('GET confirms final state is received + unpaid', async ({ apiClient }) => {
    const res = await apiClient.getPurchaseOrder(poId);
    expect(res.ok()).toBeTruthy();
    const { data: po } = await res.json();
    expect(po.status).toBe('received');
    expect(po.orderPaid).toBe(false);
  });
});
