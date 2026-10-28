import { test, expect } from './project-fixture';
import type { Page } from '@playwright/test';
async function setup(page: Page) {
  const csrf = await page.request.get('/api/v1/auth/csrf');
  const response = await page.request.post('/api/v1/projects', {
    headers: { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': (await csrf.json()).csrfToken },
    data: { name: 'Orbital Arena', engine: 'UNREAL' },
  });
  expect(response.status()).toBe(201);
  const id = (await response.json()).project.id;
  await page.goto(`/workspace/projects/${id}`);
  await page.getByRole('link', { name: 'Multiplayer sessions' }).click();
  await page.getByLabel('Session name').fill('Evening playtest');
  await page.getByLabel('Player capacity').fill('2');
  await page.getByRole('button', { name: 'Create lobby' }).click();
  await expect(page.getByTestId('session-state')).toHaveText('Lobby');
  return id;
}
test('simulate a full session and persist its final state', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  const project = await setup(page);
  await expect(page.getByRole('button', { name: 'Start session' })).toBeDisabled();
  for (const name of ['Nova', 'Orion']) {
    await page.getByLabel('Player name').fill(name);
    await page.getByRole('button', { name: 'Add player' }).click();
    await expect(page.getByRole('button', { name: `Remove ${name}` })).toBeVisible();
  }
  await expect(page.getByTestId('player-count')).toHaveText('2 / 2');
  await expect(page.getByRole('button', { name: 'Add player' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: testInfo.outputPath('session-lobby.png'), fullPage: true });
  const sessionUrl = page.url();
  await page.getByRole('button', { name: 'Start session' }).click();
  await expect(page.getByTestId('session-state')).toHaveText('Running');
  await expect(page.getByLabel('Player name')).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove Nova' }).click();
  await expect(page.getByTestId('player-count')).toHaveText('1 / 2');
  await expect(page.getByRole('button', { name: 'Refresh session' })).toBeFocused();
  await page.reload();
  await expect(page.getByTestId('session-state')).toHaveText('Running');
  await page.getByRole('button', { name: 'End session' }).click();
  await expect(page.getByTestId('session-state')).toHaveText('Ended');
  await expect(page.getByTestId('player-count')).toHaveText('0 / 2');
  await page.reload();
  await expect(page.getByTestId('session-state')).toHaveText('Ended');
  await page.goto(`/workspace/projects/${project}`);
  await page.getByRole('button', { name: 'Archive project' }).click();
  await expect(page.getByRole('button', { name: 'Restore project' })).toBeVisible();
  await page.goto(sessionUrl);
  await expect(page.getByText('This project is archived.', { exact: false })).toBeVisible();
});
test('a committed join with a lost response can be retried without adding another player', async ({
  page,
}) => {
  test.setTimeout(60000);
  await setup(page);
  let loseResponse = true;
  await page.route('**/sessions/*/players', async (route) => {
    if (!loseResponse) return route.continue();
    loseResponse = false;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort('failed');
  });
  await page.getByLabel('Player name').fill('Retry pilot');
  await page.getByRole('button', { name: 'Add player' }).click();
  await expect(
    page.getByRole('region', { name: 'Session simulator' }).getByRole('alert'),
  ).toBeFocused();
  await expect(page.getByLabel('Player name')).toHaveValue('Retry pilot');
  await page.getByRole('button', { name: 'Add player' }).click();
  await expect(page.getByTestId('player-count')).toHaveText('1 / 2');
  await expect(page.getByRole('button', { name: 'Remove Retry pilot' })).toHaveCount(1);
});
test('an open lobby blocks archival and cancellation provides a way to close it', async ({
  page,
}) => {
  test.setTimeout(60000);
  const project = await setup(page);
  const sessionUrl = page.url();
  await page.goto(`/workspace/projects/${project}`);
  await page.getByRole('button', { name: 'Archive project' }).click();
  await expect(
    page.getByRole('region', { name: 'Taking a break?' }).getByRole('alert'),
  ).toContainText('cancel open lobbies');
  await page.goto(sessionUrl);
  await page.getByRole('button', { name: 'Cancel lobby' }).click();
  await expect(page.getByTestId('session-state')).toHaveText('Cancelled');
  await page.reload();
  await expect(page.getByTestId('session-state')).toHaveText('Cancelled');
  await expect(page.getByRole('button', { name: 'Start session' })).toHaveCount(0);
  await page.goto(`/workspace/projects/${project}`);
  await page.getByRole('button', { name: 'Archive project' }).click();
  await expect(page.getByRole('button', { name: 'Restore project' })).toBeVisible();
});
