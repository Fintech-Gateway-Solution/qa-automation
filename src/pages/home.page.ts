import { type Page, type Locator } from '@playwright/test';

export class HomePage {
  readonly page: Page;
  readonly welcomeHeading: Locator;
  readonly activeModulesCard: Locator;
  readonly roleCard: Locator;
  readonly accountStatusCard: Locator;
  readonly quickLinks: Locator;

  constructor(page: Page) {
    this.page = page;
    this.welcomeHeading = page.getByText(/Welcome back/i);
    this.activeModulesCard = page.getByText('Active Modules');
    this.roleCard = page.getByText('Your Role');
    this.accountStatusCard = page.getByText('Account Status');
    this.quickLinks = page.getByText('Quick Links');
  }

  async goto() {
    await this.page.goto('/#/');
    await this.page.waitForLoadState('networkidle');
  }

  async isLoaded(): Promise<boolean> {
    try {
      await this.welcomeHeading.waitFor({ timeout: 10_000 });
      return true;
    } catch {
      return false;
    }
  }
}
