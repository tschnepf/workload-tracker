import { test, expect, devices } from '@playwright/test';
import { primeAuth, jsonResponse } from './utils';

const departmentsPayload = {
  count: 2,
  next: null,
  previous: null,
  results: [
    {
      id: 10,
      name: 'Electrical',
      description: 'Power systems and lighting',
      manager: 101,
      managerName: 'Jordan Lee',
      parentDepartment: null,
      isActive: true,
      createdAt: '2024-01-15',
      updatedAt: '2024-02-01',
    },
    {
      id: 11,
      name: 'Mechanical',
      description: 'HVAC and plumbing',
      manager: null,
      managerName: null,
      parentDepartment: null,
      isActive: true,
      createdAt: '2024-03-10',
      updatedAt: '2024-03-20',
    },
  ],
};

const peoplePayload = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 101,
      name: 'Jordan Lee',
      department: 10,
      departmentName: 'Electrical',
    },
  ],
};

test.use({
  ...devices['iPhone 12'],
  viewport: { width: 375, height: 812 },
  hasTouch: true,
  isMobile: true,
});

test.describe('Departments mobile layered layout', () => {
  test('create, edit, and delete departments on mobile', async ({ page }) => {
    await primeAuth(page);

    const createdPayloads: any[] = [];
    const updatedPayloads: Array<{ id: number; data: any }> = [];
    const deletedIds: number[] = [];

    await page.route('**/api/departments/?**', (route) => {
      const url = new URL(route.request().url());
      // list endpoint: apiClient GET /departments/?...
      if (route.request().method() === 'GET') {
        return route.fulfill(jsonResponse(departmentsPayload));
      }
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as any;
        createdPayloads.push(body);
        return route.fulfill(
          jsonResponse({
            ...body,
            id: 99,
            managerName: null,
            createdAt: '2025-01-01',
            updatedAt: '2025-01-01',
          })
        );
      }
      return route.continue();
    });

    await page.route('**/api/departments/99/**', (route) => {
      const method = route.request().method();
      if (method === 'PATCH') {
        const body = route.request().postDataJSON() as any;
        updatedPayloads.push({ id: 99, data: body });
        return route.fulfill(
          jsonResponse({
            ...departmentsPayload.results[0],
            ...body,
            id: 99,
          })
        );
      }
      if (method === 'DELETE') {
        deletedIds.push(99);
        return route.fulfill(jsonResponse({}, 204));
      }
      return route.continue();
    });

    await page.route('**/api/people/?**', (route) =>
      route.fulfill(jsonResponse(peoplePayload))
    );

    await page.goto('/departments');

    await expect(page.getByText('Departments')).toBeVisible();

    // Create department via mobile header button
    await page.getByRole('button', { name: /add/i }).click();

    // DepartmentForm is reused; target its name field and save button.
    await page.getByPlaceholder('Department name').fill('Controls');
    await page.getByRole('button', { name: /save/i }).click();

    await expect.poll(() => createdPayloads.length).toBe(1);
    expect(createdPayloads[0].name).toBe('Controls');

    // Open details for newly created department from list
    await page.getByText('Controls').click();
    await expect(page.getByText('Department Info')).toBeVisible();

    // Edit department from drawer/header actions
    await page.getByRole('button', { name: /edit/i }).click();
    const descField = page.getByPlaceholder(/description/i).first();
    await descField.fill('Controls engineering');
    await page.getByRole('button', { name: /save/i }).click();

    await expect.poll(() => updatedPayloads.length).toBe(1);
    expect(updatedPayloads[0].id).toBe(99);
    expect(updatedPayloads[0].data.description).toBe('Controls engineering');

    // Delete department from drawer
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /delete/i }).click();

    await expect.poll(() => deletedIds.length).toBe(1);
    expect(deletedIds[0]).toBe(99);
  });
});

