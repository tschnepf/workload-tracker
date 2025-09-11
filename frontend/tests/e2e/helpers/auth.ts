import { Page, expect } from '@playwright/test';

export async function uiLogin(page: Page, opts?: { username?: string; password?: string }) {
  const username = opts?.username || process.env.PW_USERNAME || 'admin';
  const password = opts?.password || process.env.PW_PASSWORD || 'admin123';

  await page.goto('/login');
  await page.getByLabel('Username or Email').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  // Expect redirect to dashboard (or to root which redirects)
  await page.waitForURL('**/(dashboard|/)', { timeout: 10_000 });
  // Sanity: page shows some authenticated content
  await expect(page.locator('body')).toContainText(/Dashboard|Assignment Grid|People|Projects/);
}

