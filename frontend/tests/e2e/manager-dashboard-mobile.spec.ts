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

const dashboardPayload = {
  summary: {
    total_people: 8,
    avg_utilization: 75,
    peak_utilization: 120,
    peak_person: 'Casey Morgan',
    total_assignments: 12,
    overallocated_count: 2,
  },
  utilization_distribution: {
    underutilized: 3,
    optimal: 4,
    high: 1,
    overallocated: 2,
  },
  team_overview: [
    {
      id: 201,
      name: 'Jordan Lee',
      role: 'Electrical Lead',
      utilization_percent: 80,
      allocated_hours: 32,
      capacity: 40,
      is_overallocated: false,
      peak_utilization_percent: 90,
      peak_week: '2025-01-06',
      is_peak_overallocated: false,
    },
    {
      id: 202,
      name: 'Alijah Williams',
      role: 'Engineer',
      utilization_percent: 110,
      allocated_hours: 44,
      capacity: 40,
      is_overallocated: true,
      peak_utilization_percent: 120,
      peak_week: '2025-01-13',
      is_peak_overallocated: true,
    },
  ],
  available_people: [],
  recent_assignments: [],
};

const peoplePayload = {
  count: 2,
  next: null,
  previous: null,
  results: [
    {
      id: 201,
      name: 'Jordan Lee',
      department: 10,
      departmentName: 'Electrical',
    },
    {
      id: 202,
      name: 'Alijah Williams',
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

test.describe('Manager dashboard mobile layout', () => {
  test('renders selectors and summary cards correctly below 480px', async ({ page }) => {
    await primeAuth(page);

    const dashboardQueries: URLSearchParams[] = [];

    await page.route('**/api/departments/**', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill(jsonResponse(departmentsPayload));
      }
      return route.continue();
    });

    await page.route('**/api/dashboard/**', (route) => {
      const url = new URL(route.request().url());
      const params = new URLSearchParams(url.search);
      dashboardQueries.push(new URLSearchParams(params));
      return route.fulfill(jsonResponse(dashboardPayload));
    });

    await page.route('**/api/people/?**', (route) =>
      route.fulfill(jsonResponse(peoplePayload))
    );

    await page.goto('/departments/manager');

    await expect(page.getByText('Manager Dashboard')).toBeVisible();
    await expect(page.getByLabelText(/Department:/i)).toBeVisible();
    await expect(page.getByLabelText(/Period:/i)).toBeVisible();

    // Wait for initial dashboard call: should include the auto-selected department
    await expect
      .poll(() => dashboardQueries.length, { timeout: 5000 })
      .toBeGreaterThan(0);

    const firstParams = dashboardQueries[0];
    expect(firstParams.get('department')).toBe('10');
    expect(firstParams.get('weeks')).toBeNull(); // default period (1 week) omits weeks parameter

    // Summary cards should render at mobile width
    await expect(page.getByText('Team Members')).toBeVisible();
    await expect(page.getByText('8')).toBeVisible();

    await expect(page.getByText('Department Utilization')).toBeVisible();
    await expect(page.getByText('75%')).toBeVisible();

    await expect(page.getByText('Active Assignments')).toBeVisible();
    await expect(page.getByText('12')).toBeVisible();

    await expect(page.getByText('Needs Attention')).toBeVisible();
    await expect(page.getByText('2')).toBeVisible();

    // Change period to 4 weeks and ensure dashboardApi is called with weeks=4
    await page.getByRole('button', { name: /4 wks/i }).click();

    await expect
      .poll(() => dashboardQueries.length, { timeout: 5000 })
      .toBeGreaterThan(1);

    const lastParams = dashboardQueries[dashboardQueries.length - 1];
    expect(lastParams.get('department')).toBe('10');
    expect(lastParams.get('weeks')).toBe('4');
  });
});

