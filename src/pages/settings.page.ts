import { type Page, type Locator } from '@playwright/test';

export class SettingsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly modulesSection: Locator;
  readonly receivePaymentsCard: Locator;
  readonly sendPaymentsCard: Locator;
  readonly posManagementCard: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Settings' });
    this.modulesSection = page.getByText('Modules');
    this.receivePaymentsCard = page.getByText('Receive Payments').first();
    this.sendPaymentsCard = page.getByText('Send Payments').first();
    this.posManagementCard = page.getByText('POS Management').first();
  }

  async goto() {
    await this.page.goto('/#/settings');
    await this.page.waitForLoadState('networkidle');
  }

  async isLoaded(): Promise<boolean> {
    try {
      await this.heading.waitFor({ timeout: 10_000 });
      return true;
    } catch {
      return false;
    }
  }
}
