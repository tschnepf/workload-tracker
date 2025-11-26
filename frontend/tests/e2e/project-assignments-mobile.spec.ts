import { test, expect, devices } from '@playwright/test';
import { primeAuth, jsonResponse } from './utils';

const weekKeys = ['2025-11-24', '2025-12-01', '2025-12-08'];

const snapshotPayload = {
  weekKeys,
  projects: [
    { id: 501, name: 'Abernathy Masterplan/B1', client: 'ADC', status: 'active' },
    { id: 502, name: 'Switch ATL 12', client: 'Switch', status: 'active' },
  ],
  hoursByProject: {
    501: { '2025-11-24': 32, '2025-12-01': 28, '2025-12-08': 10 },
    502: { '2025-11-24': 12, '2025-12-01': 8, '2025-12-08': 16 },
  },
  deliverablesByProjectWeek: {
    501: { '2025-11-24': 1 },
    502: {},
  },
  hasFutureDeliverablesByProject: { 501: true, 502: false },
  metrics: { projectsCount: 2, peopleAssignedCount: 1, totalHours: 98 },
};

const assignmentsByProject: Record<number, any[]> = {
  501: [
    {
      id: 9101,
      person: 710,
      personName: 'Tim Schnepf',
      personDepartmentId: 7,
      personWeeklyCapacity: 36,
      weeklyHours: {
        '2025-11-24': 18,
        '2025-12-01': 20,
        '2025-12-08': 22,
      },
      roleOnProjectId: null,
      roleName: null,
    },
  ],
};

const roleCatalog = [
  { id: 301, name: 'Electrical Lead', is_active: true, sort_order: 1, department_id: 7 },
  { id: 302, name: 'QA Reviewer', is_active: true, sort_order: 2, department_id: 7 },
];

const deliverableCalendar = [
  {
    id: 8001,
    project: 501,
    date: '2025-11-27',
    description: 'Masterplan',
    percentage: 95,
    notes: 'IFC package',
  },
];

test.use({
  ...devices['Pixel 5'],
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

test.describe('Project assignments mobile interactions', () => {
  test('expands projects and opens role sheet without drifting query params', async ({ page }) => {
    await primeAuth(page, {
      'deptFilter.selectedId': '3',
      'deptFilter.includeChildren': '0',
    });

    let snapshotQuery: URLSearchParams | null = null;
    let assignmentsQuery: URLSearchParams | null = null;
    const roleQueries: URLSearchParams[] = [];

    await page.route('**/api/capabilities/**', (route) =>
      route.fulfill(
        jsonResponse({
          asyncJobs: false,
          aggregates: {},
          cache: { shortTtlAggregates: false, aggregateTtlSeconds: 30 },
          projectRolesByDepartment: true,
        })
      )
    );

    await page.route('**/api/assignments/project_grid_snapshot/**', (route) => {
      const url = new URL(route.request().url());
      snapshotQuery = new URLSearchParams(url.search);
      return route.fulfill(jsonResponse(snapshotPayload));
    });

    await page.route('**/api/assignments/project_totals/**', (route) =>
      route.fulfill(jsonResponse({ hoursByProject: snapshotPayload.hoursByProject }))
    );

    await page.route('**/api/projects/project-roles/**', (route) => {
      const url = new URL(route.request().url());
      roleQueries.push(new URLSearchParams(url.search));
      return route.fulfill(jsonResponse(roleCatalog));
    });

    await page.route('**/api/projects/**', (route) => {
      const url = new URL(route.request().url());
      const pageParam = url.searchParams.get('page');
      if (pageParam && pageParam !== '1') {
        return route.fulfill(jsonResponse({ results: [], count: snapshotPayload.projects.length }));
      }
      return route.fulfill(jsonResponse({ results: snapshotPayload.projects, count: snapshotPayload.projects.length }));
    });

    await page.route('**/api/assignments/?**', (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('project')) {
        assignmentsQuery = new URLSearchParams(url.search);
        const pid = Number(url.searchParams.get('project'));
        return route.fulfill(
          jsonResponse({
            results: assignmentsByProject[pid] || [],
            count: assignmentsByProject[pid]?.length || 0,
          })
        );
      }
      return route.fulfill(jsonResponse({ results: [], count: 0 }));
    });

    await page.route('**/api/deliverables/calendar/**', (route) =>
      route.fulfill(jsonResponse(deliverableCalendar))
    );

    await page.route('**/api/deliverables/bulk/**', (route) =>
      route.fulfill(jsonResponse({}))
    );

    await page.route('**/api/**', (route) => route.fulfill(jsonResponse({})));

    await page.goto('/project-assignments');

    const projectCard = page.getByRole('button', { name: /Abernathy Masterplan\/B1/i }).first();
    await expect(projectCard).toBeVisible();

    await expect.poll(() => snapshotQuery?.get('weeks')).toBe('20');
    expect(snapshotQuery?.get('department')).toBe('3');
    expect(snapshotQuery?.get('include_children')).toBe('0');
    expect(snapshotQuery?.get('status_in')).toBe('active,active_ca');

    await projectCard.click();
    await expect(page.getByText('Tim Schnepf')).toBeVisible();

    await expect.poll(() => assignmentsQuery?.get('project')).toBe('501');
    expect(assignmentsQuery?.get('department')).toBe('3');
    expect(assignmentsQuery?.get('include_children')).toBe('0');

    await page.getByRole('button', { name: 'No role' }).click();
    const roleSheet = page.getByRole('dialog', { name: 'Select Role' });
    await expect(roleSheet).toBeVisible();
    await expect(roleSheet.getByRole('button', { name: 'Electrical Lead' })).toBeVisible();

    expect(roleQueries.some((params) => params.get('department') === '7')).toBe(true);

    await roleSheet.getByRole('button', { name: 'Close sheet' }).click();
    await expect(roleSheet).not.toBeVisible();

    await projectCard.click();
    await expect(page.getByText('Tim Schnepf')).not.toBeVisible();
  });
});
