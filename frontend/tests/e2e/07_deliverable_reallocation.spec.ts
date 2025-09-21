import { test, expect } from '@playwright/test';
import { uiLogin } from './helpers/auth';

test('deliverable date change triggers auto-reallocation toast (seeded)', async ({ page }) => {
  // Seed: obtain JWT and create a dedicated project
  const username = process.env.PW_USERNAME || 'admin';
  const password = process.env.PW_PASSWORD || 'admin123';
  const tokenResp = await page.request.post('/api/token/', { data: { username, password } });
  expect(tokenResp.ok()).toBeTruthy();
  const tokens = await tokenResp.json();
  const access = tokens.access as string;
  const headers = { 'Authorization': `Bearer ${access}`, 'Content-Type': 'application/json' };
  const projectName = `E2E Project ${Date.now()}`;
  const projectResp = await page.request.post('/api/projects/', { headers, data: { name: projectName } });
  expect(projectResp.ok()).toBeTruthy();

  // Login via UI
  await uiLogin(page);
  await page.goto('/projects');
  await expect(page.locator('body')).toContainText(/Projects/i);

  // Click the newly created project row by name to reveal Deliverables panel
  await page.getByText(projectName, { exact: false }).first().click();
  // Wait for Deliverables panel to hydrate (add button becomes visible)
  await page.getByTestId('add-deliverable-btn').waitFor({ state: 'visible', timeout: 15000 });

  // Add deliverable via UI using testids
  const addButton = page.getByTestId('add-deliverable-btn');
  await expect(addButton).toBeVisible({ timeout: 10_000 });
  await addButton.click();
  const dt = new Date();
  dt.setDate(dt.getDate() + 7);
  const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  await page.getByTestId('add-deliverable-date').fill(iso);
  await page.getByTestId('save-deliverable-btn').click();
  await expect(page.locator('text=' + iso)).toBeVisible({ timeout: 10_000 });

  // Edit the deliverable date forward by 14 days
  await page.getByRole('button', { name: 'Edit' }).first().click();
  const dt2 = new Date(dt);
  dt2.setDate(dt2.getDate() + 14);
  const iso2 = `${dt2.getFullYear()}-${String(dt2.getMonth() + 1).padStart(2, '0')}-${String(dt2.getDate()).padStart(2, '0')}`;
  await page.locator('input[type="date"]').first().fill(iso2);
  await page.getByRole('button', { name: 'Save' }).click();

  // Expect non-blocking toast containing 'Auto-reallocated hours'
  await expect(page.locator('text=Auto-reallocated hours')).toBeVisible({ timeout: 10_000 });
});
