import { test, expect } from '@playwright/test';
import { uiLogin } from './helpers/auth';

test('reload preserves session via refresh token', async ({ page }) => {
  await uiLogin(page);
  await page.reload();
  // After reload, app should refresh access token and still show authenticated content
  await expect(page.locator('body')).toContainText(/Dashboard|Assignment Grid|People|Projects/);
});

