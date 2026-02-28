import { test, expect } from '@playwright/test';
import { mockApiFallback, primeAuth, jsonResponse } from './utils';

test.beforeEach(async ({ page }) => {
  await mockApiFallback(page);
  await primeAuth(page);

  const peopleRows = [
    {
      id: 101,
      name: 'Casey Cooper',
      weeklyCapacity: 40,
      department: 1,
      role: 10,
      location: 'Remote',
      isActive: true,
    },
  ];
  await page.route('**/api/ui/people-page/**', (route) =>
    route.fulfill(
      jsonResponse({
        contractVersion: 1,
        filters: {
          departments: [{ id: 1, name: 'Electrical' }],
          roles: [{ id: 10, name: 'Designer' }],
          locations: ['Remote'],
        },
        people: { count: peopleRows.length, results: peopleRows, next: null, previous: null },
      })
    )
  );
  await page.route('**/api/people/search/**', (route) =>
    route.fulfill(jsonResponse({ count: peopleRows.length, results: peopleRows, next: null, previous: null }))
  );
  await page.route('**/api/people/filters-metadata/**', (route) =>
    route.fulfill(
      jsonResponse({
        departments: [{ id: 1, name: 'Electrical' }],
        roles: [{ id: 10, name: 'Designer' }],
        locations: ['Remote'],
      })
    )
  );
});

test('people list loads and shows rows', async ({ page }) => {
  await page.goto('/people');
  // Expect a list or table-like content
  await expect(page.locator('body')).toContainText(/People|Weekly Capacity|Department|Role/i);
});
