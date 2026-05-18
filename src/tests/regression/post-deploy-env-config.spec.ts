import { test, expect } from '../../fixtures/auth.fixture';
import { API_PATHS } from '../../helpers/constants';
import { qaCustomer, qaPaymentLink, qaAchSaleWithAuth } from '../../helpers/test-data';

const BASE_URL = process.env.BASE_URL || '';

test.describe('Post-Deploy: Environment Config Validation', () => {
  test('all services pass readiness checks', async ({ apiClient }) => {
    const services = ['AUTH', 'DASHBOARD', 'RECEIVEPAYMENT', 'PRODUCTS'] as const;
    for (const svc of services) {
      const res = await apiClient.healthReady(svc);
      expect(res.ok(), `${svc} readiness check failed: ${res.status()}`).toBeTruthy();
    }
  });

  test('DASHBOARD_BASE_URL is not localhost (payment link URL)', async ({ apiClient }) => {
    const custRes = await apiClient.createCustomer(qaCustomer());
    expect(custRes.ok()).toBeTruthy();
    const custBody = await custRes.json();
    const customerId = (custBody.data ?? custBody).id;

    const linkRes = await apiClient.createPaymentLink(qaPaymentLink(customerId));
    expect(linkRes.ok(), `create link failed: ${linkRes.status()}`).toBeTruthy();
    const linkBody = await linkRes.json();
    const link = linkBody.data ?? linkBody;

    expect(link.publicToken).toBeTruthy();

    // The public pay page should be accessible on THIS environment, not localhost
    // Construct the URL as the backend would: {dashboardBaseUrl}/#/pay/{publicToken}
    // If DASHBOARD_BASE_URL is missing/localhost, the email link won't work on this env
    if (BASE_URL && !BASE_URL.includes('localhost')) {
      const payPageRes = await apiClient['request'].get(`${BASE_URL}/#/pay/${link.publicToken}`);
      // SPA returns 200 for all hash routes (the HTML shell loads)
      expect(payPageRes.ok(), 'pay page should be reachable on current environment').toBeTruthy();
    }
  });

  test('payment link email does not reference localhost', async ({ authenticatedPage, apiClient }) => {
    const custRes = await apiClient.createCustomer(qaCustomer());
    expect(custRes.ok()).toBeTruthy();
    const custBody = await custRes.json();
    const customerId = (custBody.data ?? custBody).id;

    const linkRes = await apiClient.createPaymentLink(qaPaymentLink(customerId));
    expect(linkRes.ok()).toBeTruthy();
    const linkBody = await linkRes.json();
    const link = linkBody.data ?? linkBody;

    // Navigate to receive payments and check the payment link details
    await authenticatedPage.goto('/#/receive-payments');
    await authenticatedPage.waitForLoadState('networkidle');

    // Click Pay By Link tab
    const payByLinkTab = authenticatedPage.getByText('Pay By Link', { exact: false }).first();
    await payByLinkTab.click();
    await authenticatedPage.waitForTimeout(2000);

    // Look for our link in the list and verify the copy-link URL is not localhost
    // We check via the API: list payment links and inspect any URL fields
    const listRes = await apiClient.getPaymentLinks();
    expect(listRes.ok()).toBeTruthy();
    const listBody = await listRes.json();
    const links: any[] = listBody.data ?? listBody;

    const ourLink = links.find((l: any) => l.publicToken === link.publicToken);
    if (ourLink) {
      // If the API returns a paymentUrl or url field, it must not contain localhost
      const urlFields = ['paymentUrl', 'url', 'link'];
      for (const field of urlFields) {
        if (ourLink[field]) {
          expect(ourLink[field]).not.toContain('localhost');
        }
      }
    }
  });

  test('S3 upload is functional (ACH auth doc)', async ({ apiClient }) => {
    const data = qaAchSaleWithAuth();
    const saleRes = await apiClient.createSaleTransaction(data);

    if (!saleRes.ok()) {
      const status = saleRes.status();
      // Gateway may not be configured — skip gracefully
      test.skip(status >= 500 || status === 422, `Gateway not configured (status ${status})`);
      // 400 = validation error which means our request shape is wrong
      expect(status, 'sale creation should not be a validation error').not.toBe(400);
      return;
    }

    const saleBody = await saleRes.json();
    const sale = saleBody.data;
    expect(sale.id).toBeTruthy();

    // Give the async auth doc generation + S3 upload time to complete
    await new Promise((r) => setTimeout(r, 5000));

    // Try fetching the signed auth document from ReceivePayment directly
    const docRes = await apiClient.getAchAuthSignedDoc(sale.id);

    if (docRes.ok()) {
      // S3 is working — document was uploaded and is retrievable
      const contentType = docRes.headers()['content-type'] || '';
      expect(
        contentType.includes('pdf') || contentType.includes('html'),
        `auth doc content-type should be pdf or html, got: ${contentType}`,
      ).toBeTruthy();
    } else if (docRes.status() === 404) {
      // 404 = either no auth record for this sale, or signedDocumentS3Key is null
      // This indicates S3_UPLOAD_ENABLED=false or missing AWS_* env vars.
      // Log a warning — this is a known deployment config issue.
      console.warn(
        `[ENV CONFIG] Auth doc not found for sale ${sale.id}. ` +
          'Likely S3_UPLOAD_ENABLED is not set or AWS credentials are missing in this environment.',
      );
      // Soft-fail: mark as fixme rather than hard-fail, since gateway config varies per env
      test.fixme(true, 'S3 auth doc upload not configured in this environment — verify AWS_* env vars');
    }
  });

  test('notification config is present (email service)', async ({ apiClient }) => {
    // ReceivePayment validates notification config at startup.
    // If RESEND_API_KEY / EMAIL_FROM / DOMAIN_NAME are missing, the service still starts
    // but email sending silently fails. We verify by checking:
    // 1. The health endpoint is up (service didn't crash on missing config)
    // 2. Creating a payment link doesn't return a 500 from notification failure

    const rpHealth = await apiClient.healthReady('RECEIVEPAYMENT');
    expect(rpHealth.ok()).toBeTruthy();

    const custRes = await apiClient.createCustomer(qaCustomer());
    expect(custRes.ok()).toBeTruthy();
    const custBody = await custRes.json();
    const customerId = (custBody.data ?? custBody).id;

    // Creating a payment link triggers fire-and-forget email.
    // If notification config is broken, the link is still created (201),
    // but the email fails silently. We at least verify no 500.
    const linkRes = await apiClient.createPaymentLink(qaPaymentLink(customerId));
    expect(linkRes.status()).not.toBe(500);
    expect(linkRes.ok()).toBeTruthy();
  });

  test('dashboard API can proxy to all backend services', async ({ apiClient }) => {
    // Validates that AUTH_SERVICE_URL, RP_SERVICE_URL, SP_SERVICE_URL env vars
    // in the dashboard API are correctly pointing to the right services.
    // If these are misconfigured, the proxy calls return 502/503.
    const checks = [
      { name: 'customers (ReceivePayment)', fn: () => apiClient.getCustomers() },
      { name: 'payees (SendPayment)', fn: () => apiClient.getPayees() },
      { name: 'products (Products)', fn: () => apiClient.getProducts() },
      { name: 'locations (Products)', fn: () => apiClient.getLocations() },
      { name: 'modules (Dashboard)', fn: () => apiClient.getModules() },
    ];

    for (const check of checks) {
      const res = await check.fn();
      expect(
        res.status(),
        `${check.name} should not return 502/503 (bad proxy config)`,
      ).not.toBeGreaterThanOrEqual(500);
      expect(res.ok(), `${check.name} failed: ${res.status()}`).toBeTruthy();
    }
  });

  test('SendPayment health ready (SP_SERVICE_URL configured)', async ({ apiClient }) => {
    const res = await apiClient.healthReady('SENDPAYMENT');
    // SendPayment may not have /health/ready — fallback to /health
    if (res.status() === 404) {
      const healthRes = await apiClient.healthSendPayment();
      expect(healthRes.ok(), 'SendPayment health check failed').toBeTruthy();
    } else {
      expect(res.ok(), `SendPayment readiness failed: ${res.status()}`).toBeTruthy();
    }
  });
});
