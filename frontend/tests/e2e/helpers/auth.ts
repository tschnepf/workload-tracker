import { Page, expect } from '@playwright/test';

export async function uiLogin(page: Page, opts?: { username?: string; password?: string }) {
  const username = opts?.username || process.env.PW_USERNAME || 'admin';
  const password = opts?.password || process.env.PW_PASSWORD || 'admin123';

  await page.goto('/login');
  // Labels are not programmatically associated; target inputs directly
  await page.locator('input[type="text"]').first().fill(username);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  // Sanity: wait for authenticated content to appear
  await expect(page.locator('body')).toContainText(/Dashboard|Assignment Grid|People|Projects/, { timeout: 15000 });
}
