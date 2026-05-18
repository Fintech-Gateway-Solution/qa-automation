import { test, expect } from '../../fixtures/auth.fixture';
import { qaThirdPartyVendor, qaPurchaseOrder } from '../../helpers/test-data';

async function getFirstLocation(apiClient: any) {
  const res = await apiClient.getLocations();
  expect(res.ok()).toBeTruthy();
  const { data: locations } = await res.json();
  return locations[0];
}

async function getFirstProduct(apiClient: any) {
  const res = await apiClient.getProducts();
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const products: any[] = body.data ?? body;
  return products[0];
}

async function createAndReceivePO(apiClient: any) {
  const location = await getFirstLocation(apiClient);
  const product = await getFirstProduct(apiClient);
  const vendorRes = await apiClient.createDashboardPayee(qaThirdPartyVendor());
  expect(vendorRes.ok()).toBeTruthy();
  const { data: vendor } = await vendorRes.json();
  const poRes = await apiClient.createPurchaseOrder(
    qaPurchaseOrder({ payeeId: vendor.id, locationId: location.id, productId: product.id }),
  );
  expect(poRes.ok()).toBeTruthy();
  const { data: po } = await poRes.json();
  await apiClient.sendPurchaseOrder(po.id);
  await apiClient.receivePurchaseOrder(po.id);
  return po;
}

test.describe('Post-Deploy: PO Completed Status', () => {
  test('receive already-paid PO jumps to completed', async ({ apiClient }) => {
    const location = await getFirstLocation(apiClient);
    const product = await getFirstProduct(apiClient);
    const vendorRes = await apiClient.createDashboardPayee(qaThirdPartyVendor());
    expect(vendorRes.ok()).toBeTruthy();
    const { data: vendor } = await vendorRes.json();
    const poRes = await apiClient.createPurchaseOrder(
      qaPurchaseOrder({ payeeId: vendor.id, locationId: location.id, productId: product.id }),
    );
    expect(poRes.ok()).toBeTruthy();
    const { data: po } = await poRes.json();

    // Mark paid while still draft
    const paidRes = await apiClient.updatePurchaseOrder(po.id, { orderPaid: true });
    expect(paidRes.ok()).toBeTruthy();

    // Send then receive
    await apiClient.sendPurchaseOrder(po.id);
    const recvRes = await apiClient.receivePurchaseOrder(po.id);
    expect(recvRes.ok()).toBeTruthy();

    const get = await apiClient.getPurchaseOrder(po.id);
    const { data: final } = await get.json();
    expect(final.status).toBe('completed');
    expect(final.orderPaid).toBe(true);
  });

  test('toggle orderPaid on completed PO transitions to received', async ({ apiClient }) => {
    const po = await createAndReceivePO(apiClient);
    // Mark paid → completed
    const paidRes = await apiClient.updatePurchaseOrder(po.id, { orderPaid: true });
    expect(paidRes.ok()).toBeTruthy();
    const { data: completed } = await paidRes.json();
    expect(completed.status).toBe('completed');

    // Unmark paid → received
    const unpaidRes = await apiClient.updatePurchaseOrder(po.id, { orderPaid: false });
    expect(unpaidRes.ok()).toBeTruthy();
    const { data: received } = await unpaidRes.json();
    expect(received.status).toBe('received');
    expect(received.orderPaid).toBe(false);
  });

  test('cannot update items on completed PO', async ({ apiClient }) => {
    const po = await createAndReceivePO(apiClient);
    await apiClient.updatePurchaseOrder(po.id, { orderPaid: true });

    const product = await getFirstProduct(apiClient);
    const res = await apiClient.updatePurchaseOrder(po.id, {
      items: [{ productId: product.id, unitOfMeasure: 'each', quantity: 99, costPerUnit: 1 }],
    });
    expect(res.ok()).toBe(false);
    expect(res.status()).toBe(400);
  });

  test('cannot cancel completed PO', async ({ apiClient }) => {
    const po = await createAndReceivePO(apiClient);
    await apiClient.updatePurchaseOrder(po.id, { orderPaid: true });

    const res = await apiClient.cancelPurchaseOrder(po.id);
    expect(res.ok()).toBe(false);
    expect(res.status()).toBe(400);
  });

  test('cannot delete completed PO', async ({ apiClient }) => {
    const po = await createAndReceivePO(apiClient);
    await apiClient.updatePurchaseOrder(po.id, { orderPaid: true });

    const res = await apiClient.deletePurchaseOrder(po.id);
    expect(res.ok()).toBe(false);
    expect(res.status()).toBe(400);
  });
});
