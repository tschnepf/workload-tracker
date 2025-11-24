import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { label: 'mobile-360', size: { width: 360, height: 780 }, expectCarousel: true },
  { label: 'mobile-414', size: { width: 414, height: 820 }, expectCarousel: true },
  { label: 'tablet-768', size: { width: 768, height: 1024 }, expectCarousel: true },
  { label: 'desktop-1024', size: { width: 1024, height: 900 }, expectCarousel: false },
] as const;

const dashboardPayload = {
  summary: {
    total_people: 12,
    avg_utilization: 78,
    peak_utilization: 96,
    peak_person: 'Jordan Lee',
    total_assignments: 24,
    overallocated_count: 2,
  },
  utilization_distribution: {
    underutilized: 1,
    optimal: 7,
    high: 3,
    overallocated: 1,
  },
  team_overview: [
    {
      id: 1,
      name: 'Jordan Lee',
      role: 'Design Lead',
      utilization_percent: 82,
      allocated_hours: 33,
      capacity: 40,
      is_overallocated: false,
      peak_utilization_percent: 96,
      peak_week: '2025-01-13',
      is_peak_overallocated: true,
    },
    {
      id: 2,
      name: 'Devon Patel',
      role: 'Engineer',
      utilization_percent: 65,
      allocated_hours: 26,
      capacity: 40,
      is_overallocated: false,
      peak_utilization_percent: 70,
      peak_week: '2025-01-20',
      is_peak_overallocated: false,
    },
  ],
  available_people: [],
  recent_assignments: [
    { person: 'Jordan Lee', project: 'Atlas', created: '2025-01-08T12:00:00Z' },
  ],
};

const heatmapPayload = [
  {
    id: 1,
    name: 'Jordan Lee',
    weeklyCapacity: 40,
    department: 'Design',
    weekKeys: ['2025-01-06', '2025-01-13', '2025-01-20'],
    weekTotals: { '2025-01-06': 32, '2025-01-13': 38, '2025-01-20': 30 },
    availableByWeek: { '2025-01-06': 8, '2025-01-13': 2, '2025-01-20': 10 },
    peak: { weekKey: '2025-01-13', percentage: 95 },
    averagePercentage: 80,
  },
  {
    id: 2,
    name: 'Devon Patel',
    weeklyCapacity: 40,
    department: 'Engineering',
    weekKeys: ['2025-01-06', '2025-01-13', '2025-01-20'],
    weekTotals: { '2025-01-06': 20, '2025-01-13': 24, '2025-01-20': 18 },
    availableByWeek: { '2025-01-06': 20, '2025-01-13': 16, '2025-01-20': 22 },
    peak: { weekKey: '2025-01-13', percentage: 60 },
    averagePercentage: 55,
  },
];

const peopleListPayload = [
  {
    id: 1,
    name: 'Jordan Lee',
    department: 1,
    departmentName: 'Design',
    isActive: true,
    hireDate: '2023-01-01',
    role: 11,
    roleName: 'Design Lead',
  },
  {
    id: 2,
    name: 'Devon Patel',
    department: 2,
    departmentName: 'Engineering',
    isActive: true,
    hireDate: '2022-06-01',
    role: 12,
    roleName: 'Engineer',
  },
];

const projectsPayload = [
  { id: 1, name: 'Atlas', status: 'active', client: 'Acme' },
  { id: 2, name: 'Nova', status: 'planning', client: 'Globex' },
];

const jsonResponse = (body: unknown, status = 200) => ({
  status,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

async function mockDashboardApis(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('auth.refreshToken', 'test-refresh-token');
    window.localStorage.setItem('flags.MOBILE_UI_DASHBOARD', 'true');
  });

  await page.route('**/api/token/refresh/**', (route) =>
    route.fulfill(jsonResponse({ access: 'test-access-token' }))
  );
  await page.route('**/api/auth/me/**', (route) =>
    route.fulfill(
      jsonResponse({
        user: { id: 1, username: 'test', email: 'test@example.com', is_staff: true },
        person: { id: 1, name: 'Jordan Lee', department: 1 },
        settings: {},
      })
    )
  );
  await page.route('**/api/dashboard/**', (route) =>
    route.fulfill(jsonResponse(dashboardPayload))
  );
  await page.route('**/api/projects/**', (route) => {
    const url = route.request().url();
    if (url.includes('all=true')) {
      return route.fulfill(jsonResponse(projectsPayload));
    }
    return route.fulfill(jsonResponse({ results: projectsPayload, count: projectsPayload.length }));
  });
  await page.route('**/api/people/capacity_heatmap/**', (route) =>
    route.fulfill(jsonResponse(heatmapPayload))
  );
  await page.route('**/api/people/**', (route) => {
    const url = route.request().url();
    if (url.includes('all=true')) {
      return route.fulfill(jsonResponse(peopleListPayload));
    }
    return route.fulfill(jsonResponse({ results: peopleListPayload, count: peopleListPayload.length }));
  });
  await page.route('**/api/skills/person-skills/**', (route) =>
    route.fulfill(jsonResponse({ results: [] }))
  );
  await page.route('**/api/deliverables/pre_deliverable_items/**', (route) =>
    route.fulfill(jsonResponse([]))
  );
  await page.route('**/api/**', (route) => route.fulfill(jsonResponse({})));
}

for (const viewport of VIEWPORTS) {
  test(`Dashboard responsive layout at ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize(viewport.size);
    await mockDashboardApis(page);
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: 'Team Dashboard' })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(() => {
      const el = document.scrollingElement || document.documentElement;
      return el.scrollWidth > el.clientWidth + 1;
    });
    expect(hasHorizontalOverflow).toBeFalsy();

    if (viewport.expectCarousel) {
      await expect(page.getByRole('region', { name: 'Analytics overview' })).toBeVisible();
      await page.getByRole('button', { name: /view details/i }).first().click();
      await expect(page.getByRole('dialog', { name: /availability/i })).toBeVisible();
      await page.getByRole('button', { name: 'Close' }).click();
    } else {
      await expect(page.getByRole('region', { name: 'Analytics overview' })).toBeHidden();
      await expect(page.getByRole('columnheader', { name: 'Current Week' })).toBeVisible();
    }
  });
}

