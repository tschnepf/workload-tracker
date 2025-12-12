import { test, expect } from '@playwright/test';
import { jsonResponse, primeAuth } from './utils';

const autocompletePayload = [
  { id: 1, name: 'Jordan Lee' },
  { id: 2, name: 'Jordan Miles' },
];

const experienceProfilePayload = {
  byClient: [],
  byProject: [
    {
      projectId: 101,
      projectName: 'Atlas HQ',
      client: 'Stack',
      weeks: 10,
      hours: 320,
      roles: {
        '1': { roleId: 1, weeks: 6, hours: 200 },
        '2': { roleId: 2, weeks: 4, hours: 120 },
      },
      phases: {
        SD: { phase: 'SD', weeks: 4, hours: 100 },
        DD: { phase: 'DD', weeks: 3, hours: 100 },
        CD: { phase: 'CD', weeks: 3, hours: 120 },
      },
    },
  ],
  eventsCount: 3,
  roleNamesById: {
    1: 'Designer',
    2: 'Project Engineer',
  },
};

const projectTimelinePayload = {
  weeksSummary: { weeks: 10, hours: 320 },
  coverageBlocks: [],
  events: [],
  roleChanges: [],
  weeklyHours: {
    '2025-06-01': 32,
    '2025-06-08': 36,
    '2025-06-15': 28,
  },
};

test.describe('Person Experience mobile interactions', () => {
  test('autocomplete and interval controls work at 414px', async ({ page }) => {
    await primeAuth(page);

    await page.route('**/api/people/search/**', (route) =>
      route.fulfill(jsonResponse(autocompletePayload))
    );
    await page.route('**/api/assignments/person_experience_profile/**', (route) =>
      route.fulfill(jsonResponse(experienceProfilePayload))
    );
    await page.route('**/api/assignments/person_project_timeline/**', (route) =>
      route.fulfill(jsonResponse(projectTimelinePayload))
    );
    await page.route('**/api/**', (route) => route.fulfill(jsonResponse({})));

    await page.setViewportSize({ width: 414, height: 896 });
    await page.goto('/reports/person-experience');

    await expect(page.getByText('Person Experience Report')).toBeVisible();

    await page.getByLabelText('Search Person').fill('Jordan');

    await expect(page.getByText('Jordan Lee')).toBeVisible();
    await expect(page.getByText('Jordan Miles')).toBeVisible();

    await page.getByRole('button', { name: 'Jordan Lee' }).click();

    await page.getByLabelText('Interval Type').selectOption('years');
    await page.getByLabelText('Interval Count').fill('1');

    await expect(page.getByText(/Window:/)).toBeVisible();

    await expect(page.getByText('Atlas HQ')).toBeVisible();
    await expect(page.getByText('Stack')).toBeVisible();

    await expect(page.getByText('Designer - 6w')).toBeVisible();

    await expect(page.getByText('Weekly hours')).toBeVisible();
    await expect(page.locator('svg[aria-label*="Weekly hours"]').first()).toBeVisible();

    await expect(page).toHaveScreenshot('person-experience-414.png', { fullPage: true });
  });
});

