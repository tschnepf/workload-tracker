import { test, expect } from '@playwright/test';

test('login via UI with default admin credentials', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username or Email').fill(process.env.PW_USERNAME || 'admin');
  await page.getByLabel('Password').fill(process.env.PW_PASSWORD || 'admin123');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/(dashboard|/)', { timeout: 10_000 });
  await expect(page.locator('body')).toContainText(/Dashboard|Assignment Grid|People|Projects/);
});

