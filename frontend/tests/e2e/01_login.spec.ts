import { test, expect } from '@playwright/test';
import { uiLogin } from './helpers/auth';

test('login via UI with default admin credentials', async ({ page }) => {
  await uiLogin(page);
  await expect(page.locator('body')).toContainText(/Dashboard|Assignment Grid|People|Projects/);
});
