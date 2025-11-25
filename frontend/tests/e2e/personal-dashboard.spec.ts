import { test, expect } from '@playwright/test';

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
    overduePreItems: 2,
  },
  projects: [
    { id: 1, name: 'Atlas', client_name: 'ACME', active_assignments: 2, status: 'active' },
    { id: 2, name: 'Nova', client_name: 'Globex', active_assignments: 1, status: 'planning' },
  ],
  deliverables: [
    { id: 10, project_name: 'Atlas', description: 'Design Handoff', due_date: '2025-11-22' },
    { id: 11, project_name: 'Nova', description: 'Kickoff Prep', due_date: '2025-11-25' },
  ],
  schedule: {
    weekKeys: ['2025-11-17', '2025-11-24', '2025-12-01'],
    weeklyCapacity: 40,
    weekTotals: { '2025-11-17': 34, '2025-11-24': 28, '2025-12-01': 12 },
  },
};

const jsonResponse = (body: unknown, status = 200) => ({
  status,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

async function mockPersonalApis(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('auth.refreshToken', 'test-refresh-token');
    window.localStorage.setItem('flags.MOBILE_UI_MYWORK', 'true');
  });

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
  await page.route('**/api/personal/work/**', (route) =>
    route.fulfill(jsonResponse(personalPayload))
  );
  await page.route('**/api/**', (route) => route.fulfill(jsonResponse({})));
}

test.describe('Personal Dashboard responsive', () => {
  test('mobile view at 390px', async ({ page }) => {
    await mockPersonalApis(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/personal');
    await expect(page.getByRole('heading', { name: 'My Summary' })).toBeVisible();
    await expect(page.getByLabelText(/My work widgets/i)).toBeVisible();
    await expect(page).toHaveScreenshot('personal-dashboard-390.png', { fullPage: true });
  });
});
