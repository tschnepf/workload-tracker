import { test, expect, devices } from '@playwright/test';
import { primeAuth, jsonResponse, mockApiFallback } from './utils';

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
      project: 501,
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

const assignmentsPagePayload = {
  contractVersion: 1,
  included: ['assignment'],
  assignmentGridSnapshot: {
    weekKeys,
    people: [],
    hoursByPerson: {},
  },
  projects: snapshotPayload.projects,
  deliverables: deliverableCalendar,
  departments: [{ id: 3, name: 'Electrical' }],
  autoHoursBundle: {
    contractVersion: 1,
    phaseMapping: { useDescriptionMatch: true, phases: [] },
    templates: [],
    defaultSettingsByPhase: {},
    weekLimitsByPhase: {},
    bundleComplete: true,
    missingTemplateIds: [],
  },
};

test.use({
  ...devices['Pixel 5'],
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

test.describe('Project assignments mobile interactions', () => {
  test('expands projects and opens role sheet without drifting query params', async ({ page }) => {
    await mockApiFallback(page);
    await primeAuth(page, {
      'deptFilter.selectedId': '3',
      'deptFilter.includeChildren': '0',
    });

    let snapshotQuery: URLSearchParams | null = null;
    let assignmentsQuery: URLSearchParams | null = null;

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

    await page.route('**/api/ui/assignments-page/**', (route) => {
      const url = new URL(route.request().url());
      snapshotQuery = new URLSearchParams(url.search);
      return route.fulfill(jsonResponse(assignmentsPagePayload));
    });

    await page.route('**/api/projects/project-roles/**', (route) => {
      return route.fulfill(jsonResponse(roleCatalog));
    });

    await page.route('**/api/projects/search/**', (route) => {
      const payload = JSON.parse(route.request().postData() || '{}');
      const pageParam = Number(payload.page || 1);
      if (pageParam > 1) {
        return route.fulfill(jsonResponse({ results: [], count: snapshotPayload.projects.length, next: null }));
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

    await page.goto('/project-assignments');

    const projectCard = page.getByRole('button', { name: /Abernathy Masterplan\/B1/i }).first();
    await expect(projectCard).toBeVisible();

    await expect.poll(() => snapshotQuery?.get('weeks')).toBe('20');
    expect(snapshotQuery?.get('department')).toBe('3');
    expect(snapshotQuery?.get('include_children')).toBe('1');

    await projectCard.click();
    await expect(page.getByText('Tim Schnepf')).toBeVisible();

    await expect.poll(() => assignmentsQuery?.get('project')).toBe('501');
    expect(assignmentsQuery?.get('department')).toBe('3');
    expect(assignmentsQuery?.get('include_children')).toBe('1');

    const assignmentCard = page.getByRole('button', { name: /Tim Schnepf/i });
    await assignmentCard.click();
    const assignmentSheet = page.getByRole('dialog', { name: /Tim Schnepf/i });
    await expect(assignmentSheet).toBeVisible();
    await expect(assignmentSheet.getByText(/Unassigned role/i)).toBeVisible();
    await assignmentSheet.getByRole('button', { name: 'Cancel' }).click();
    await expect(assignmentSheet).not.toBeVisible();

    await projectCard.click();
    await expect(page.getByText('Tim Schnepf')).not.toBeVisible();
  });
});
