import { test, expect, devices } from '@playwright/test';
import { primeAuth, jsonResponse } from './utils';

const departmentsPayload = {
  count: 3,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      name: 'Company',
      description: 'Top-level umbrella',
      manager: null,
      managerName: null,
      parentDepartment: null,
      isActive: true,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-15',
    },
    {
      id: 2,
      name: 'Electrical',
      description: 'Power and lighting',
      manager: 201,
      managerName: 'Jordan Lee',
      parentDepartment: 1,
      isActive: true,
      createdAt: '2024-01-10',
      updatedAt: '2024-02-01',
    },
    {
      id: 3,
      name: 'Mechanical',
      description: 'HVAC and plumbing',
      manager: 202,
      managerName: 'Alijah Williams',
      parentDepartment: 1,
      isActive: true,
      createdAt: '2024-01-12',
      updatedAt: '2024-02-05',
    },
  ],
};

const peoplePayload = {
  count: 3,
  next: null,
  previous: null,
  results: [
    {
      id: 201,
      name: 'Jordan Lee',
      department: 2,
      weeklyCapacity: 40,
    },
    {
      id: 202,
      name: 'Alijah Williams',
      department: 3,
      weeklyCapacity: 36,
    },
    {
      id: 203,
      name: 'Casey Morgan',
      department: 2,
      weeklyCapacity: 36,
    },
  ],
};

test.describe('Department hierarchy responsive snapshots', () => {
  test.use({
    ...devices['iPhone 12'],
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test('renders tree list fallback and mobile drawer at 390px', async ({ page }) => {
    await primeAuth(page);

    await page.route('**/api/departments/**', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill(jsonResponse(departmentsPayload));
      }
      return route.continue();
    });

    await page.route('**/api/people/**', (route) =>
      route.fulfill(jsonResponse(peoplePayload))
    );

    await page.goto('/departments/hierarchy');

    await expect(page.getByText('Department Hierarchy')).toBeVisible();
    await expect(page.getByText('Organizational Chart')).toBeVisible();

    // Legend and text-tree cards should be visible on mobile fallback
    await expect(page.getByText('Legend')).toBeVisible();
    await expect(page.getByText('Company')).toBeVisible();
    await expect(page.getByText('Electrical')).toBeVisible();
    await expect(page.getByText('Mechanical')).toBeVisible();

    // Tap a child department to open the mobile drawer
    await page.getByText('Electrical').first().click();
    await expect(page.getByText('Department Details')).toBeVisible();
    await expect(page.getByText('Jordan Lee')).toBeVisible();

    // Capture a full-page screenshot for regression
    await expect(page).toHaveScreenshot('departments-hierarchy-mobile-390.png', { fullPage: true });
  });

  test('renders zoomable canvas at 768px', async ({ page }) => {
    await primeAuth(page);

    await page.route('**/api/departments/**', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill(jsonResponse(departmentsPayload));
      }
      return route.continue();
    });

    await page.route('**/api/people/**', (route) =>
      route.fulfill(jsonResponse(peoplePayload))
    );

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/departments/hierarchy');

    await expect(page.getByText('Department Hierarchy')).toBeVisible();
    await expect(page.getByText('Organizational Chart')).toBeVisible();
    await expect(page.getByText('Legend')).toBeVisible();

    // Ensure zoom controls are present (desktop/canvas mode)
    await expect(page.getByText(/Scroll to pan/i)).toBeVisible();
    await expect(page.getByRole('button', { name: '−' })).toBeVisible();
    await expect(page.getByRole('button', { name: '+' })).toBeVisible();

    // Capture a screenshot of the canvas layout
    await expect(page).toHaveScreenshot('departments-hierarchy-canvas-768.png', { fullPage: true });
  });
});

