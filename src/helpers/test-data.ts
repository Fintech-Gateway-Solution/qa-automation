/**
 * Test data factories.
 * All test entities use QA- prefix to distinguish from manual test data.
 */

export function uniqueId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function qaPayee() {
  const id = uniqueId();
  const digits = String(Date.now()).slice(-8);
  return {
    name: `QA-Payee-${id}`,
    email: `qa-payee-${id}@test.local`,
    bankName: 'QA Test Bank',
    accountType: 'checking',
    routingNumber: '021000021',
    accountNumber: `100000${digits}`,
    accountHolderName: `QA Payee ${id}`,
  };
}

export function qaFundingAccount(locationId: string) {
  const id = uniqueId();
  const digits = String(Date.now() + 1).slice(-8);
  return {
    nickname: `QA-Funding-${id}`,
    bankName: 'QA Funding Bank',
    accountType: 'checking',
    routingNumber: '021000021',
    accountNumber: `200000${digits}`,
    accountHolderName: `QA Funding ${id}`,
    locationId,
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

export function qaUser(locationId?: string) {
  const id = uniqueId();
  return {
    name: `QA-User-${id}`,
    email: `qa-user-${id}@test.local`,
    password: 'QaTest123!',
    role: 'employee',
    ...(locationId ? { locationId } : {}),
  };
}

export function qaInvoice(customerId: string) {
  return {
    customerId,
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    lines: [
      {
        description: 'QA Test Service',
        quantity: 1,
        unitPrice: 100,
      },
    ],
  };
}

export function qaThirdPartyVendor() {
  const id = uniqueId();
  return {
    name: `QA-Vendor-${id}`,
    email: `qa-vendor-${id}@test.local`,
    contactName: `QA Vendor ${id}`,
    phone: '5551234567',
    vendorType: 'third_party',
  };
}

export function qaWarehouseVendor(linkedWarehouseId: string, linkedWarehouseLocationId: string | null = null) {
  const id = uniqueId();
  return {
    name: `QA-WarehouseVendor-${id}`,
    email: `qa-whvendor-${id}@test.local`,
    contactName: `QA Warehouse Vendor ${id}`,
    phone: '5551234567',
    vendorType: 'warehouse',
    linkedWarehouseId,
    linkedWarehouseLocationId,
  };
}

export function qaPurchaseOrder(args: {
  payeeId: string;
  locationId: string;
  productId: string;
  quantity?: number;
  costPerUnit?: number;
}) {
  return {
    payeeId: args.payeeId,
    locationId: args.locationId,
    createdByName: 'QA Automation',
    items: [
      {
        productId: args.productId,
        unitOfMeasure: 'each',
        quantity: args.quantity ?? 1,
        costPerUnit: args.costPerUnit ?? 5,
      },
    ],
  };
}

export function qaAchSaleTransaction() {
  const id = uniqueId();
  return {
    amount: '25.00',
    paymentMethod: 'ach',
    accountType: 'checking',
    accountCategory: 'personal',
    routingNumber: '021000021',
    accountNumber: `300000${String(Date.now()).slice(-8)}`,
    firstName: `QA`,
    lastName: `Sale-${id}`,
    phone: '5551234567',
    email: `qa-sale-${id}@test.local`,
    notes: `QA sale transaction ${id}`,
  };
}

export function qaCardSaleTransaction() {
  const id = uniqueId();
  return {
    amount: '15.50',
    paymentMethod: 'card',
    cardNumber: '4111111111111111',
    expirationDate: '12/29',
    cvv: '123',
    cardZipCode: '10001',
    cardHolderName: `QA Card ${id}`,
    notes: `QA card sale ${id}`,
  };
}
