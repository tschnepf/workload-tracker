import { test, expect } from '@playwright/test';
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

const departmentsOverviewPayload = {
  contractVersion: 1,
  partialFailures: [],
  errorsByScope: {},
  departments: departmentsPayload.results,
  overviewByDepartment: {
    '1': {
      peopleCount: 5,
      skills: {
        totalSkills: 0,
        topSkills: [],
        uniqueSkills: 0,
        skillGaps: [],
      },
      dashboardSummary: {
        avgUtilization: 78,
        peakUtilization: 95,
        totalAssignments: 12,
        overallocatedCount: 1,
        availableHours: 44,
      },
    },
    '2': {
      peopleCount: 3,
      skills: {
        totalSkills: 0,
        topSkills: [],
        uniqueSkills: 0,
        skillGaps: [],
      },
      dashboardSummary: {
        avgUtilization: 72,
        peakUtilization: 88,
        totalAssignments: 7,
        overallocatedCount: 0,
        availableHours: 30,
      },
    },
  },
  analyticsSeries: {
    utilizationByDepartment: [
      { departmentId: 1, avgUtilization: 78 },
      { departmentId: 2, avgUtilization: 72 },
    ],
    assignmentsByDepartment: [
      { departmentId: 1, totalAssignments: 12 },
      { departmentId: 2, totalAssignments: 7 },
    ],
    peopleByDepartment: [
      { departmentId: 1, peopleCount: 5 },
      { departmentId: 2, peopleCount: 3 },
    ],
    utilizationTimelineByDepartment: [],
  },
};

test.describe('Department reports accordion behavior', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test('accordion lazy-loads analytics on mobile without duplicate dashboard calls', async ({ page }) => {
    await primeAuth(page);

    const dashboardQueries: URLSearchParams[] = [];

    await page.route('**/api/reports/departments/overview/**', (route) =>
      route.fulfill(jsonResponse(departmentsOverviewPayload))
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

    // Consolidated endpoint should avoid per-department dashboard fan-out.
    await expect
      .poll(() => dashboardQueries.length, { timeout: 8000 })
      .toBe(0);

    // On mobile, the accordion should start collapsed
    await expect(page.getByRole('button', { name: /Assigned Hours Analytics/i })).toBeVisible();
    await expect(page.getByText(/Assigned Hours Timeline/i)).not.toBeVisible();

    // Expand analytics accordion
    await page.getByRole('button', { name: /Assigned Hours Analytics/i }).click();

    // The charts should now be visible
    await expect(page.getByText(/Assigned Hours Timeline/i)).toBeVisible();

    // Expanding does NOT trigger per-department dashboard calls.
    await expect
      .poll(() => dashboardQueries.length, { timeout: 3000 })
      .toBe(0);

    // Collapse again
    await page.getByRole('button', { name: /Assigned Hours Analytics/i }).click();
    await expect(page.getByText(/Assigned Hours Timeline/i)).not.toBeVisible();
  });

  test('accordion is open by default on desktop and reuses dashboard calls', async ({ page }) => {
    await primeAuth(page);

    const dashboardQueries: URLSearchParams[] = [];

    await page.route('**/api/reports/departments/overview/**', (route) =>
      route.fulfill(jsonResponse(departmentsOverviewPayload))
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

    // Wait for load and assert no per-department dashboard calls.
    await expect
      .poll(() => dashboardQueries.length, { timeout: 8000 })
      .toBe(0);

    // Accordion should be open by default on desktop; timeline heading should be visible
    await expect(page.getByText(/Assigned Hours Timeline/i)).toBeVisible();

    // Toggling the accordion does not cause additional dashboard calls
    await page.getByRole('button', { name: /Assigned Hours Analytics/i }).click();
    await expect(page.getByText(/Assigned Hours Timeline/i)).not.toBeVisible();

    await page.getByRole('button', { name: /Assigned Hours Analytics/i }).click();
    await expect(page.getByText(/Assigned Hours Timeline/i)).toBeVisible();

    await expect
      .poll(() => dashboardQueries.length, { timeout: 3000 })
      .toBe(0);
  });
});
