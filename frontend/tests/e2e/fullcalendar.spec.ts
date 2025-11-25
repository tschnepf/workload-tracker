import { test, expect } from '@playwright/test';

const deliverablesCalendarPayload = [
  {
    id: 501,
    itemType: 'deliverable',
    title: 'Specification TOC',
    date: '2025-12-01',
    project: 11,
    projectName: 'Stack HQ',
    projectClient: 'Stack',
    isCompleted: false,
    isOverdue: false,
  },
  {
    id: 777,
    itemType: 'pre_deliverable',
    title: 'Model Delivery',
    date: '2025-12-02',
    parentDeliverableId: 501,
    project: 11,
    projectName: 'Stack HQ',
    projectClient: 'Stack',
    preDeliverableType: 'Precheck',
    isCompleted: false,
    isOverdue: false,
  },
];

const personalPayload = {
  summary: {
    personId: 42,
    currentWeekKey: '2025-W48',
    utilizationPercent: 78,
    allocatedHours: 32,
    availableHours: 8,
  },
  alerts: {
    overallocatedNextWeek: true,
    underutilizedNext4Weeks: false,
    overduePreItems: 1,
  },
  projects: [
    { id: 1, name: 'Atlas', client_name: 'Stack', active_assignments: 2, status: 'active' },
  ],
  deliverables: [
    { id: 10, project_name: 'Atlas', description: 'Design Handoff', due_date: '2025-11-25' },
  ],
  schedule: {
    weekKeys: ['2025-11-17', '2025-11-24', '2025-12-01'],
    weeklyCapacity: 40,
    weekTotals: { '2025-11-17': 34, '2025-11-24': 28, '2025-12-01': 12 },
  },
};

const dashboardPayload = {
  summary: {
    total_people: 12,
    avg_utilization: 75,
    peak_utilization: 96,
    peak_person: 'Jordan Lee',
    total_assignments: 24,
    overallocated_count: 2,
  },
  utilization_distribution: {
    underutilized: 2,
    optimal: 7,
    high: 2,
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
  ],
  available_people: [],
  recent_assignments: [],
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
];

const projectsPayload = [
  { id: 1, name: 'Atlas', status: 'active', client: 'Stack' },
  { id: 2, name: 'Switch', status: 'planning', client: 'ADC' },
];

const jsonResponse = (body: unknown, status = 200) => ({
  status,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

async function primeAuth(page: any, flags: Record<string, string> = {}) {
  await page.addInitScript((map) => {
    window.localStorage.setItem('auth.refreshToken', 'test-refresh-token');
    for (const [key, value] of Object.entries(map)) {
      window.localStorage.setItem(key, value);
    }
  }, flags);

  await page.route('**/api/token/refresh/**', (route) =>
    route.fulfill(jsonResponse({ access: 'test-access-token' }))
  );
  await page.route('**/api/auth/me/**', (route) =>
    route.fulfill(
      jsonResponse({
        user: { id: 1, username: 'test', email: 'test@example.com', is_staff: true },
        person: { id: 42, name: 'Jordan Lee', department: 1 },
        settings: {},
      })
    )
  );
}

async function mockDeliverablesCalendar(page: any) {
  await page.route('**/api/deliverables/calendar_with_pre_items/**', (route) =>
    route.fulfill(jsonResponse(deliverablesCalendarPayload))
  );
  await page.route('**/api/deliverables/pre_deliverable_items/**', (route) =>
    route.fulfill(jsonResponse([]))
  );
  await page.route('**/api/deliverables/assignments/**', (route) =>
    route.fulfill(jsonResponse([]))
  );
}

test.describe('FullCalendar responsive snapshots', () => {
  test('My Work calendar renders list view at 390px', async ({ page }) => {
    await primeAuth(page, { 'flags.MOBILE_UI_MYWORK': 'true' });
    await mockDeliverablesCalendar(page);
    await page.route('**/api/personal/work/**', (route) => route.fulfill(jsonResponse(personalPayload)));
    await page.route('**/api/**', (route) => route.fulfill(jsonResponse({}))); // fallback

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/personal');
    await expect(page.getByText('My Calendar')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'My Summary' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'My Schedule' })).toBeVisible();
    await expect(page.getByText('Specification TOC')).toBeVisible();
    await expect(page).toHaveScreenshot('fullcalendar-personal-390.png', { fullPage: true });
  });

  test('Deliverables calendar multi-week view at 768px', async ({ page }) => {
    await primeAuth(page);
    await mockDeliverablesCalendar(page);
    await page.route('**/api/people/**', (route) => route.fulfill(jsonResponse({ results: [], count: 0 })));
    await page.route('**/api/projects/**', (route) => route.fulfill(jsonResponse({ results: projectsPayload, count: projectsPayload.length })));
    await page.route('**/api/**', (route) => route.fulfill(jsonResponse({})));

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/deliverables/calendar');
    await expect(page.getByRole('heading', { name: /Deliverables Calendar/i })).toBeVisible();
    await expect(page.getByText('Specification TOC')).toBeVisible();
    await page.getByLabelText('Show Pre-Deliverables').uncheck();
    await expect(page.getByText('Model Delivery')).not.toBeVisible();
    await page.getByLabelText('Show Pre-Deliverables').check();
    await expect(page).toHaveScreenshot('fullcalendar-deliverables-768.png', { fullPage: true });
  });

  test('Dashboard timeline calendar at 1280px', async ({ page }) => {
    await primeAuth(page, { 'flags.MOBILE_UI_DASHBOARD': 'true' });
    await mockDeliverablesCalendar(page);
    await page.route('**/api/dashboard/**', (route) => route.fulfill(jsonResponse(dashboardPayload)));
    await page.route('**/api/projects/**', (route) => {
      const url = route.request().url();
      if (url.includes('all=true')) {
        return route.fulfill(jsonResponse(projectsPayload));
      }
      return route.fulfill(jsonResponse({ results: projectsPayload, count: projectsPayload.length }));
    });
    await page.route('**/api/people/capacity_heatmap/**', (route) => route.fulfill(jsonResponse(heatmapPayload)));
    await page.route('**/api/people/**', (route) => route.fulfill(jsonResponse({ results: peopleListPayload, count: peopleListPayload.length })));
    await page.route('**/api/skills/person-skills/**', (route) => route.fulfill(jsonResponse({ results: [] })));
    await page.route('**/api/**', (route) => route.fulfill(jsonResponse({})));

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Capacity & Deliverables Timeline' })).toBeVisible();
    await expect(page.getByText('Specification TOC')).toBeVisible();
    await expect(page).toHaveScreenshot('fullcalendar-dashboard-1280.png', { fullPage: true });
  });
});
