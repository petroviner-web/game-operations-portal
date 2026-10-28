import { test, expect } from './project-fixture';
import { randomUUID } from 'node:crypto';

test('create, edit, archive and restore a real project', async ({ page }, testInfo) => {
  // This journey crosses several server-rendered routes, compiled on demand in dev mode.
  test.setTimeout(60000);
  await page.goto('/workspace');
  await expect(page.getByRole('heading', { name: 'Your first world starts here.' })).toBeVisible();
  await page.getByRole('link', { name: 'New project' }).click();
  await expect(page).toHaveURL(/\/projects\/new$/);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('form').getByRole('alert')).toBeFocused();
  await expect(page.getByLabel('Project name')).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Project name').fill('Nebula Quest');
  await page.getByLabel('Game engine', { exact: true }).selectOption('GODOT');
  await page
    .getByLabel('Description', { exact: false })
    .fill('Explore distant worlds.\nBuilt for friends.');
  await page.screenshot({ path: testInfo.outputPath('project-form.png'), fullPage: true });
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nebula Quest.');
  const projectUrl = page.url();
  await page.getByRole('link', { name: 'Edit project' }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(page.getByLabel('Game engine', { exact: true })).toHaveValue('GODOT');
  await page.getByLabel('Project name').fill('Nebula Quest II');
  await page.getByLabel('Description', { exact: false }).fill('A revised game brief.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(projectUrl);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nebula Quest II.');
  await expect(page.getByText('A revised game brief.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Archive project' }).click();
  await expect(page.getByRole('button', { name: 'Restore project' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit project' })).toHaveCount(0);
  await page.getByRole('link', { name: 'All projects' }).click();
  await expect(page).toHaveURL(/state=archived$/);
  await expect(page.getByRole('link', { name: 'Nebula Quest II' })).toBeVisible();
  await page.getByRole('link', { name: 'Active projects', exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByRole('heading', { name: 'Your first world starts here.' })).toBeVisible();
  await page.goto(projectUrl);
  await page.getByRole('button', { name: 'Restore project' }).click();
  await expect(page.getByRole('link', { name: 'Edit project' })).toBeVisible();
  await page.getByRole('link', { name: 'All projects' }).click();
  await expect(page.getByRole('link', { name: 'Nebula Quest II' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('project-list.png'), fullPage: true });
});

test('a stale editor preserves the draft and requires an explicit reload', async ({
  page,
  context,
}) => {
  await page.goto('/workspace/projects/new');
  await page.getByLabel('Project name').fill('Shared draft');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('link', { name: 'Edit project' })).toBeVisible();
  const detailsUrl = page.url();
  await page.goto(`${detailsUrl}/edit`);
  const otherTab = await context.newPage();
  try {
    await otherTab.goto(`${detailsUrl}/edit`);
    await otherTab.getByLabel('Project name').fill('Saved in another tab');
    await otherTab.getByRole('button', { name: 'Save changes' }).click();
    await expect(otherTab.getByRole('heading', { level: 1 })).toHaveText('Saved in another tab.');
    await page.getByLabel('Project name').fill('My unsaved draft');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('form').getByRole('alert')).toBeFocused();
    await expect(page.locator('form').getByRole('alert')).toContainText('changed in another tab');
    await expect(page.getByLabel('Project name')).toHaveValue('My unsaved draft');
    await page.getByRole('link', { name: 'Reload latest version (discard this draft)' }).click();
    await expect(page.getByLabel('Project name')).toHaveValue('Saved in another tab');
  } finally {
    await otherTab.close();
  }
});

test('a failed save preserves input and an invalid project URL has a recovery path', async ({
  page,
}) => {
  await page.goto(`/workspace/projects/${randomUUID()}`);
  await expect(page.getByRole('heading', { name: 'Project not found.' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to projects' }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await page.goto('/workspace/projects/new');
  await page.getByLabel('Project name').fill('Keep this draft');
  await page.route('**/api/v1/projects', (route) => route.abort('connectionrefused'));
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('form').getByRole('alert')).toBeFocused();
  await expect(page.locator('form').getByRole('alert')).toContainText('could not confirm');
  await expect(page.getByLabel('Project name')).toHaveValue('Keep this draft');
  await expect(page.getByRole('button', { name: 'Create project' })).toBeEnabled();
});
