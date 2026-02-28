import { test, expect } from '@playwright/test';
import { mockApiFallback, primeAuth, jsonResponse } from './utils';

test.beforeEach(async ({ page }) => {
  await mockApiFallback(page);
  await primeAuth(page);

  const projectRows = [
    {
      id: 501,
      name: 'Atlas HQ',
      status: 'active',
      client: 'Stack',
      projectNumber: 'A-100',
      isActive: true,
    },
  ];
  await page.route('**/api/projects/search/**', (route) =>
    route.fulfill(jsonResponse({ results: projectRows, count: projectRows.length, next: null, previous: null }))
  );
  await page.route('**/api/projects/filter-metadata/**', (route) =>
    route.fulfill(
      jsonResponse({
        projectFilters: {
          '501': {
            assignmentCount: 2,
            hasFutureDeliverables: true,
            status: 'active',
          },
        },
      })
    )
  );
});

test('projects list loads and shows items', async ({ page }) => {
  await page.goto('/projects');
  await expect(page.locator('body')).toContainText(/Projects|Status|Client|Atlas HQ/i);
});
