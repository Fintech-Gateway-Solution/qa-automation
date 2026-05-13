import { test, expect } from '../../fixtures/auth.fixture';
import { qaUser } from '../../helpers/test-data';

test.describe('Post-Deploy: Users', () => {
  test('list users returns array', async ({ apiClient }) => {
    const res = await apiClient.getUsers();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const users = body.data ?? body;
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThan(0);
  });

  test('create user with valid data', async ({ apiClient }) => {
    const location = await getFirstLocation(apiClient);
    const userData = qaUser(location.id);

    const res = await apiClient.createUser(userData);
    expect(res.ok(), `create user failed: ${res.status()} ${await res.text()}`).toBeTruthy();
    const body = await res.json();
    const user = body.data ?? body;
    expect(user.email).toBe(userData.email);
    expect(user.name).toBe(userData.name);
    expect(user.role).toBe('employee');
  });

  test('create user rejects duplicate email', async ({ apiClient }) => {
    const location = await getFirstLocation(apiClient);
    const userData = qaUser(location.id);

    const first = await apiClient.createUser(userData);
    expect(first.ok()).toBeTruthy();

    const duplicate = await apiClient.createUser(userData);
    expect(duplicate.ok()).toBe(false);
    expect([400, 409, 500]).toContain(duplicate.status());
  });

  test('list users can filter by search', async ({ apiClient }) => {
    const res = await apiClient.getUsers({ search: 'QA-User' });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const users: any[] = body.data ?? body;
    for (const u of users) {
      expect(u.name.toLowerCase()).toContain('qa-user');
    }
  });
});

async function getFirstLocation(apiClient: any) {
  const res = await apiClient.getLocations();
  expect(res.ok()).toBeTruthy();
  const { data: locations } = await res.json();
  expect(locations.length).toBeGreaterThan(0);
  return locations[0];
}
