import { test, expect } from '@playwright/test';
import { jsonResponse, primeAuth, mockApiFallback } from './utils';

const rolesPayload = [
  { id: 1, name: 'Principal Engineer' },
  { id: 2, name: 'Director' },
  { id: 3, name: 'Senior Associate' },
  { id: 4, name: 'Project Engineer' },
  { id: 5, name: 'Designer' },
  { id: 6, name: 'Intern' },
];

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
    await mockApiFallback(page);
    await primeAuth(page);

    await page.route('**/api/reports/role-capacity/bootstrap/**', (route) =>
      route.fulfill(
        jsonResponse({
          departments: [{ id: 1, name: 'Electrical' }],
          roles: rolesPayload,
          timeline: {
            weekKeys: roleCapacityPayload.weekKeys,
            series: roleCapacityPayload.series,
          },
        })
      )
    );

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
