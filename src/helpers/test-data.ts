/**
 * Test data factories.
 * All test entities use QA- prefix to distinguish from manual test data.
 */

export function uniqueId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function qaPayee() {
  const id = uniqueId();
  return {
    name: `QA-Payee-${id}`,
    email: `qa-payee-${id}@test.local`,
    bankName: 'QA Test Bank',
    accountType: 'checking',
    routingNumber: '021000021',
    accountNumber: `12345${id.slice(0, 5)}`,
    accountHolderName: `QA Payee ${id}`,
    street: '123 QA Street',
    city: 'Test City',
    state: 'CA',
    zipCode: '90210',
  };
}

export function qaFundingAccount() {
  const id = uniqueId();
  return {
    nickname: `QA-Funding-${id}`,
    bankName: 'QA Funding Bank',
    accountType: 'checking',
    routingNumber: '021000021',
    accountNumber: `98765${id.slice(0, 5)}`,
    accountHolderName: `QA Funding ${id}`,
  };
}

export function qaCustomer() {
  const id = uniqueId();
  return {
    name: `QA-Customer-${id}`,
    email: `qa-customer-${id}@test.local`,
    phone: '5551234567',
    company: `QA Company ${id}`,
  };
}

export function qaProduct() {
  const id = uniqueId();
  return {
    name: `QA-Product-${id}`,
    description: `Test product created by QA automation`,
    cashPrice: '9.99',
    cost: '5.00',
    sku: `QA-SKU-${id}`,
  };
}

export function qaDepartment() {
  const id = uniqueId();
  return {
    name: `QA-Dept-${id}`,
  };
}

export function qaInvoice(customerId: string) {
  return {
    customerId,
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    lineItems: [
      {
        description: 'QA Test Service',
        quantity: 1,
        unitPrice: '100.00',
      },
    ],
  };
}
