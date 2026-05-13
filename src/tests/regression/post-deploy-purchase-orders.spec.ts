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

test.describe('Post-Deploy: Purchase Orders', () => {
  test('list purchase orders returns array', async ({ apiClient }) => {
    const res = await apiClient.getPurchaseOrders();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const orders = body.data ?? body;
    expect(Array.isArray(orders)).toBe(true);
  });

  test('create PO with valid data', async ({ apiClient }) => {
    const location = await getFirstLocation(apiClient);
    const product = await getFirstProduct(apiClient);
    const vendor = await createTestVendor(apiClient);

    const poData = qaPurchaseOrder({ payeeId: vendor.id, locationId: location.id, productId: product.id });
    const res = await apiClient.createPurchaseOrder(poData);
    expect(res.ok(), `create PO failed: ${res.status()} ${await res.text()}`).toBeTruthy();
    const body = await res.json();
    const po = body.data ?? body;
    expect(po).toHaveProperty('id');
    expect(po.status).toBe('draft');
    expect(po.payeeId).toBe(vendor.id);
  });

  test('PO lifecycle: draft → sent → received', async ({ apiClient }) => {
    const location = await getFirstLocation(apiClient);
    const product = await getFirstProduct(apiClient);
    const vendor = await createTestVendor(apiClient);

    const poRes = await apiClient.createPurchaseOrder(
      qaPurchaseOrder({ payeeId: vendor.id, locationId: location.id, productId: product.id }),
    );
    expect(poRes.ok()).toBeTruthy();
    const { data: po } = await poRes.json();

    const sendRes = await apiClient.sendPurchaseOrder(po.id);
    expect(sendRes.ok(), `send PO failed: ${sendRes.status()}`).toBeTruthy();

    const afterSend = await apiClient.getPurchaseOrder(po.id);
    expect(afterSend.ok()).toBeTruthy();
    const { data: sentPo } = await afterSend.json();
    expect(sentPo.status).toBe('sent');

    const receiveRes = await apiClient.receivePurchaseOrder(po.id);
    expect(receiveRes.ok(), `receive PO failed: ${receiveRes.status()}`).toBeTruthy();

    const afterReceive = await apiClient.getPurchaseOrder(po.id);
    expect(afterReceive.ok()).toBeTruthy();
    const { data: receivedPo } = await afterReceive.json();
    expect(receivedPo.status).toBe('received');
  });

  test('get single PO by ID', async ({ apiClient }) => {
    const res = await apiClient.getPurchaseOrders();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const orders: any[] = body.data ?? body;
    if (orders.length === 0) return;

    const single = await apiClient.getPurchaseOrder(orders[0].id);
    expect(single.ok()).toBeTruthy();
    const { data: po } = await single.json();
    expect(po.id).toBe(orders[0].id);
  });
});

test.describe('Post-Deploy: Vendors (Dashboard Payees)', () => {
  test('list vendors returns array', async ({ apiClient }) => {
    const res = await apiClient.getDashboardPayees();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const payees = body.data ?? body;
    expect(Array.isArray(payees)).toBe(true);
  });

  test('create vendor with valid data', async ({ apiClient }) => {
    const vendor = await createTestVendor(apiClient);
    expect(vendor).toHaveProperty('id');
    expect(vendor.name).toContain('QA-Vendor');
  });

  test('get single vendor by ID', async ({ apiClient }) => {
    const vendor = await createTestVendor(apiClient);
    const res = await apiClient.getDashboardPayee(vendor.id);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const fetched = body.data ?? body;
    expect(fetched.id).toBe(vendor.id);
  });

  test('update vendor', async ({ apiClient }) => {
    const vendor = await createTestVendor(apiClient);
    const res = await apiClient.updateDashboardPayee(vendor.id, { contactName: 'Updated QA Contact' });
    expect(res.ok(), `update vendor failed: ${res.status()}`).toBeTruthy();
    const body = await res.json();
    const updated = body.data ?? body;
    expect(updated.contactName).toBe('Updated QA Contact');
  });
});

test.describe('Post-Deploy: Warehouses', () => {
  test('list warehouses returns array', async ({ apiClient }) => {
    const res = await apiClient.getWarehouses();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const warehouses = body.data ?? body;
    expect(Array.isArray(warehouses)).toBe(true);
  });
});

async function createTestVendor(apiClient: any) {
  const res = await apiClient.createDashboardPayee(qaThirdPartyVendor());
  expect(res.ok(), `create vendor failed: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  return body.data ?? body;
}
