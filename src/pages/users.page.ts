import { type Page, type Locator } from '@playwright/test';

export class UsersPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly addUserButton: Locator;
  readonly searchInput: Locator;
  readonly usersTable: Locator;
  readonly activeTab: Locator;
  readonly inactiveTab: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Users' });
    this.addUserButton = page.getByRole('button', { name: /Add User/i });
    this.searchInput = page.getByPlaceholder(/Search users/i);
    this.usersTable = page.locator('table');
    this.activeTab = page.getByText(/Active/i).first();
    this.inactiveTab = page.getByText(/Inactive/i).first();
  }

  async goto() {
    await this.page.goto('/#/users');
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
