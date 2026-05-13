import { test, expect } from '../../fixtures/auth.fixture';
import { qaCustomer, qaInvoice } from '../../helpers/test-data';

test.describe('Post-Deploy: ReceivePayment — Customers', () => {
  test('list customers returns array', async ({ apiClient }) => {
    const res = await apiClient.getCustomers();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const customers = body.data ?? body;
    expect(Array.isArray(customers)).toBe(true);
  });

  test('create customer with valid data', async ({ apiClient }) => {
    const data = qaCustomer();
    const res = await apiClient.createCustomer(data);
    expect(res.ok(), `create customer failed: ${res.status()} ${await res.text()}`).toBeTruthy();
    const body = await res.json();
    const customer = body.data ?? body;
    expect(customer.name).toBe(data.name);
    expect(customer.email).toBe(data.email);
  });

  test('create customer validates required fields', async ({ apiClient }) => {
    const res = await apiClient.createCustomer({ name: '' });
    expect(res.ok()).toBe(false);
  });
});

test.describe('Post-Deploy: ReceivePayment — Invoices', () => {
  let customerId: string;

  test('setup: create customer for invoices', async ({ apiClient }) => {
    const data = qaCustomer();
    const res = await apiClient.createCustomer(data);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    customerId = (body.data ?? body).id;
  });

  test('list invoices returns array', async ({ apiClient }) => {
    const res = await apiClient.getInvoices();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const invoices = body.data ?? body;
    expect(Array.isArray(invoices)).toBe(true);
  });

  test('create invoice with valid data', async ({ apiClient }) => {
    const data = qaInvoice(customerId);
    const res = await apiClient.createInvoice(data);
    expect(res.ok(), `create invoice failed: ${res.status()} ${await res.text()}`).toBeTruthy();
    const body = await res.json();
    const invoice = body.data ?? body;
    expect(invoice.customerId).toBe(customerId);
  });
});

test.describe('Post-Deploy: ReceivePayment — Payments', () => {
  test('list received payments returns array', async ({ apiClient }) => {
    const res = await apiClient.getReceivedPayments();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const payments = body.data ?? body;
    expect(Array.isArray(payments)).toBe(true);
  });
});
