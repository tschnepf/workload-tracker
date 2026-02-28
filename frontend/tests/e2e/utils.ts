import type { Page } from '@playwright/test';

export const jsonResponse = (body: unknown, status = 200) => ({
  status,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export async function primeAuth(page: Page, flags: Record<string, string> = {}) {
  await page.addInitScript((map) => {
    window.localStorage.setItem('auth.refreshToken', 'test-refresh-token');
    for (const [key, value] of Object.entries(map)) {
      window.localStorage.setItem(key, value);
    }
  }, flags);

  await page.route('**/api/token/refresh/**', (route) =>
    route.fulfill(jsonResponse({ access: 'test-access-token' }))
  );
  await page.route('**/api/auth/me/**', (route) =>
    route.fulfill(
      jsonResponse({
        user: { id: 1, username: 'test', email: 'test@example.com', is_staff: true },
        person: { id: 42, name: 'Jordan Lee', department: 1 },
        settings: {},
      })
    )
  );
  await page.route('**/api/verticals/**', (route) =>
    route.fulfill(jsonResponse([]))
  );
  await page.route('**/api/departments/**', (route) =>
    route.fulfill(jsonResponse([]))
  );
}

export async function mockApiFallback(page: Page, fallbackBody: unknown = {}) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) {
      return route.continue();
    }
    return route.fulfill(jsonResponse(fallbackBody));
  });
}
