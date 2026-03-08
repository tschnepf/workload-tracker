import { test, expect } from '@playwright/test';
import { jsonResponse, primeAuth } from './utils';

const bootstrapPayload = {
  defaults: {
    monthsDefault: 6,
    monthsMin: 1,
    monthsMax: 24,
    includeInactiveDefault: false,
    checkinPeriodMonthsDefault: 6,
  },
  departments: [
    { id: 10, name: 'Engineering', peopleCount: 2 },
    { id: 20, name: 'Design', peopleCount: 1 },
  ],
  skillTags: [
    { id: 500, name: 'Lighting Design', departmentId: 20 },
    { id: 501, name: 'Client Facilitation', departmentId: null },
  ],
};

const peoplePayload = {
  people: [
    { id: 1, name: 'Jordan Lee', departmentId: 10, isActive: true, roleName: 'Designer' },
    { id: 2, name: 'Jordan Miles', departmentId: 10, isActive: true, roleName: 'Project Engineer' },
  ],
  count: 2,
};

const profilePayload = {
  window: { start: '2025-09-01', end: '2026-03-01', months: 6 },
  person: {
    id: 1,
    name: 'Jordan Lee',
    departmentId: 10,
    departmentName: 'Engineering',
    roleName: 'Designer',
    isActive: true,
  },
  summary: {
    projectsWorked: 2,
    totalHours: 320,
    activeWeeks: 10,
    avgWeeklyHours: 32,
    eventsCount: 3,
  },
  topClients: [{ client: 'Stack', totalHours: 320, projectCount: 2, activeWeeks: 10 }],
  roleMix: [{ roleId: 1, roleName: 'Designer', totalHours: 320, activeWeeks: 10 }],
  projects: [
    {
      projectId: 101,
      projectName: 'Atlas HQ',
      client: 'Stack',
      startDate: '2025-08-15',
      endDate: '2026-06-30',
      totalHours: 320,
      activeWeeks: 10,
      avgWeeklyHours: 32,
      firstWeek: '2025-10-01',
      lastWeek: '2026-02-20',
    },
  ],
  skills: {
    strengths: [{ personSkillId: 1, skillTagId: 300, skillTagName: 'Coordination', skillType: 'strength', proficiencyLevel: 'advanced', updatedAt: '2026-01-01T00:00:00Z' }],
    inProgress: [],
    goals: [{ personSkillId: 2, skillTagId: 500, skillTagName: 'Lighting Design', skillType: 'goals', proficiencyLevel: 'intermediate', updatedAt: '2026-01-01T00:00:00Z' }],
    developedInWindow: [{ personSkillId: 2, skillTagId: 500, skillTagName: 'Lighting Design', skillType: 'goals', proficiencyLevel: 'intermediate', updatedAt: '2026-01-01T00:00:00Z' }],
  },
};

const goalsPayload = {
  goals: [
    {
      id: 901,
      personId: 1,
      title: 'Lead client workshop',
      description: '',
      goalType: 'freeform',
      skillTagId: null,
      skillTagName: null,
      linkedPersonSkillId: null,
      status: 'active',
      targetDate: null,
      closedAt: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ],
};

const checkinsPayload = { checkins: [] };

test.describe('Person Report mobile interactions', () => {
  test('department -> person flow and actions work at 414px', async ({ page }) => {
    await primeAuth(page);

    let createdGoalCount = 0;
    let createdCheckinCount = 0;

    await page.route('**/api/reports/person-report/bootstrap/**', (route) => route.fulfill(jsonResponse(bootstrapPayload)));
    await page.route('**/api/reports/person-report/people/**', (route) => route.fulfill(jsonResponse(peoplePayload)));
    await page.route('**/api/reports/person-report/profile/**', (route) => route.fulfill(jsonResponse(profilePayload)));
    await page.route('**/api/reports/person-report/goals/**', async (route) => {
      if (route.request().method() === 'POST') {
        createdGoalCount += 1;
        return route.fulfill(jsonResponse({ goal: goalsPayload.goals[0] }));
      }
      if (route.request().method() === 'PATCH') {
        return route.fulfill(jsonResponse({ goal: { ...goalsPayload.goals[0], status: 'achieved' } }));
      }
      return route.fulfill(jsonResponse(goalsPayload));
    });
    await page.route('**/api/reports/person-report/checkins/**', async (route) => {
      if (route.request().method() === 'POST') {
        createdCheckinCount += 1;
        return route.fulfill(jsonResponse({
          checkin: {
            id: 1,
            personId: 1,
            periodStart: '2025-09-01',
            periodEnd: '2026-03-01',
            checkinDate: '2026-03-01',
            summary: 'Progressing',
            createdById: 1,
            createdAt: '2026-03-01T00:00:00Z',
            updatedAt: '2026-03-01T00:00:00Z',
            goalSnapshots: [],
          },
        }));
      }
      return route.fulfill(jsonResponse(checkinsPayload));
    });
    await page.route('**/api/**', (route) => route.fulfill(jsonResponse({})));

    await page.setViewportSize({ width: 414, height: 896 });
    await page.goto('/reports/person-report');

    await expect(page.getByRole('heading', { name: 'Person Report' })).toBeVisible();

    await expect(page.getByRole('button', { name: /Engineering/ })).toBeVisible();
    await page.getByRole('button', { name: /Jordan Lee/ }).click();

    await page.getByLabel('Months').fill('12');

    await expect(page.getByText('Top Clients')).toBeVisible();
    await expect(page.getByText('Atlas HQ')).toBeVisible();

    await page.getByPlaceholder('Goal title').fill('Run 6 month check-in');
    await page.getByRole('button', { name: 'Add Freeform Goal' }).click();

    await page.getByRole('button', { name: 'Create Check-in Snapshot' }).click();

    expect(createdGoalCount).toBeGreaterThan(0);
    expect(createdCheckinCount).toBeGreaterThan(0);

    await expect(page).toHaveScreenshot('person-report-414.png', { fullPage: true });
  });
});
