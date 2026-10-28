import { test, expect } from './project-fixture';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import type { Page } from '@playwright/test';
async function post(page: Page, path: string, body: unknown) {
  const csrf = await page.request.get('/api/v1/auth/csrf');
  const response = await page.request.post(`/api/v1/projects${path}`, {
    headers: { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': (await csrf.json()).csrfToken },
    data: body,
  });
  expect(response.ok()).toBe(true);
  return response.json();
}
async function create(page: Page) {
  return (await post(page, '', { name: 'Orbital Arena', engine: 'UNREAL' })).project.id as string;
}
test('analytics shows exact daily data and date filtering on desktop and mobile', async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const id = await create(page);
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_test'))
    throw new Error('Separate test database required.');
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    for (const [day, count] of [1, 3, 0, 2, 4, 1, 2].entries()) {
      for (let n = 0; n < count; n++)
        await db.query(
          "INSERT INTO game_sessions(project_id,name,max_players,state,created_at,started_at,ended_at,end_reason) VALUES ($1,'Completed playtest',4,'ENDED',$2::timestamptz,$2::timestamptz,$2::timestamptz+interval '10 minutes','COMPLETED')",
          [id, `2026-10-${20 + day}T12:00:00Z`],
        );
    }
    const running = await db.query(
      "INSERT INTO game_sessions(project_id,name,max_players,state,created_at,started_at) VALUES ($1,'Ongoing playtest',4,'RUNNING','2026-10-01T12:00:00Z','2026-10-01T12:00:00Z') RETURNING id",
      [id],
    );
    for (let n = 0; n < 2; n++)
      await db.query(
        "INSERT INTO session_participants(session_id,id,name) VALUES ($1,$2,'Connected test player')",
        [running.rows[0].id, randomUUID()],
      );
  } finally {
    await db.end();
  }
  await page.goto(`/workspace/projects/${id}`);
  await page.getByRole('link', { name: 'View analytics', exact: true }).click();
  await page.getByLabel('From (UTC, included)').fill('2026-10-20');
  await page.getByLabel('Until (UTC, excluded)').fill('2026-10-27');
  await page.getByRole('button', { name: 'Apply dates' }).click();
  await expect(page.getByTestId('metric-created')).toHaveText('13');
  await expect(page.getByTestId('metric-started')).toHaveText('13');
  await expect(page.getByTestId('metric-completed')).toHaveText('13');
  await expect(page.getByTestId('metric-duration')).toHaveText('10m 0s');
  await expect(page.getByTestId('metric-running')).toHaveText('1');
  await expect(page.getByTestId('metric-players')).toHaveText('2');
  const summary = page.locator('summary').filter({ hasText: 'View daily values' });
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: '2026-10-22' })).toHaveText('2026-10-220');
  await expect(page.getByRole('row').filter({ hasText: '2026-10-24' })).toHaveText('2026-10-244');
  await summary.click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: testInfo.outputPath('analytics-dashboard.png'), fullPage: true });
  await page.getByLabel('From (UTC, included)').fill('2026-10-22');
  await page.getByLabel('Until (UTC, excluded)').fill('2026-10-23');
  await page.getByRole('button', { name: 'Apply dates' }).click();
  await expect(page.getByTestId('metric-created')).toHaveText('0');
  await expect(page.getByTestId('metric-duration')).toHaveText('—');
  await expect(page.getByTestId('metric-running')).toHaveText('1');
  await expect(
    page.getByText('No sessions started in this period.', { exact: false }),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const size of [
    { width: 375, height: 812 },
    { width: 812, height: 375 },
  ]) {
    await page.setViewportSize(size);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
test('invalid ranges preserve dates and expose a focused recovery path', async ({ page }) => {
  test.setTimeout(60000);
  const id = await create(page);
  await page.goto(`/workspace/projects/${id}/analytics?from=2026-10-25&to=2026-10-20`);
  await expect(
    page.getByRole('form', { name: 'Analytics date range' }).getByRole('alert'),
  ).toBeFocused();
  await expect(page.getByLabel('From (UTC, included)')).toHaveValue('2026-10-25');
  await expect(page.getByLabel('Until (UTC, excluded)')).toHaveValue('2026-10-20');
  await expect(page.getByTestId('metric-created')).toHaveCount(0);
  await page.getByRole('link', { name: 'Last 7 days' }).click();
  await expect(page.getByTestId('metric-created')).toHaveText('0');
  await expect(page.getByTestId('metric-duration')).toHaveText('—');
  await page.goto(`/workspace/projects/${randomUUID()}/analytics`);
  await expect(page.getByRole('heading', { name: 'Project not found.' })).toBeVisible();
});
test('refresh reflects real session transitions and archived analytics remain readable', async ({
  page,
}) => {
  test.setTimeout(60000);
  const id = await create(page);
  const session = (await post(page, `/${id}/sessions`, { name: 'Live playtest', maxPlayers: 4 }))
    .session;
  const path = `/${id}/sessions/${session.id}`;
  for (const name of ['Nova', 'Orion'])
    await post(page, `${path}/players`, { id: randomUUID(), name });
  await post(page, `${path}/start`, {});
  await page.goto(`/workspace/projects/${id}/analytics`);
  await expect(page.getByTestId('metric-running')).toHaveText('1');
  await expect(page.getByTestId('metric-players')).toHaveText('2');
  await expect(page.getByTestId('metric-completed')).toHaveText('0');
  await post(page, `${path}/end`, {});
  await page.getByRole('link', { name: 'Refresh analytics' }).click();
  await expect(page.getByTestId('metric-running')).toHaveText('0');
  await expect(page.getByTestId('metric-players')).toHaveText('0');
  await expect(page.getByTestId('metric-completed')).toHaveText('1');
  await expect(page.getByTestId('metric-duration')).not.toHaveText('—');
  await post(page, `/${id}/archive`, { version: 1 });
  await page.getByRole('link', { name: 'Refresh analytics' }).click();
  await expect(
    page.getByText('Archived project · historical analytics remain available.'),
  ).toBeVisible();
  await expect(page.getByTestId('metric-completed')).toHaveText('1');
});
