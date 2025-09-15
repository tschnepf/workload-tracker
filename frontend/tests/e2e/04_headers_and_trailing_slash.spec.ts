import { test, expect } from '@playwright/test';
import { uiLogin } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await uiLogin(page);
});

test('people list request uses auth header and trailing slash', async ({ page }) => {
  let sawPeopleRequest = false;
  let hadAuthHeader = false;
  let urlHadTrailingSlash = false;

  await page.route('**/api/people/**', (route) => {
    const req = route.request();
    const url = req.url();
    const headers = req.headers();
    sawPeopleRequest = true;
    hadAuthHeader = !!headers['authorization'];
    // ensure trailing slash before query string
    const [path] = url.split('?');
    urlHadTrailingSlash = path.endsWith('/api/people/');
    route.continue();
  });

  await page.goto('/people');
  await expect(page.locator('body')).toContainText(/People|Weekly Capacity|Department|Role/i);

  await expect.poll(() => sawPeopleRequest ? 'yes' : 'no', { timeout: 5000 }).toBe('yes');
  expect(hadAuthHeader).toBeTruthy();
  expect(urlHadTrailingSlash).toBeTruthy();
});

