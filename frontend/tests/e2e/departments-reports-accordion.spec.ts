import { test, expect, devices } from '@playwright/test';
import { primeAuth, jsonResponse } from './utils';

const departmentsPayload = {
  count: 2,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      name: 'Electrical',
      managerName: 'Jordan Lee',
      parentDepartment: null,
      isActive: true,
      description: 'Power and lighting',
    },
    {
      id: 2,
      name: 'Mechanical',
      managerName: 'Alijah Williams',
      parentDepartment: null,
      isActive: true,
      description: 'HVAC and plumbing',
    },
  ],
};

const peoplePayload = {
  count: 2,
  next: null,
  previous: null,
  results: [
    { id: 101, name: 'Jordan Lee', department: 1, weeklyCapacity: 40 },
    { id: 102, name: 'Alijah Williams', department: 2, weeklyCapacity: 36 },
  ],
};

const skillsPayload = {
  count: 0,
  next: null,
  previous: null,
  results: [],
};

const dashboardPayload = (deptId: number) => ({
  summary: {
    total_people: deptId === 1 ? 5 : 3,
    avg_utilization: deptId === 1 ? 78 : 72,
    peak_utilization: deptId === 1 ? 95 : 88,
    peak_person: deptId === 1 ? 'Jordan Lee' : 'Alijah Williams',
    total_assignments: deptId === 1 ? 12 : 7,
    overallocated_count: deptId === 1 ? 1 : 0,
  },
  utilization_distribution: {
    underutilized: 0,
    optimal: 0,
    high: 0,
    overallocated: 0,
  },
  team_overview: [],
  available_people: [],
  recent_assignments: [],
});

test.describe('Department reports accordion behavior', () => {
  test.use({
    ...devices['iPhone 12'],
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test('accordion lazy-loads analytics on mobile without duplicate dashboard calls', async ({ page }) => {
    await primeAuth(page);

    const dashboardQueries: URLSearchParams[] = [];

    await page.route('**/api/departments/**', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill(jsonResponse(departmentsPayload));
      }
      return route.continue();
    });

    await page.route('**/api/people/**', (route) =>
      route.fulfill(jsonResponse(peoplePayload))
    );

    await page.route('**/api/skills/person-skills/**', (route) =>
      route.fulfill(jsonResponse(skillsPayload))
    );

    await page.route('**/api/dashboard/**', (route) => {
      const url = new URL(route.request().url());
      const params = new URLSearchParams(url.search);
      dashboardQueries.push(new URLSearchParams(params));
      const deptParam = params.get('department');
      const deptId = deptParam ? Number(deptParam) : 0;
      return route.fulfill(jsonResponse(dashboardPayload(deptId)));
    });

    await page.goto('/departments/reports');

    await expect(page.getByText('Department Reports')).toBeVisible();

    // Wait for initial batched load (dashboard calls per department)
    await expect
      .poll(() => dashboardQueries.length, { timeout: 8000 })
      .toBe(2);

    // On mobile, the accordion should start collapsed
    await expect(page.getByRole('button', { name: /Assigned Hours Analytics/i })).toBeVisible();
    await expect(page.getByText(/Assigned Hours Timeline/i)).not.toBeVisible();

    // Expand analytics accordion
    await page.getByRole('button', { name: /Assigned Hours Analytics/i }).click();

    // The charts should now be visible
    await expect(page.getByText(/Assigned Hours Timeline/i)).toBeVisible();

    // Expanding does NOT trigger extra dashboardApi calls
    await expect
      .poll(() => dashboardQueries.length, { timeout: 3000 })
      .toBe(2);

    // Collapse again
    await page.getByRole('button', { name: /Assigned Hours Analytics/i }).click();
    await expect(page.getByText(/Assigned Hours Timeline/i)).not.toBeVisible();
  });

  test('accordion is open by default on desktop and reuses dashboard calls', async ({ page }) => {
    await primeAuth(page);

    const dashboardQueries: URLSearchParams[] = [];

    await page.route('**/api/departments/**', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill(jsonResponse(departmentsPayload));
      }
      return route.continue();
    });

    await page.route('**/api/people/**', (route) =>
      route.fulfill(jsonResponse(peoplePayload))
    );

    await page.route('**/api/skills/person-skills/**', (route) =>
      route.fulfill(jsonResponse(skillsPayload))
    );

    await page.route('**/api/dashboard/**', (route) => {
      const url = new URL(route.request().url());
      const params = new URLSearchParams(url.search);
      dashboardQueries.push(new URLSearchParams(params));
      const deptParam = params.get('department');
      const deptId = deptParam ? Number(deptParam) : 0;
      return route.fulfill(jsonResponse(dashboardPayload(deptId)));
    });

    // Switch to a wider viewport to exercise desktop behavior
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/departments/reports');

    await expect(page.getByText('Department Reports')).toBeVisible();

    // Wait for initial dashboard calls (once per department)
    await expect
      .poll(() => dashboardQueries.length, { timeout: 8000 })
      .toBe(2);

    // Accordion should be open by default on desktop; timeline heading should be visible
    await expect(page.getByText(/Assigned Hours Timeline/i)).toBeVisible();

    // Toggling the accordion does not cause additional dashboard calls
    await page.getByRole('button', { name: /Assigned Hours Analytics/i }).click();
    await expect(page.getByText(/Assigned Hours Timeline/i)).not.toBeVisible();

    await page.getByRole('button', { name: /Assigned Hours Analytics/i }).click();
    await expect(page.getByText(/Assigned Hours Timeline/i)).toBeVisible();

    await expect
      .poll(() => dashboardQueries.length, { timeout: 3000 })
      .toBe(2);
  });
});

