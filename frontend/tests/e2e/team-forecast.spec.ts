import { test, expect } from '@playwright/test';
import { jsonResponse, primeAuth } from './utils';

const forecastPayload = [
  {
    weekStart: '2025-11-24',
    totalCapacity: 400,
    totalAllocated: 320,
  },
  {
    weekStart: '2025-12-01',
    totalCapacity: 400,
    totalAllocated: 280,
  },
  {
    weekStart: '2025-12-08',
    totalCapacity: 400,
    totalAllocated: 360,
  },
];

const departmentsPayload = {
  results: [
    { id: 1, name: 'Electrical' },
    { id: 2, name: 'Mechanical' },
  ],
  count: 2,
};

const projectsPayload = {
  results: [
    { id: 101, name: 'Atlas HQ', status: 'active', client: 'Stack' },
    { id: 102, name: 'Switch ATL', status: 'active', client: 'ADC' },
  ],
  count: 2,
};

const assignmentsPayload = {
  results: [
    {
      id: 1,
      person: 1,
      project: 101,
      weeklyHours: {
        '2025-11-25': 5,
        '2025-12-02': 10,
      },
    },
  ],
  count: 1,
};

const deliverablesPayload = {
  results: [
    {
      id: 501,
      project: 101,
      description: 'IFC Package',
      status: 'active',
    },
  ],
  count: 1,
};

test.describe('Team Forecast responsive charts', () => {
  test('renders compact capacity and project charts at 360px', async ({ page }) => {
    await primeAuth(page);

    await page.route('**/api/people/workload_forecast/**', (route) =>
      route.fulfill(jsonResponse(forecastPayload))
    );
    await page.route('**/api/departments/**', (route) =>
      route.fulfill(jsonResponse(departmentsPayload))
    );
    await page.route('**/api/projects/**', (route) =>
      route.fulfill(jsonResponse(projectsPayload))
    );
    await page.route('**/api/assignments/**', (route) =>
      route.fulfill(jsonResponse(assignmentsPayload))
    );
    await page.route('**/api/deliverables/**', (route) =>
      route.fulfill(jsonResponse(deliverablesPayload))
    );
    await page.route('**/api/**', (route) => route.fulfill(jsonResponse({})));

    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/reports/team-forecast');

    await expect(page.getByRole('heading', { name: /Team Forecast & Project Timeline/i })).toBeVisible();
    await expect(page.getByText('Weeks:')).toBeVisible();

    await expect(page.getByText('Capacity Timeline')).toBeVisible();
    await expect(page.getByText('Project Timeline')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Apply Filters' })).toBeVisible();

    const weekButton = page.getByRole('button', { name: /^Week$/ });
    await weekButton.click();
    await expect(weekButton).toHaveAttribute('aria-pressed', 'true');

    await expect(page).toHaveScreenshot('team-forecast-360.png', { fullPage: true });
  });

  test('renders full SVG capacity timeline and legends at 768px', async ({ page }) => {
    await primeAuth(page);

    await page.route('**/api/people/workload_forecast/**', (route) =>
      route.fulfill(jsonResponse(forecastPayload))
    );
    await page.route('**/api/departments/**', (route) =>
      route.fulfill(jsonResponse(departmentsPayload))
    );
    await page.route('**/api/projects/**', (route) =>
      route.fulfill(jsonResponse(projectsPayload))
    );
    await page.route('**/api/assignments/**', (route) =>
      route.fulfill(jsonResponse(assignmentsPayload))
    );
    await page.route('**/api/deliverables/**', (route) =>
      route.fulfill(jsonResponse(deliverablesPayload))
    );
    await page.route('**/api/**', (route) => route.fulfill(jsonResponse({})));

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/reports/team-forecast');

    await expect(page.getByText('Capacity Timeline')).toBeVisible();

    const svg = page.locator('svg[aria-label="Capacity timeline chart"]');
    await expect(svg).toBeVisible();

    await expect(page.getByText('Total Capacity')).toBeVisible();
    await expect(page.getByText('Allocated Hours')).toBeVisible();
    await expect(page.getByText('Available Hours')).toBeVisible();
    await expect(page.getByText('Utilization (area)')).toBeVisible();

    const point = svg.locator('circle').first();
    await point.hover();

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();

    await expect(page).toHaveScreenshot('team-forecast-768.png', { fullPage: true });
  });
});

