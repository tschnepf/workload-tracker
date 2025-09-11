import { test, expect } from '@playwright/test';
import { uiLogin } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await uiLogin(page);
});

test('projects list loads and shows items', async ({ page }) => {
  await page.goto('/projects');
  await expect(page.locator('body')).toContainText(/Projects|Status|Client|Estimated Hours/i);
});

