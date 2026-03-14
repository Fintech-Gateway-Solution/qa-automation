import { type Page, type Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly errorMessage: Locator;
  readonly forgotPasswordLink: Locator;
  readonly signUpLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('input[type="email"]');
    this.passwordInput = page.locator('input[type="password"]');
    this.signInButton = page.locator('button[type="submit"]');
    this.errorMessage = page.locator('[role="alert"], .text-destructive, .text-red-500');
    this.forgotPasswordLink = page.getByText('Forgot Password');
    this.signUpLink = page.getByText('Sign Up');
  }

  async goto() {
    await this.page.goto('/#/login');
    await this.page.waitForLoadState('networkidle');
  }

  async login(email: string, password: string) {
    await this.emailInput.click();
    await this.emailInput.fill(email);
    await this.passwordInput.click();
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }

  async waitForDashboard() {
    // After login, SPA redirects to #/ (home)
    await this.page.waitForURL(/#\/$/, { timeout: 15_000 });
  }
}
