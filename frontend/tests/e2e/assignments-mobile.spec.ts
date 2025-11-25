import { test, expect, devices } from '@playwright/test';
import { jsonResponse, primeAuth } from './utils';

const weekKeys = ['2025-11-24', '2025-12-01', '2025-12-08'];

const snapshotPayload = {
  weekKeys,
  people: [
    { id: 101, name: 'Casey Cooper', weeklyCapacity: 40, department: 1 },
  ],
  hoursByPerson: {
    101: { '2025-11-24': 28, '2025-12-01': 10, '2025-12-08': 12 },
  },
};

const assignmentsByPerson: Record<number, any[]> = {
  101: [
    {
      id: 201,
      person: 101,
      project: 301,
      projectDisplayName: 'Acme Tower Expansion',
      weeklyHours: {
        '2025-11-24': 28,
        '2025-12-01': 12,
        '2025-12-08': 10,
      },
      roleOnProjectId: null,
      roleName: null,
    },
  ],
};

const projectsPayload = [
  { id: 301, name: 'Acme Tower Expansion', status: 'active', client: 'Acme' },
  { id: 302, name: 'Switch Fiber Upgrade', status: 'active', client: 'Switch' },
  { id: 303, name: 'Atlas Retrofit', status: 'planning', client: 'Atlas' },
];

async function mockAssignmentsApis(page: any) {
  await page.route('**/api/capabilities/**', (route: any) =>
    route.fulfill(
      jsonResponse({
        asyncJobs: false,
        aggregates: { capacityHeatmap: true, projectAvailability: true, findAvailable: true, gridSnapshot: true, skillMatch: true },
        cache: { shortTtlAggregates: false, aggregateTtlSeconds: 30 },
        personalDashboard: true,
      })
    )
  );

  await page.route('**/api/assignments/grid_snapshot/**', (route: any) =>
    route.fulfill(jsonResponse(snapshotPayload))
  );

  await page.route('**/api/people/**', (route: any) =>
    route.fulfill(jsonResponse({ results: [{ id: 101, name: 'Casey Cooper', department: 1 }], count: 1 }))
  );

  await page.route('**/api/projects/**', (route: any) =>
    route.fulfill(jsonResponse({ results: projectsPayload, count: projectsPayload.length }))
  );

  await page.route('**/api/deliverables/calendar/**', (route: any) =>
    route.fulfill(jsonResponse([]))
  );
  await page.route('**/api/deliverables/list/**', (route: any) =>
    route.fulfill(jsonResponse({ results: [] }))
  );

  await page.route('**/api/assignments/by_person/**', (route: any) => {
    const url = new URL(route.request().url());
    const personId = Number(url.searchParams.get('person_id'));
    route.fulfill(jsonResponse(assignmentsByPerson[personId] || []));
  });

  await page.route('**/api/assignments/201/**', (route: any) => {
    if (route.request().method() === 'PATCH') {
      const body = JSON.parse(route.request().postData() || '{}');
      assignmentsByPerson[101][0].weeklyHours = body.weeklyHours;
      return route.fulfill(jsonResponse(assignmentsByPerson[101][0]));
    }
    return route.fulfill(jsonResponse(assignmentsByPerson[101][0]));
  });

  await page.route('**/api/assignments/**', (route: any) => {
    if (route.request().method() === 'POST') {
      const payload = JSON.parse(route.request().postData() || '{}');
      const newAssignment = {
        id: 999,
        ...payload,
        weeklyHours: payload.weeklyHours || {},
        projectDisplayName: 'Switch Fiber Upgrade',
      };
      assignmentsByPerson[payload.person] = [...(assignmentsByPerson[payload.person] || []), newAssignment];
      return route.fulfill(jsonResponse(newAssignment, 201));
    }
    return route.continue();
  });

  await page.route('**/api/**', (route: any) => route.fulfill(jsonResponse({})));
}

test.use({
  ...devices['Pixel 5'],
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

test.describe('Assignments grid mobile workflows', () => {

  test('supports touch edit and add flows', async ({ page }) => {
    await primeAuth(page);
    await mockAssignmentsApis(page);
    const navStart = Date.now();
    await page.goto('/assignments');

    const accordionTrigger = page.getByRole('button', { name: /Casey Cooper/ });
    await accordionTrigger.click();

    const assignmentCard = page.getByRole('button', { name: /Acme Tower Expansion/ });
    await assignmentCard.click();
    const editModal = page.getByRole('dialog', { name: /Edit Casey Cooper/i });
    await expect(editModal).toBeVisible();
    await editModal.getByLabel('Nov 24').fill('30');
    await editModal.getByRole('button', { name: 'Save' }).click();
    await expect(editModal).not.toBeVisible();

    const addButton = page.getByRole('button', { name: 'Add Assignment' }).first();
    await addButton.click();
    const addModal = page.getByRole('dialog', { name: /Add Assignment/ });
    await expect(addModal).toBeVisible();
    await addModal.getByLabel('Search projects').fill('Switch');
    await addModal.getByRole('button', { name: /Switch Fiber Upgrade/ }).click();
    await addModal.getByRole('button', { name: 'Add Selected' }).click();
    await expect(addModal).not.toBeVisible();
    await expect(page.getByRole('button', { name: /Switch Fiber Upgrade/ })).toBeVisible();

    const latencyMs = Date.now() - navStart;
    console.log(`assignments-mobile-latency-ms=${latencyMs}`);
  });
});
