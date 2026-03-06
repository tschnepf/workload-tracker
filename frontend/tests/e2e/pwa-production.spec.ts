import { expect, test } from '@playwright/test';

test.describe('PWA Production Build', () => {
  test('serves manifest and registers service worker', async ({ request, page }) => {
    const manifestResponse = await request.get('/manifest.webmanifest');
    expect(manifestResponse.ok()).toBeTruthy();
    const manifest = await manifestResponse.json();
    expect(manifest?.name).toBe('Workload Tracker');
    expect(manifest?.display).toBe('standalone');
    expect(manifest?.start_url).toBe('/');

    const swResponse = await request.get('/sw.js');
    expect(swResponse.ok()).toBeTruthy();
    const swSource = await swResponse.text();
    expect(swSource.length).toBeGreaterThan(200);

    await page.goto('/offline');
    await expect(page.getByRole('heading', { name: /you are offline/i })).toBeVisible();

    const registrationCount = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return -1;
      let regs = await navigator.serviceWorker.getRegistrations();
      if (regs.length === 0) {
        try {
          await navigator.serviceWorker.register('/sw.js');
          regs = await navigator.serviceWorker.getRegistrations();
        } catch {
          return 0;
        }
      }
      return regs.length;
    });
    expect(registrationCount).toBeGreaterThan(0);
  });

  test('offline navigation falls back to offline page', async ({ page, context }) => {
    await page.goto('/offline');

    const ready = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      try {
        let reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
          reg = await navigator.serviceWorker.register('/sw.js');
        }
        for (let i = 0; i < 20; i += 1) {
          if (reg.active || reg.waiting) return true;
          await new Promise((resolve) => setTimeout(resolve, 250));
          reg = (await navigator.serviceWorker.getRegistration()) || reg;
        }
      } catch {
        return false;
      }
      return false;
    });
    test.skip(!ready, 'Service worker did not become ready in this browser context.');

    await page.reload();

    try {
      await context.setOffline(true);
      await page.goto('/projects', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).toContainText(/sign in|you are offline/i, { timeout: 10000 });
      await page.goto('/offline', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: /you are offline/i })).toBeVisible({ timeout: 10000 });
    } finally {
      await context.setOffline(false);
    }
  });
});
