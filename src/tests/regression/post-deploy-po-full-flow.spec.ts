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

async function createVendor(apiClient: any) {
  const res = await apiClient.createDashboardPayee(qaThirdPartyVendor());
  expect(res.ok(), `create vendor failed: ${res.status()}`).toBeTruthy();
  const { data } = await res.json();
  return data;
}

async function createDraftPO(apiClient: any) {
  const location = await getFirstLocation(apiClient);
  const product = await getFirstProduct(apiClient);
  const vendor = await createVendor(apiClient);
  const poData = qaPurchaseOrder({ payeeId: vendor.id, locationId: location.id, productId: product.id });
  const res = await apiClient.createPurchaseOrder(poData);
  expect(res.ok(), `create PO failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const { data: po } = await res.json();
  return po;
}

test.describe('Post-Deploy: PO Full Lifecycle (draft → sent → received → completed)', () => {
  let poId: string;

  test('create draft PO', async ({ apiClient }) => {
    const po = await createDraftPO(apiClient);
    poId = po.id;
    expect(po.status).toBe('draft');
    expect(po.orderPaid).toBe(false);
  });

  test('send PO (draft → sent)', async ({ apiClient }) => {
    const res = await apiClient.sendPurchaseOrder(poId);
    expect(res.ok(), `send failed: ${res.status()} ${await res.text()}`).toBeTruthy();

    const get = await apiClient.getPurchaseOrder(poId);
    const { data: po } = await get.json();
    expect(po.status).toBe('sent');
  });

  test('resend PO email', async ({ apiClient }) => {
    const res = await apiClient.resendPurchaseOrderEmail(poId);
    expect(res.ok(), `resend failed: ${res.status()}`).toBeTruthy();
  });

  test('receive PO (sent → received)', async ({ apiClient }) => {
    const res = await apiClient.receivePurchaseOrder(poId);
    expect(res.ok(), `receive failed: ${res.status()} ${await res.text()}`).toBeTruthy();

    const get = await apiClient.getPurchaseOrder(poId);
    const { data: po } = await get.json();
    expect(po.status).toBe('received');
  });

  test('mark paid (received → completed)', async ({ apiClient }) => {
    const res = await apiClient.updatePurchaseOrder(poId, { orderPaid: true });
    expect(res.ok(), `mark paid failed: ${res.status()}`).toBeTruthy();
    const { data: po } = await res.json();
    expect(po.status).toBe('completed');
    expect(po.orderPaid).toBe(true);
  });

  test('unmark paid (completed → received)', async ({ apiClient }) => {
    const res = await apiClient.updatePurchaseOrder(poId, { orderPaid: false });
    expect(res.ok()).toBeTruthy();
    const { data: po } = await res.json();
    expect(po.status).toBe('received');
    expect(po.orderPaid).toBe(false);
  });
});

test.describe('Post-Deploy: PO Cancel Flow', () => {
  test('cancel draft PO', async ({ apiClient }) => {
    const po = await createDraftPO(apiClient);

    const res = await apiClient.cancelPurchaseOrder(po.id, 'QA test cancel');
    expect(res.ok(), `cancel draft failed: ${res.status()} ${await res.text()}`).toBeTruthy();

    const get = await apiClient.getPurchaseOrder(po.id);
    const { data: cancelled } = await get.json();
    expect(cancelled.status).toBe('cancelled');
  });

  test('cancel sent PO', async ({ apiClient }) => {
    const po = await createDraftPO(apiClient);
    const sendRes = await apiClient.sendPurchaseOrder(po.id);
    expect(sendRes.ok()).toBeTruthy();

    const res = await apiClient.cancelPurchaseOrder(po.id, 'QA test cancel sent');
    expect(res.ok(), `cancel sent failed: ${res.status()} ${await res.text()}`).toBeTruthy();

    const get = await apiClient.getPurchaseOrder(po.id);
    const { data: cancelled } = await get.json();
    expect(cancelled.status).toBe('cancelled');
  });

  test('cannot cancel received PO', async ({ apiClient }) => {
    const po = await createDraftPO(apiClient);
    await apiClient.sendPurchaseOrder(po.id);
    await apiClient.receivePurchaseOrder(po.id);

    const res = await apiClient.cancelPurchaseOrder(po.id);
    expect(res.ok()).toBe(false);
    expect(res.status()).toBe(400);
  });

  test('cannot cancel already cancelled PO', async ({ apiClient }) => {
    const po = await createDraftPO(apiClient);
    await apiClient.cancelPurchaseOrder(po.id);

    const res = await apiClient.cancelPurchaseOrder(po.id);
    expect(res.ok()).toBe(false);
    expect(res.status()).toBe(400);
  });
});

test.describe('Post-Deploy: PO Delete Flow', () => {
  test('delete draft PO (soft delete)', async ({ apiClient }) => {
    const po = await createDraftPO(apiClient);

    const res = await apiClient.deletePurchaseOrder(po.id);
    expect(res.ok(), `delete failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  });

  test('cannot delete sent PO', async ({ apiClient }) => {
    const po = await createDraftPO(apiClient);
    await apiClient.sendPurchaseOrder(po.id);

    const res = await apiClient.deletePurchaseOrder(po.id);
    expect(res.ok()).toBe(false);
    expect(res.status()).toBe(400);
  });
});

test.describe('Post-Deploy: PO Update (edit draft)', () => {
  test('update draft PO notes and items', async ({ apiClient }) => {
    const po = await createDraftPO(apiClient);
    const product = await getFirstProduct(apiClient);

    const res = await apiClient.updatePurchaseOrder(po.id, {
      notes: 'Updated by QA automation',
      items: [
        { productId: product.id, unitOfMeasure: 'each', quantity: 5, costPerUnit: 10 },
      ],
    });
    expect(res.ok(), `update failed: ${res.status()} ${await res.text()}`).toBeTruthy();
    const { data: updated } = await res.json();
    expect(updated.notes).toBe('Updated by QA automation');
  });
});

test.describe('Post-Deploy: PO Send Validation', () => {
  test('cannot send non-draft PO', async ({ apiClient }) => {
    const po = await createDraftPO(apiClient);
    await apiClient.sendPurchaseOrder(po.id);

    const res = await apiClient.sendPurchaseOrder(po.id);
    expect(res.ok()).toBe(false);
    expect(res.status()).toBe(400);
  });

  test('receive draft PO skips sent step', async ({ apiClient }) => {
    const po = await createDraftPO(apiClient);

    const res = await apiClient.receivePurchaseOrder(po.id);
    expect(res.ok()).toBeTruthy();
    const get = await apiClient.getPurchaseOrder(po.id);
    const { data: received } = await get.json();
    expect(received.status).toBe('received');
  });
});

test.describe('Post-Deploy: PO Email Log & Edit History', () => {
  test('email log exists after send', async ({ apiClient }) => {
    const po = await createDraftPO(apiClient);
    await apiClient.sendPurchaseOrder(po.id);

    const res = await apiClient.getPurchaseOrderEmailLog(po.id);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const logs: any[] = body.data ?? body;
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].kind).toBe('sent');
  });

  test('edit history exists after update', async ({ apiClient }) => {
    const po = await createDraftPO(apiClient);
    await apiClient.updatePurchaseOrder(po.id, { notes: 'Edit for audit trail' });

    const res = await apiClient.getPurchaseOrderEdits(po.id);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const edits: any[] = body.data ?? body;
    expect(Array.isArray(edits)).toBe(true);
  });
});

test.describe('Post-Deploy: PO Multi-Item', () => {
  test('create PO with multiple items', async ({ apiClient }) => {
    const location = await getFirstLocation(apiClient);
    const product = await getFirstProduct(apiClient);
    const vendor = await createVendor(apiClient);

    const res = await apiClient.createPurchaseOrder({
      payeeId: vendor.id,
      locationId: location.id,
      createdByName: 'QA Automation',
      items: [
        { productId: product.id, unitOfMeasure: 'each', quantity: 3, costPerUnit: 5 },
        { productId: product.id, unitOfMeasure: 'each', quantity: 2, costPerUnit: 10 },
      ],
    });
    expect(res.ok(), `create multi-item PO failed: ${res.status()}`).toBeTruthy();
    const { data: po } = await res.json();
    expect(po.status).toBe('draft');
  });
});
