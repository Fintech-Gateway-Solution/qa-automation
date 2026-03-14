/**
 * Shared constants for QA automation tests.
 *
 * In CI (docker-compose.ci.yml): services are accessed via nginx on port 8080.
 * Against live dev: services are accessed via https://findev.qpaymentz.com.
 *
 * Nginx proxy paths (same in both environments):
 *   /auth-api/*       → Auth service (port 3001)
 *   /api/*            → Dashboard API (port 3000)
 *   /sp-api/*         → SendPayment (port 3002)
 *   /rp-api/*         → ReceivePayment (port 3003)
 *   /products-api/*   → Products (port 3004)
 *   /pos-api/*        → POS Backend (port 3005)
 */

export const API_PATHS = {
  AUTH: '/auth-api/v1',
  DASHBOARD: '/api/v1',
  SENDPAYMENT: '/sp-api/v1',
  RECEIVEPAYMENT: '/rp-api/v1',
  PRODUCTS: '/products-api/v1',
  POS: '/pos-api/v1',
} as const;

/** Health check endpoints (relative to baseURL) */
export const HEALTH_ENDPOINTS = [
  { name: 'Auth', path: `${API_PATHS.AUTH}/health` },
  { name: 'Dashboard API', path: `${API_PATHS.DASHBOARD}/health` },
  { name: 'SendPayment', path: `${API_PATHS.SENDPAYMENT}/health` },
  { name: 'ReceivePayment', path: `${API_PATHS.RECEIVEPAYMENT}/health` },
  { name: 'Products', path: `${API_PATHS.PRODUCTS}/health` },
];

/** SPA hash routes for page-load tests */
export const APP_ROUTES = [
  { name: 'Home', hash: '#/' },
  { name: 'Users', hash: '#/users' },
  { name: 'Settings', hash: '#/settings' },
  { name: 'Receive Payments', hash: '#/receive-payments' },
  { name: 'Reports', hash: '#/reports' },
];

/** Default test credentials (seeded by auth migration) */
export const TEST_CREDENTIALS = {
  email: process.env.TEST_USER_EMAIL || 'admin@fintech.dev',
  password: process.env.TEST_USER_PASSWORD || 'admin123',
};

/** Timeouts */
export const TIMEOUTS = {
  PAGE_LOAD: 15_000,
  API_RESPONSE: 10_000,
  ANIMATION: 1_000,
};
