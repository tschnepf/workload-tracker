import { test, expect } from '@playwright/test';
import { primeAuth, jsonResponse } from './utils';

const departmentsSnapshotPayload = {
  contractVersion: 1,
  included: ['departments', 'people'],
  departments: {
    count: 2,
    next: null,
    previous: null,
    results: [
      {
        id: 1,
        name: 'Electrical',
        parentDepartment: null,
        manager: null,
        managerName: null,
        secondaryManagers: [],
        secondaryManagerNames: [],
        isActive: true,
      },
      {
        id: 2,
        name: 'Mechanical',
        parentDepartment: null,
        manager: null,
        managerName: null,
        secondaryManagers: [],
        secondaryManagerNames: [],
        isActive: true,
      },
    ],
  },
  people: {
    count: 2,
    next: null,
    previous: null,
    results: [
      { id: 201, name: 'Alex Manager', department: 1, weeklyCapacity: 40, roleName: 'Engineer' },
      { id: 202, name: 'Casey Member', department: 1, weeklyCapacity: 36, roleName: 'Designer' },
    ],
  },
};

test.describe('Reporting groups org chart workspace', () => {
  test('supports group creation and layout save', async ({ page }) => {
    await primeAuth(page);

    let layoutSaveCalls = 0;
    const workspace = {
      featureEnabled: true,
      canEdit: true,
      workspaceVersion: 3,
      departmentCard: { x: 16, y: 24 },
      groups: [
        {
          id: 1,
          name: 'Power Delivery',
          managerId: null as number | null,
          card: { x: 64, y: 240 },
          memberIds: [] as number[],
          sortOrder: 10,
          updatedAt: new Date().toISOString(),
        },
      ],
      people: [
        { id: 201, name: 'Alex Manager', roleName: 'Engineer', departmentId: 1 },
        { id: 202, name: 'Casey Member', roleName: 'Designer', departmentId: 1 },
      ],
      unassignedPersonIds: [201, 202],
    };

    const recomputeUnassigned = () => {
      const managerIds = new Set<number>();
      const memberIds = new Set<number>();
      for (const group of workspace.groups) {
        if (group.managerId != null) managerIds.add(group.managerId);
        for (const memberId of group.memberIds) memberIds.add(memberId);
      }
      workspace.unassignedPersonIds = workspace.people
        .map((person) => person.id)
        .filter((id) => !managerIds.has(id) && !memberIds.has(id));
    };

    await page.route('**/api/capabilities/**', (route) =>
      route.fulfill(jsonResponse({
        asyncJobs: false,
        aggregates: {},
        cache: { shortTtlAggregates: false, aggregateTtlSeconds: 30 },
        integrations: { enabled: false },
        personalDashboard: true,
        features: { reportingGroupsEnabled: true },
      })),
    );

    await page.route('**/api/departments/snapshot/**', (route) =>
      route.fulfill(jsonResponse(departmentsSnapshotPayload)),
    );

    await page.route('**/api/departments/1/org-chart-workspace/**', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill(jsonResponse(workspace));
      }
      return route.continue();
    });

    await page.route('**/api/departments/1/reporting-groups/**', async (route) => {
      const url = new URL(route.request().url());
      const method = route.request().method();
      if (method === 'POST' && url.pathname.endsWith('/reporting-groups/')) {
        const nextId = (workspace.groups.reduce((max, item) => Math.max(max, item.id), 0) || 0) + 1;
        const nextGroup = {
          id: nextId,
          name: 'New Reporting Group',
          managerId: null,
          card: { x: 360, y: 240 },
          memberIds: [],
          sortOrder: nextId * 10,
          updatedAt: new Date().toISOString(),
        };
        workspace.groups.push(nextGroup);
        workspace.workspaceVersion += 1;
        recomputeUnassigned();
        return route.fulfill(jsonResponse({ group: nextGroup, workspaceVersion: workspace.workspaceVersion }, 201));
      }
      if (method === 'PUT' && url.pathname.endsWith('/reporting-groups/layout/')) {
        layoutSaveCalls += 1;
        const body = route.request().postDataJSON() as {
          workspaceVersion: number;
          departmentCard: { x: number; y: number };
          groups: Array<{ id: number; x: number; y: number; managerId?: number | null; memberIds?: number[]; sortOrder?: number }>;
        };
        workspace.departmentCard = { x: body.departmentCard.x, y: body.departmentCard.y };
        workspace.groups = workspace.groups.map((group) => {
          const incoming = body.groups.find((item) => item.id === group.id);
          if (!incoming) return group;
          return {
            ...group,
            managerId: incoming.managerId ?? null,
            card: { x: incoming.x, y: incoming.y },
            memberIds: incoming.memberIds || [],
            sortOrder: incoming.sortOrder ?? group.sortOrder,
            updatedAt: new Date().toISOString(),
          };
        });
        workspace.workspaceVersion += 1;
        recomputeUnassigned();
        return route.fulfill(jsonResponse(workspace));
      }
      return route.continue();
    });

    await page.goto('/departments/hierarchy');
    await expect(page.getByText('Department Hierarchy')).toBeVisible();
    await page.getByText('Electrical').first().click();

    await expect(page.getByText('Reporting Groups Workspace')).toBeVisible();
    await page.getByRole('button', { name: 'Add Group' }).click();
    await expect(page.getByTestId('rg-group-2')).toBeVisible();

    const managerDrop = page.getByTestId('rg-manager-drop-2');
    await expect(managerDrop).toContainText('Drop a person here');

    await page.getByRole('button', { name: 'Auto-layout' }).click();

    await expect.poll(() => layoutSaveCalls, { timeout: 5000 }).toBeGreaterThan(0);
  });
});
