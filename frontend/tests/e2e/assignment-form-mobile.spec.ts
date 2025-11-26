import { test, expect, devices } from '@playwright/test';
import { jsonResponse, primeAuth } from './utils';

const peoplePayload = [
  {
    id: 201,
    name: 'Alex Rivera',
    department: 5,
    weeklyCapacity: 40,
  },
];

const projectsPayload = [
  { id: 701, name: 'Helios Solar Retrofit', client: 'Helios', status: 'active' },
];

const departmentsPayload = {
  results: [
    { id: 5, name: 'Electrical', parentDepartment: null },
    { id: 9, name: 'Mechanical', parentDepartment: null },
  ],
};

const skillTagsPayload = {
  results: [
    { id: 11, name: 'Revit', category: 'software' },
    { id: 12, name: 'BIM', category: 'process' },
  ],
};

const personSkillsPayload = {
  results: [
    { id: 401, person: 201, skillTagName: 'Revit', skillType: 'strength' },
    { id: 402, person: 201, skillTagName: 'BIM', skillType: 'development' },
  ],
};

test.use({
  ...devices['Pixel 5'],
  viewport: { width: 360, height: 780 },
  hasTouch: true,
  isMobile: true,
});

async function mockAssignmentFormApis(page: any, opts?: { failCreate?: boolean; captureBody?: (body: any) => void }) {
  const skillMatchQueries: URLSearchParams[] = [];

  await page.route('**/api/people/?**', (route: any) =>
    route.fulfill(jsonResponse({ results: peoplePayload, count: peoplePayload.length }))
  );

  await page.route('**/api/projects/?**', (route: any) =>
    route.fulfill(jsonResponse({ results: projectsPayload, count: projectsPayload.length }))
  );

  await page.route('**/api/departments/**', (route: any) =>
    route.fulfill(jsonResponse(departmentsPayload))
  );

  await page.route('**/api/skills/skill-tags/**', (route: any) =>
    route.fulfill(jsonResponse(skillTagsPayload))
  );

  await page.route('**/api/skills/person-skills/**', (route: any) =>
    route.fulfill(jsonResponse(personSkillsPayload))
  );

  await page.route('**/api/people/skill_match/**', (route: any) => {
    const url = new URL(route.request().url());
    skillMatchQueries.push(new URLSearchParams(url.search));
    return route.fulfill(
      jsonResponse([
        { personId: 201, name: 'Alex Rivera', score: 92, matchedSkills: ['Revit', 'BIM'], departmentId: 5 },
      ])
    );
  });

  await page.route('**/api/assignments/', async (route: any) => {
    if (route.request().method() === 'POST') {
      const body = JSON.parse(route.request().postData() || '{}');
      opts?.captureBody?.(body);
      if (opts?.failCreate) {
        return route.fulfill(jsonResponse({ message: 'Unable to create assignment' }, 500));
      }
      return route.fulfill(jsonResponse({ id: 9001, ...body }, 201));
    }
    return route.fulfill(jsonResponse({}));
  });

  await page.route('**/api/**', (route: any) => route.fulfill(jsonResponse({})));

  return { skillMatchQueries };
}

async function completeStepperToReview(page: any) {
  await page.getByPlaceholder('Type to search people...').fill('Alex');
  await page.getByText('Alex Rivera', { exact: false }).click();
  await page.getByLabel('Project').selectOption('701');
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByLabel('Required Skills').fill('Revit, BIM');
  await page.getByRole('button', { name: /Next/i }).click();

  await page.getByLabel('Bulk hours per week').fill('10');
  await page.getByRole('button', { name: 'Apply to All' }).click();
  await page.getByRole('button', { name: /Next/i }).click();
}

test.describe('Assignment Form mobile stepper', () => {
  test('validates steps and submits successfully at 360px', async ({ page }) => {
    await primeAuth(page, { 'deptFilter.selectedId': '5' });
    const postedBodies: any[] = [];
    const { skillMatchQueries } = await mockAssignmentFormApis(page, {
      captureBody: (body) => postedBodies.push(body),
    });

    await page.goto('/assignments/new');

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Please select a person')).toBeVisible();
    await expect(page.getByText('Please select a project')).toBeVisible();

    await completeStepperToReview(page);

    expect(skillMatchQueries.length).toBeGreaterThan(0);
    expect(skillMatchQueries[skillMatchQueries.length - 1].get('skills')).toBe('Revit,BIM');

    await page.getByRole('button', { name: 'Create Assignment' }).click();
    await expect(page).toHaveURL(/\/assignments$/);

    expect(postedBodies).toHaveLength(1);
    const submitted = postedBodies[0];
    expect(submitted.person).toBe(201);
    expect(submitted.project).toBe(701);
    expect(Object.keys(submitted.weeklyHours || {})).toHaveLength(12);
    Object.values(submitted.weeklyHours || {}).forEach((value: any) => {
      expect(value).toBe(10);
    });
  });

  test('surfaces backend errors in review step', async ({ page }) => {
    await primeAuth(page);
    await mockAssignmentFormApis(page, { failCreate: true });

    await page.goto('/assignments/new');
    await completeStepperToReview(page);

    await page.getByRole('button', { name: 'Create Assignment' }).click();
    await expect(page.getByText('Unable to create assignment')).toBeVisible();
    await expect(page).toHaveURL(/\/assignments\/new$/);
  });
});
