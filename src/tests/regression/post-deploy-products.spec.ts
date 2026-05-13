import { test, expect } from '../../fixtures/auth.fixture';

test.describe('Post-Deploy: Products', () => {
  test('list products returns array', async ({ apiClient }) => {
    const res = await apiClient.getProducts();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const products = body.data ?? body;
    expect(Array.isArray(products)).toBe(true);
    expect(products.length).toBeGreaterThan(0);
  });

  test('products have expected fields', async ({ apiClient }) => {
    const res = await apiClient.getProducts();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const products: any[] = body.data ?? body;
    const p = products[0];
    expect(p).toHaveProperty('id');
    expect(p).toHaveProperty('name');
  });
});

test.describe('Post-Deploy: Departments', () => {
  test('list departments returns array', async ({ apiClient }) => {
    const res = await apiClient.getDepartments();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const departments = body.data ?? body;
    expect(Array.isArray(departments)).toBe(true);
  });
});

test.describe('Post-Deploy: Locations', () => {
  test('list locations returns array with at least one', async ({ apiClient }) => {
    const res = await apiClient.getLocations();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const locations = body.data ?? body;
    expect(Array.isArray(locations)).toBe(true);
    expect(locations.length).toBeGreaterThan(0);
  });

  test('locations have expected fields', async ({ apiClient }) => {
    const res = await apiClient.getLocations();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const locations: any[] = body.data ?? body;
    const loc = locations[0];
    expect(loc).toHaveProperty('id');
    expect(loc).toHaveProperty('name');
  });
});
