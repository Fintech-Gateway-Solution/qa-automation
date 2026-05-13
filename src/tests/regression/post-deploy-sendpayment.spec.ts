import { test, expect } from '../../fixtures/auth.fixture';
import { qaPayee, qaFundingAccount } from '../../helpers/test-data';

async function getFirstLocation(apiClient: any) {
  const res = await apiClient.getLocations();
  expect(res.ok()).toBeTruthy();
  const { data: locations } = await res.json();
  expect(locations.length).toBeGreaterThan(0);
  return locations[0];
}

test.describe('Post-Deploy: SendPayment — Payees', () => {
  test('list payees returns array', async ({ apiClient }) => {
    const res = await apiClient.getPayees();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const payees = body.data ?? body;
    expect(Array.isArray(payees)).toBe(true);
  });

  test('create payee with valid data', async ({ apiClient }) => {
    const data = qaPayee();
    const res = await apiClient.createPayee(data);
    expect(res.ok(), `create payee failed: ${res.status()} ${await res.text()}`).toBeTruthy();
    const body = await res.json();
    const payee = body.data ?? body;
    expect(payee.name).toBe(data.name);
    expect(payee.email).toBe(data.email);
  });

  test('create payee validates required fields', async ({ apiClient }) => {
    const res = await apiClient.createPayee({ name: '' });
    expect(res.ok()).toBe(false);
  });
});

test.describe('Post-Deploy: SendPayment — Funding Accounts', () => {
  test('list funding accounts returns array', async ({ apiClient }) => {
    const res = await apiClient.getFundingAccounts();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const accounts = body.data ?? body;
    expect(Array.isArray(accounts)).toBe(true);
  });

  test('create funding account with valid data', async ({ apiClient }) => {
    const location = await getFirstLocation(apiClient);
    const data = qaFundingAccount(location.id);
    const res = await apiClient.createFundingAccount(data);
    expect(res.ok(), `create funding account failed: ${res.status()} ${await res.text()}`).toBeTruthy();
    const body = await res.json();
    const account = body.data ?? body;
    expect(account.nickname).toBe(data.nickname);
  });
});

test.describe('Post-Deploy: SendPayment — Payments', () => {
  test('list send payments returns array', async ({ apiClient }) => {
    const res = await apiClient.getSendPayments();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const payments = body.data ?? body;
    expect(Array.isArray(payments)).toBe(true);
  });
});
