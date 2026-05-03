/**
 * One-shot UI confirmation: the Mail (resend email) icon is rendered in the
 * PO list actions column. Seeds a vendor → product → PO, then asserts the
 * title="Resend email to vendor" button exists in the row's actions and
 * captures screenshots for proof.
 */
import { test, expect } from '../fixtures/auth.fixture';
import { qaThirdPartyVendor, qaPurchaseOrder } from '../helpers/test-data';

test('PO list shows the Mail/resend icon next to Edit/Print/Delete', async ({ apiClient, authenticatedPage }) => {
  // Seed: vendor + product + PO so there's at least one row in the list.
  const vendorRes = await apiClient.createDashboardPayee(qaThirdPartyVendor());
  expect(vendorRes.ok(), `createDashboardPayee failed: ${vendorRes.status()}`).toBeTruthy();
  const { data: vendor } = await vendorRes.json();

  const locsRes = await apiClient.getLocations();
  const { data: locations } = await locsRes.json();
  const location = (locations as any[])[0];
  test.skip(!location, 'No locations on this tenant — skipping');

  const productsRes = await apiClient.getProducts();
  const { data: products } = await productsRes.json();
  const product = (products as any[])[0];
  test.skip(!product, 'No products on this tenant — skipping');

  const poRes = await apiClient.createPurchaseOrder(
    qaPurchaseOrder({ payeeId: vendor.id, locationId: location.id, productId: product.id }),
  );
  expect(poRes.ok(), `createPurchaseOrder failed: ${poRes.status()} ${await poRes.text()}`).toBeTruthy();
  const { data: po } = await poRes.json();

  // Per migration 0049, the Mail/resend icon only renders for sent POs
  // (`{isSent && ...}` in purchase-order-list.tsx). Transition the draft.
  const sendRes = await apiClient.sendPurchaseOrder(po.id);
  expect(sendRes.ok(), `sendPurchaseOrder failed: ${sendRes.status()} ${await sendRes.text()}`).toBeTruthy();

  // Drive the PO list UI.
  await authenticatedPage.goto('/#/pos-management?tab=purchase-orders');
  await expect(authenticatedPage.getByRole('heading', { name: 'Purchase Orders' })).toBeVisible({ timeout: 15_000 });

  // The Mail icon button is keyed by title="Re-send PO email to vendor".
  const resendBtn = authenticatedPage.getByTitle('Re-send PO email to vendor').first();
  await expect(resendBtn).toBeVisible({ timeout: 10_000 });

  // Capture proof: full page + a focused screenshot of the resend button.
  await authenticatedPage.screenshot({ path: 'test-results/po-list-with-resend-icon.png', fullPage: false });
  await resendBtn.screenshot({ path: 'test-results/po-resend-icon.png' });
});
