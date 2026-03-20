/**
 * Integration tests: location-scoped filtering
 *
 * Verifies that the ?locationId query param correctly scopes results
 * across SendPayment, ReceivePayment, and Users endpoints.
 *
 * Run against dev:   BASE_URL=https://findev.qpaymentz.com npx playwright test location-scoping
 * Run against local: npx playwright test location-scoping
 */

import { test, expect } from '../fixtures/auth.fixture';
import { qaPayee, qaFundingAccount, qaCustomer, qaInvoice, qaUser } from '../helpers/test-data';

const FAKE_LOCATION_ID = '00000000-dead-beef-0000-000000000001';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract the first location from the tenant, skipping if none exist. */
async function getFirstLocation(apiClient: { getLocations(): Promise<any> }, test: any) {
  const res = await apiClient.getLocations();
  expect(res.ok(), `GET /locations failed: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  const locations: any[] = body.data ?? body;
  if (locations.length === 0) test.skip(true, 'No locations configured in dev — skipping location-scoped tests');
  return locations[0];
}

// ─── SendPayment ──────────────────────────────────────────────────────────────

test.describe('Location Scoping: SendPayment', () => {
  test('GET /payments returns locationId field on each record', async ({ apiClient }) => {
    const res = await apiClient.getSendPayments();
    expect(res.ok()).toBeTruthy();
    const { data } = await res.json();
    // If there are existing payments, each must have the locationId key
    for (const payment of data) {
      expect(payment).toHaveProperty('locationId');
    }
  });

  test('GET /payments?locationId=<nonexistent> returns empty list', async ({ apiClient }) => {
    const res = await apiClient.getSendPayments({ locationId: FAKE_LOCATION_ID });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  test('payment created with locationId is returned by that locationId filter', async ({ apiClient }, testInfo) => {
    const location = await getFirstLocation(apiClient, testInfo);

    // Create a payee
    const payeeRes = await apiClient.createPayee(qaPayee());
    const payeeBody = await payeeRes.json();
    expect(payeeRes.ok(), `createPayee failed: ${payeeRes.status()} ${JSON.stringify(payeeBody)}`).toBeTruthy();
    const { data: payee } = payeeBody;

    // Create a funding account
    const faRes = await apiClient.createFundingAccount(qaFundingAccount());
    expect(faRes.ok(), `createFundingAccount failed: ${faRes.status()} ${await faRes.text()}`).toBeTruthy();
    const { data: fundingAccount } = await faRes.json();

    // Create a payment scoped to the location
    const paymentRes = await apiClient.createSendPayment({
      payeeId: payee.id,
      fundingAccountId: fundingAccount.id,
      amount: 100,
      currency: 'USD',
      locationId: location.id,
    });
    expect(paymentRes.ok(), `createSendPayment failed: ${paymentRes.status()} ${await paymentRes.text()}`).toBeTruthy();
    const { data: payment } = await paymentRes.json();
    expect(payment.locationId).toBe(location.id);

    // Filter by locationId — should include the payment we just created
    const filteredRes = await apiClient.getSendPayments({ locationId: location.id });
    expect(filteredRes.ok()).toBeTruthy();
    const { data: filtered } = await filteredRes.json();
    const found = filtered.find((p: any) => p.id === payment.id);
    expect(found, `Payment ${payment.id} not found when filtering by locationId ${location.id}`).toBeTruthy();
    expect(found.locationId).toBe(location.id);

    // Filter by a different locationId — should NOT include this payment
    const excludedRes = await apiClient.getSendPayments({ locationId: FAKE_LOCATION_ID });
    expect(excludedRes.ok()).toBeTruthy();
    const { data: excluded } = await excludedRes.json();
    const shouldNotFind = excluded.find((p: any) => p.id === payment.id);
    expect(shouldNotFind, 'Payment appeared under wrong locationId').toBeUndefined();
  });

  test('payment created without locationId is not returned by locationId filter', async ({ apiClient }, testInfo) => {
    const location = await getFirstLocation(apiClient, testInfo);

    // Create a payee + funding account
    const payeeRes = await apiClient.createPayee(qaPayee());
    const payeeBody = await payeeRes.json();
    expect(payeeRes.ok(), `createPayee failed: ${JSON.stringify(payeeBody)}`).toBeTruthy();
    const { data: payee } = payeeBody;

    const faRes = await apiClient.createFundingAccount(qaFundingAccount());
    const faBody = await faRes.json();
    expect(faRes.ok(), `createFundingAccount failed: ${JSON.stringify(faBody)}`).toBeTruthy();
    const { data: fundingAccount } = faBody;

    // Create payment with NO locationId
    const paymentRes = await apiClient.createSendPayment({
      payeeId: payee.id,
      fundingAccountId: fundingAccount.id,
      amount: 50,
      currency: 'USD',
    });
    const paymentBody = await paymentRes.json();
    expect(paymentRes.ok(), `createSendPayment failed: ${JSON.stringify(paymentBody)}`).toBeTruthy();
    const { data: payment } = paymentBody;
    expect(payment.locationId).toBeNull();

    // Filter by a specific location — payment without locationId should not appear
    const filteredRes = await apiClient.getSendPayments({ locationId: location.id });
    expect(filteredRes.ok()).toBeTruthy();
    const { data: filtered } = await filteredRes.json();
    const shouldNotFind = filtered.find((p: any) => p.id === payment.id);
    expect(shouldNotFind, 'Unscoped payment appeared in location-filtered results').toBeUndefined();
  });
});

// ─── ReceivePayment ───────────────────────────────────────────────────────────

test.describe('Location Scoping: ReceivePayment — Invoices', () => {
  test('GET /invoices returns locationId field on each record', async ({ apiClient }) => {
    const res = await apiClient.getInvoices();
    expect(res.ok()).toBeTruthy();
    const { data } = await res.json();
    for (const invoice of data) {
      expect(invoice).toHaveProperty('locationId');
    }
  });

  test('GET /invoices?locationId=<nonexistent> returns empty list', async ({ apiClient }) => {
    const res = await apiClient.getInvoices({ locationId: FAKE_LOCATION_ID });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  test('invoice created with locationId is returned by that locationId filter', async ({ apiClient }, testInfo) => {
    const location = await getFirstLocation(apiClient, testInfo);

    // Create a customer
    const customerRes = await apiClient.createCustomer(qaCustomer());
    expect(customerRes.ok(), `createCustomer failed: ${customerRes.status()} ${await customerRes.text()}`).toBeTruthy();
    const { data: customer } = await customerRes.json();

    // Create an invoice scoped to the location
    const invoiceRes = await apiClient.createInvoice({
      ...qaInvoice(customer.id),
      locationId: location.id,
    });
    expect(invoiceRes.ok(), `createInvoice failed: ${invoiceRes.status()} ${await invoiceRes.text()}`).toBeTruthy();
    const { data: invoice } = await invoiceRes.json();
    expect(invoice.locationId).toBe(location.id);

    // Filter by locationId — must find it
    const filteredRes = await apiClient.getInvoices({ locationId: location.id });
    expect(filteredRes.ok()).toBeTruthy();
    const { data: filtered } = await filteredRes.json();
    const found = filtered.find((i: any) => i.id === invoice.id);
    expect(found, `Invoice ${invoice.id} not found when filtering by locationId ${location.id}`).toBeTruthy();
    expect(found.locationId).toBe(location.id);

    // Filter by wrong locationId — must not find it
    const excludedRes = await apiClient.getInvoices({ locationId: FAKE_LOCATION_ID });
    expect(excludedRes.ok()).toBeTruthy();
    const { data: excluded } = await excludedRes.json();
    expect(excluded.find((i: any) => i.id === invoice.id)).toBeUndefined();
  });
});

test.describe('Location Scoping: ReceivePayment — Received Payments', () => {
  test('GET /payments returns locationId field on each record', async ({ apiClient }) => {
    const res = await apiClient.getReceivedPayments();
    expect(res.ok()).toBeTruthy();
    const { data } = await res.json();
    for (const payment of data) {
      expect(payment).toHaveProperty('locationId');
    }
  });

  test('GET /payments?locationId=<nonexistent> returns empty list', async ({ apiClient }) => {
    const res = await apiClient.getReceivedPayments({ locationId: FAKE_LOCATION_ID });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toHaveLength(0);
    expect(body.total).toBe(0);
  });
});

// ─── Users ────────────────────────────────────────────────────────────────────

test.describe('Location Scoping: Users', () => {
  test('GET /users returns locationId field on each record', async ({ apiClient }) => {
    const res = await apiClient.getUsers();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const users: any[] = body.data ?? body;
    for (const user of users) {
      expect(user).toHaveProperty('locationId');
    }
  });

  test('GET /users?locationId=<nonexistent> returns only owners (who always bypass location filter)', async ({ apiClient }) => {
    const res = await apiClient.getUsers({ locationId: FAKE_LOCATION_ID });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const users: any[] = body.data ?? body;
    // Non-owner users must not appear; owners always pass the filter
    const nonOwners = users.filter((u: any) => u.role !== 'owner');
    expect(nonOwners).toHaveLength(0);
  });

  test('user created with locationId is returned by that locationId filter', async ({ apiClient }, testInfo) => {
    const location = await getFirstLocation(apiClient, testInfo);

    // Create a user scoped to the location
    const userRes = await apiClient.createUser(qaUser(location.id));
    expect(userRes.ok(), `createUser failed: ${userRes.status()} ${await userRes.text()}`).toBeTruthy();
    const body = await userRes.json();
    const user = body.data ?? body;
    expect(user.locationId).toBe(location.id);

    // Filter by locationId — must find the user
    const filteredRes = await apiClient.getUsers({ locationId: location.id });
    expect(filteredRes.ok()).toBeTruthy();
    const filteredBody = await filteredRes.json();
    const filtered: any[] = filteredBody.data ?? filteredBody;
    const found = filtered.find((u: any) => u.id === user.id);
    expect(found, `User ${user.id} not found when filtering by locationId ${location.id}`).toBeTruthy();
    expect(found.locationId).toBe(location.id);
  });
});
