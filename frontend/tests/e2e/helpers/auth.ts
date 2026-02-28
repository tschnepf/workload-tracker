import { Page, expect } from '@playwright/test';

export async function uiLogin(page: Page, opts?: { username?: string; password?: string }) {
  const username = opts?.username || process.env.PW_USERNAME || 'admin';
  const password = opts?.password || process.env.PW_PASSWORD || 'admin123';
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await page.goto('/login');
    // Labels are not programmatically associated; target inputs directly
    await page.locator('input[type="text"]').first().fill(username);
    await page.locator('input[type="password"]').first().fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();

    try {
      await expect(page.locator('body')).toContainText(
        /Dashboard|Assignment Grid|People|Projects|My Work|Your account is not linked to a Person profile yet/i,
        { timeout: 15000 }
      );
      return;
    } catch (error) {
      const bodyText = await page.locator('body').innerText();
      const throttleMatch = bodyText.match(/expected available in\s+(\d+)\s+second/i);
      if (!throttleMatch || attempt === maxAttempts) {
        throw error;
      }
      const waitSeconds = Number.parseInt(throttleMatch[1], 10);
      await page.waitForTimeout((Number.isFinite(waitSeconds) ? waitSeconds : 1) * 1000 + 500);
    }
  }
}
