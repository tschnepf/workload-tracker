import { test, expect } from '@playwright/test';
import { uiLogin } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await uiLogin(page);
});

test('people list paginates with page query', async ({ page }) => {
  let sawPaged = false;
  await page.route('**/api/people/**', (route) => {
    const url = route.request().url();
    if (url.includes('/api/people/') && url.includes('page=')) {
      sawPaged = true;
    }
    route.continue();
  });

  await page.goto('/people');
  await expect(page.locator('body')).toContainText(/People|Weekly Capacity|Department|Role/i);
  await expect.poll(() => sawPaged ? 'yes' : 'no', { timeout: 5000 }).toBe('yes');
});

