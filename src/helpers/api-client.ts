import { APIRequestContext } from '@playwright/test';
import { API_PATHS } from './constants';

/**
 * API client helper for making authenticated requests to backend services.
 * Works through the nginx proxy paths so it's consistent between CI and live environments.
 */
export class ApiClient {
  constructor(private request: APIRequestContext) {}

  // ─── Auth Service ───────────────────────────────────────

  async login(email: string, password: string) {
    return this.request.post(`${API_PATHS.AUTH}/auth/login`, {
      data: { email, password },
    });
  }

  async signup(data: { name: string; email: string; password: string }) {
    return this.request.post(`${API_PATHS.AUTH}/auth/signup`, {
      data,
    });
  }

  async logout() {
    return this.request.post(`${API_PATHS.AUTH}/auth/logout`);
  }

  async getMe() {
    return this.request.get(`${API_PATHS.AUTH}/auth/me`);
  }

  async healthAuth() {
    return this.request.get(`${API_PATHS.AUTH}/health`);
  }

  // ─── Dashboard API ──────────────────────────────────────

  async getModules() {
    return this.request.get(`${API_PATHS.DASHBOARD}/modules`);
  }

  async toggleModule(moduleName: string, isActive: boolean) {
    return this.request.put(`${API_PATHS.DASHBOARD}/modules/${moduleName}/toggle`, {
      data: { isActive },
    });
  }

  async getUsers() {
    return this.request.get(`${API_PATHS.DASHBOARD}/users`);
  }

  async healthDashboard() {
    return this.request.get(`${API_PATHS.DASHBOARD}/health`);
  }

  // ─── SendPayment ────────────────────────────────────────

  async getPayees() {
    return this.request.get(`${API_PATHS.SENDPAYMENT}/payees`);
  }

  async getFundingAccounts() {
    return this.request.get(`${API_PATHS.SENDPAYMENT}/funding-accounts`);
  }

  async healthSendPayment() {
    return this.request.get(`${API_PATHS.SENDPAYMENT}/health`);
  }

  // ─── ReceivePayment ─────────────────────────────────────

  async getInvoices() {
    return this.request.get(`${API_PATHS.RECEIVEPAYMENT}/invoices`);
  }

  async getCustomers() {
    return this.request.get(`${API_PATHS.RECEIVEPAYMENT}/customers`);
  }

  async healthReceivePayment() {
    return this.request.get(`${API_PATHS.RECEIVEPAYMENT}/health`);
  }

  // ─── Products ───────────────────────────────────────────

  async getProducts() {
    return this.request.get(`${API_PATHS.PRODUCTS}/products`);
  }

  async getDepartments() {
    return this.request.get(`${API_PATHS.PRODUCTS}/departments`);
  }

  async healthProducts() {
    return this.request.get(`${API_PATHS.PRODUCTS}/health`);
  }
}
