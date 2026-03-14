import { test, expect } from '@playwright/test';
import { HEALTH_ENDPOINTS } from '../../helpers/constants';

test.describe('Smoke: Health Checks', () => {
  for (const endpoint of HEALTH_ENDPOINTS) {
    test(`${endpoint.name} service is healthy`, async ({ request }) => {
      const response = await request.get(endpoint.path);

      expect(response.ok(), `${endpoint.name} health check failed: HTTP ${response.status()}`).toBeTruthy();

      const body = await response.json();
      expect(body).toHaveProperty('status', 'ok');
    });
  }

  test('all services respond within 5 seconds', async ({ request }) => {
    const results = await Promise.all(
      HEALTH_ENDPOINTS.map(async (endpoint) => {
        const start = Date.now();
        const response = await request.get(endpoint.path);
        const duration = Date.now() - start;
        return {
          name: endpoint.name,
          status: response.status(),
          duration,
          ok: response.ok(),
        };
      })
    );

    for (const result of results) {
      expect(result.ok, `${result.name} is not healthy (HTTP ${result.status})`).toBeTruthy();
      expect(result.duration, `${result.name} took ${result.duration}ms (>5s)`).toBeLessThan(5_000);
    }
  });
});
