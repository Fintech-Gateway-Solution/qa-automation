import { test, expect } from '../../fixtures/auth.fixture';
import { qaAchSaleTransaction, qaCardSaleTransaction } from '../../helpers/test-data';

test.describe('Post-Deploy: Sale Transactions — ACH', () => {
  let saleId: string;

  test('create ACH sale transaction', async ({ apiClient }) => {
    const data = qaAchSaleTransaction();
    const res = await apiClient.createSaleTransaction(data);
    expect(res.status()).toBe(201);
    const body = await res.json();
    const sale = body.data;
    saleId = sale.id;
    expect(sale.paymentMethod).toBe('ach');
    expect(sale.status).toBe('completed');
    expect(sale.referenceNumber).toMatch(/^ST-/);
    expect(parseFloat(sale.amount)).toBe(25.0);
  });

  test('get ACH sale by ID', async ({ apiClient }) => {
    const res = await apiClient.getSaleTransaction(saleId);
    expect(res.ok()).toBeTruthy();
    const { data: sale } = await res.json();
    expect(sale.id).toBe(saleId);
    expect(sale.paymentMethod).toBe('ach');
  });

  test('ACH sale validates required fields', async ({ apiClient }) => {
    const noAmount = await apiClient.createSaleTransaction({ paymentMethod: 'ach' });
    expect(noAmount.status()).toBe(400);

    const noRouting = await apiClient.createSaleTransaction({
      amount: '10.00',
      paymentMethod: 'ach',
      accountType: 'checking',
      accountCategory: 'personal',
      routingNumber: '123',
      accountNumber: '123456',
      firstName: 'Test',
      lastName: 'User',
      phone: '5551234567',
    });
    expect(noRouting.status()).toBe(400);
  });

  test('ACH sale validates amount range', async ({ apiClient }) => {
    const tooLow = await apiClient.createSaleTransaction({
      ...qaAchSaleTransaction(),
      amount: '0.00',
    });
    expect(tooLow.status()).toBe(400);

    const tooHigh = await apiClient.createSaleTransaction({
      ...qaAchSaleTransaction(),
      amount: '9999999.99',
    });
    expect(tooHigh.status()).toBe(400);
  });
});

test.describe('Post-Deploy: Sale Transactions — Card', () => {
  let saleId: string;

  test('create card sale transaction', async ({ apiClient }) => {
    const data = qaCardSaleTransaction();
    const res = await apiClient.createSaleTransaction(data);
    expect(res.status()).toBe(201);
    const body = await res.json();
    const sale = body.data;
    saleId = sale.id;
    expect(sale.paymentMethod).toBe('card');
    expect(sale.status).toBe('completed');
    expect(sale.cardLastFour).toBe('1111');
  });

  test('get card sale by ID', async ({ apiClient }) => {
    const res = await apiClient.getSaleTransaction(saleId);
    expect(res.ok()).toBeTruthy();
    const { data: sale } = await res.json();
    expect(sale.id).toBe(saleId);
    expect(sale.paymentMethod).toBe('card');
    expect(sale.cardLastFour).toBe('1111');
  });

  test('card sale validates required fields', async ({ apiClient }) => {
    const noCard = await apiClient.createSaleTransaction({
      amount: '10.00',
      paymentMethod: 'card',
    });
    expect(noCard.status()).toBe(400);

    const badExpiry = await apiClient.createSaleTransaction({
      amount: '10.00',
      paymentMethod: 'card',
      cardNumber: '4111111111111111',
      expirationDate: '1229',
      cvv: '123',
      cardZipCode: '10001',
    });
    expect(badExpiry.status()).toBe(400);

    const badCvv = await apiClient.createSaleTransaction({
      amount: '10.00',
      paymentMethod: 'card',
      cardNumber: '4111111111111111',
      expirationDate: '12/29',
      cvv: '12',
      cardZipCode: '10001',
    });
    expect(badCvv.status()).toBe(400);
  });
});

test.describe('Post-Deploy: Sale Transactions — List', () => {
  test('list sales returns paginated results', async ({ apiClient }) => {
    const res = await apiClient.getSaleTransactions();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body).toHaveProperty('pagination');
  });

  test('list sales can filter by status', async ({ apiClient }) => {
    const res = await apiClient.getSaleTransactions({ status: 'completed' });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    for (const sale of body.data) {
      expect(sale.status).toBe('completed');
    }
  });

  test('invalid payment method rejected', async ({ apiClient }) => {
    const res = await apiClient.createSaleTransaction({
      amount: '10.00',
      paymentMethod: 'bitcoin',
    });
    expect(res.status()).toBe(400);
  });
});
