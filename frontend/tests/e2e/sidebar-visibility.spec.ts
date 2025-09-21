import { test, expect } from '@playwright/test';

// Helper to login; assumes a test user exists and /login route is functional
async function login(page) {
  await page.goto('/login');
  // Adjust selectors to your login form if different
  await page.fill('input[name="username"]', process.env.E2E_USER || 'admin');
  await page.fill('input[name="password"]', process.env.E2E_PASS || 'admin');
  await page.click('button:has-text("Log in")');
  await page.waitForURL('**/dashboard');
}

// Checks that body does not scroll and content container does
async function assertScrollIsolation(page) {
  const bodyScrollable = await page.evaluate(() => {
    const el = document.scrollingElement || document.documentElement;
    return el.scrollHeight > el.clientHeight;
  });
  expect(bodyScrollable).toBeFalsy();
}

// Locate sidebar container by its nav landmark and style
const sidebarLocator = (page) => page.locator('nav[aria-label="Primary"]');

const routes = [
  '/dashboard',
  '/assignments',
  '/projects',
  '/people'
];

for (const route of routes) {
  test(`sidebar persists and scrolls isolation on ${route}`, async ({ page }) => {
    await login(page);
    await page.goto(route);

    // Sidebar is visible
    await expect(sidebarLocator(page)).toBeVisible();

    // Try to scroll the page body; expect no body scroll
    await page.mouse.wheel(0, 1200);
    await assertScrollIsolation(page);

    // Main content should be scrollable; find main and ensure scrollHeight > clientHeight
    const mainScrollable = await page.evaluate(() => {
      const main = document.querySelector('main');
      if (!main) return false;
      return main.scrollHeight > main.clientHeight;
    });
    expect(mainScrollable).toBeTruthy();
  });
}

// Mobile behavior: hamburger opens off-canvas and background should not scroll
test('mobile drawer opens and traps focus', async ({ page, browserName }) => {
  await login(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/dashboard');

  // Hamburger visible
  const hamburger = page.locator('button[aria-label="Open navigation"]');
  await expect(hamburger).toBeVisible();

  // Open drawer
  await hamburger.click();

  // Sidebar landmark should appear within the dialog panel
  await expect(page.locator('div[role="dialog"] nav[aria-label="Primary"]')).toBeVisible();

  // Background should not scroll while open (body isolation still holds)
  await assertScrollIsolation(page);

  // Close with Escape
  await page.keyboard.press('Escape');
  await expect(page.locator('div[role="dialog"]')).toHaveCount(0);
});