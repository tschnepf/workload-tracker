import { test, expect } from '@playwright/test';
import { uiLogin } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await uiLogin(page);
});

test('people list loads and shows rows', async ({ page }) => {
  await page.goto('/people');
  // Expect a list or table-like content
  await expect(page.locator('body')).toContainText(/People|Weekly Capacity|Department|Role/i);
});

