import { test, expect } from '../../fixtures/auth.fixture';
import { qaCustomer, qaPaymentLink, qaAchSaleWithAuth } from '../../helpers/test-data';

test.describe('Post-Deploy: Payment Links', () => {
  test('list payment links returns array', async ({ apiClient }) => {
    const res = await apiClient.getPaymentLinks();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const links = body.data ?? body;
    expect(Array.isArray(links)).toBe(true);
  });

  test('create payment link with valid data', async ({ apiClient }) => {
    const custRes = await apiClient.createCustomer(qaCustomer());
    expect(custRes.ok(), `create customer failed: ${custRes.status()}`).toBeTruthy();
    const custBody = await custRes.json();
    const customerId = (custBody.data ?? custBody).id;

    const data = qaPaymentLink(customerId);
    const res = await apiClient.createPaymentLink(data);
    expect(res.ok(), `create link failed: ${res.status()} ${await res.text()}`).toBeTruthy();
    const body = await res.json();
    const link = body.data ?? body;
    expect(link).toHaveProperty('publicToken');
    expect(link).toHaveProperty('id');
    expect(parseFloat(link.amount)).toBe(25.0);
  });

  test('create payment link validates amount', async ({ apiClient }) => {
    const custRes = await apiClient.createCustomer(qaCustomer());
    expect(custRes.ok()).toBeTruthy();
    const custBody = await custRes.json();
    const customerId = (custBody.data ?? custBody).id;

    const res = await apiClient.createPaymentLink({
      customerId,
      amount: 0,
      dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    });
    expect(res.ok()).toBe(false);
  });
});

test.describe('Post-Deploy: Sale Transactions — Response Shape', () => {
  test('sale transactions list returns expected fields', async ({ apiClient }) => {
    const res = await apiClient.getSaleTransactions();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    if (body.data.length > 0) {
      const sale = body.data[0];
      expect(sale).toHaveProperty('id');
      expect(sale).toHaveProperty('paymentMethod');
      expect(sale).toHaveProperty('status');
      expect(sale).toHaveProperty('amount');
      expect(sale).toHaveProperty('referenceNumber');
    }
  });
});

test.describe('Post-Deploy: ACH Sale — Authorization Type', () => {
  test('create ACH sale with web authorization type', async ({ apiClient }) => {
    const data = qaAchSaleWithAuth();
    const res = await apiClient.createSaleTransaction(data);
    if (res.ok()) {
      const body = await res.json();
      const sale = body.data;
      expect(sale.paymentMethod).toBe('ach');
    } else {
      // Gateway may not be configured in all environments — ensure it's not a validation error
      expect(res.status()).not.toBe(400);
    }
  });
});
