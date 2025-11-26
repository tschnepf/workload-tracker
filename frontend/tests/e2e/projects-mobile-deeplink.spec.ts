import { test, expect, devices } from '@playwright/test';
import { primeAuth, jsonResponse } from './utils';

const projectsPayload = {
  count: 2,
  next: null,
  previous: null,
  results: [
    {
      id: 501,
      name: 'Abernathy B2',
      client: 'ADC',
      status: 'active',
      projectNumber: 'PRJ-501',
      description: 'Switchyard upgrades',
      estimatedHours: 120,
      startDate: '2026-03-27',
    },
    {
      id: 502,
      name: 'Switch ATL 12',
      client: 'Switch',
      status: 'active',
      projectNumber: 'PRJ-502',
      description: 'Distribution refresh',
      estimatedHours: 80,
    },
  ],
};

const filterMetadata = {
  projectFilters: {
    '501': { assignmentCount: 1, hasFutureDeliverables: true, status: 'active' },
    '502': { assignmentCount: 0, hasFutureDeliverables: false, status: 'active' },
  },
};

const peoplePayload = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 710,
      name: 'Tim Schnepf',
      department: 7,
      departmentName: 'Electrical',
      roleName: 'Electrical Lead',
    },
  ],
};

const assignmentsPayload = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 9101,
      person: 710,
      personName: 'Tim Schnepf',
      personDepartmentId: 7,
      weeklyHours: {
        '2025-11-24': 18,
        '2025-12-01': 12,
      },
      project: 501,
      roleName: null,
    },
  ],
};

test.use({
  ...devices['iPhone 12'],
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

test.describe('Projects mobile deep link drawer', () => {
  test('deep link selects project and loads assignments without drift', async ({ page }) => {
    await primeAuth(page);

    const assignmentQueries: URLSearchParams[] = [];

    await page.route('**/api/projects/filter-metadata/**', (route) =>
      route.fulfill(jsonResponse(filterMetadata))
    );

    await page.route('**/api/projects/?**', (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('all') === 'true') {
        return route.fulfill(jsonResponse({ ...projectsPayload, next: null, previous: null }));
      }
      const pageParam = Number(url.searchParams.get('page') || '1');
      if (pageParam > 1) {
        return route.fulfill(jsonResponse({ results: [], count: projectsPayload.count, next: null, previous: null }));
      }
      return route.fulfill(jsonResponse(projectsPayload));
    });

    await page.route('**/api/people/?**', (route) => route.fulfill(jsonResponse(peoplePayload)));

    await page.route('**/api/deliverables/bulk/**', (route) =>
      route.fulfill(
        jsonResponse({
          '501': [
            {
              id: 8001,
              project: 501,
              description: 'IFC Package',
              percentage: 95,
              date: '2026-04-10',
            },
          ],
          '502': [],
        })
      )
    );

    await page.route('**/api/deliverables/?**', (route) =>
      route.fulfill(jsonResponse({ count: 0, next: null, previous: null, results: [] }))
    );

    await page.route('**/api/deliverables/calendar/**', (route) => route.fulfill(jsonResponse([])));

    await page.route('**/api/projects/*/availability/**', (route) =>
      route.fulfill(
        jsonResponse([
          {
            personId: 710,
            availableHours: 12,
            utilizationPercent: 50,
            totalHours: 24,
            capacity: 36,
          },
        ])
      )
    );

    await page.route('**/api/assignments/?**', (route) => {
      const url = new URL(route.request().url());
      const params = new URLSearchParams(url.search);
      if (params.get('project')) {
        assignmentQueries.push(new URLSearchParams(params));
        return route.fulfill(jsonResponse(assignmentsPayload));
      }
      return route.fulfill(jsonResponse({ count: 0, next: null, previous: null, results: [] }));
    });

    await page.route('**/api/projects/project-roles/**', (route) =>
      route.fulfill(jsonResponse([{ id: 301, name: 'Electrical Lead', sort_order: 1, is_active: true, department_id: 7 }]))
    );

    await page.route('**/api/capabilities/**', (route) =>
      route.fulfill(jsonResponse({ asyncJobs: false, aggregates: {}, cache: {} }))
    );

    await page.goto('/projects?projectId=501');

    await expect(page.getByText('Projects')).toBeVisible();
    await expect.poll(() => assignmentQueries.length).toBe(1);
    expect(assignmentQueries[0].get('project')).toBe('501');
    expect(assignmentQueries[0].get('page_size')).toBe('200');

    const projectCard = page.locator('div').filter({ hasText: /^Abernathy B2$/ }).first();
    await projectCard.click();

    await expect(page.getByText('Client:')).toBeVisible();
    await expect(page.getByText('Tim Schnepf')).toBeVisible();
    await expect(page).toHaveURL(/projectId=501/);
    expect(assignmentQueries.length).toBe(1);
  });
});
