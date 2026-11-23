import { test, expect } from './project-fixture';

test('activity records committed changes, filters pages and avoids duplicate transitions', async ({
  page,
}) => {
  const csrf = await page.request.get('/api/v1/auth/csrf');
  const headers = {
    Origin: 'http://127.0.0.1:3100',
    'X-CSRF-Token': (await csrf.json()).csrfToken,
  };
  const created = await page.request.post('/api/v1/projects', {
    headers,
    data: { name: 'Audit test', engine: 'GODOT' },
  });
  const { project } = await created.json();
  const base = `/api/v1/projects/${project.id}`;
  const list = async (query = '') =>
    await (await page.request.get(`${base}/activity${query}`)).json();
  expect((await list()).items.map((x: { action: string }) => x.action)).toEqual([
    'project.created',
  ]);
  const invalid = await page.request.patch(base, {
    headers,
    data: { name: 'Invalid version', version: 99 },
  });
  expect(invalid.status()).toBe(409);
  expect((await list()).items).toHaveLength(1);
  await page.request.patch(base, { headers, data: { name: 'Updated audit test', version: 1 } });
  for (let n = 0; n < 2; n++)
    expect(
      (await page.request.post(`${base}/archive`, { headers, data: { version: 2 } })).ok(),
    ).toBe(true);
  const events = await list();
  expect(events.items.map((x: { action: string }) => x.action)).toEqual([
    'project.archived',
    'project.updated',
    'project.created',
  ]);
  expect(events.items[0].actorEmail).toBeTruthy();
  const first = await list('?limit=2');
  const second = await list(`?limit=2&cursor=${first.nextCursor}`);
  expect(second.items).toHaveLength(1);
  expect(second.nextCursor).toBeNull();
  expect((await list('?action=project.updated')).items).toHaveLength(1);
  expect((await page.request.get(`${base}/activity?action=invalid`)).status()).toBe(400);
  const other = await page.request.post('/api/v1/projects', {
    headers,
    data: { name: 'Other project', engine: 'UNITY' },
  });
  const otherId = (await other.json()).project.id;
  expect(
    (
      await page.request.get(`/api/v1/projects/${otherId}/activity?cursor=${events.items[0].id}`)
    ).status(),
  ).toBe(400);
  await page.goto(`/workspace/projects/${project.id}/activity`);
  await expect(page.getByRole('heading', { name: 'Activity log.' })).toBeVisible();
  await page.getByLabel('Activity type').selectOption('project.updated');
  await page.getByRole('button', { name: 'Apply filter' }).click();
  await expect(page.getByRole('heading', { name: 'Project updated', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Project archived', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
