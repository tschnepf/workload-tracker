import { test, expect } from '@playwright/test';
import { jsonResponse, primeAuth } from './utils';

const rolesPayload = [
  { id: 1, name: 'Principal Engineer' },
  { id: 2, name: 'Director' },
  { id: 3, name: 'Senior Associate' },
  { id: 4, name: 'Project Engineer' },
  { id: 5, name: 'Designer' },
  { id: 6, name: 'Intern' },
];

const departmentsPayload = {
  results: [{ id: 1, name: 'Electrical' }],
  count: 1,
};

const roleCapacityPayload = {
  weekKeys: ['2025-11-24', '2025-12-01', '2025-12-08'],
  roles: rolesPayload,
  series: rolesPayload.map((r, index) => ({
    roleId: r.id,
    roleName: r.name,
    assigned: [10 + index * 2, 12 + index * 2, 14 + index * 2],
    capacity: [20, 20, 20],
  })),
};

test.describe('Role Capacity mobile layout', () => {
  test('role chips wrap correctly at 360px', async ({ page }) => {
    await primeAuth(page);

    await page.route('**/api/roles/**', (route) =>
      route.fulfill(jsonResponse({ results: rolesPayload, count: rolesPayload.length }))
    );
    await page.route('**/api/departments/**', (route) =>
      route.fulfill(jsonResponse(departmentsPayload))
    );
    await page.route('**/api/assignments/analytics_role_capacity/**', (route) =>
      route.fulfill(jsonResponse(roleCapacityPayload))
    );
    await page.route('**/api/**', (route) => route.fulfill(jsonResponse({})));

    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/reports/role-capacity');

    await expect(page.getByText('Capacity vs Assigned by Role')).toBeVisible();

    const rolesGrid = page.getByText('Roles').locator('..').locator('..').locator('div').last();
    await expect(rolesGrid).toBeVisible();

    await expect(page.getByRole('button', { name: 'Principal Engineer' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Director' })).toBeVisible();

    await expect(page).toHaveScreenshot('role-capacity-360.png', { fullPage: true });
  });
});

