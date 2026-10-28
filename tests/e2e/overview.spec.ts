import { expect, test } from '@playwright/test';

test('reports readiness and supports a fresh check without horizontal overflow', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/api/v1/health/ready', async (route) => {
    calls += 1;
    await route.fulfill({
      json: {
        status: 'ok',
        service: 'game-ops-api',
        checks: { database: 'up' },
        checkedAt: new Date().toISOString(),
      },
    });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your foundation is ready' })).toBeVisible();
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByRole('button', { name: 'Check again' })).toBeEnabled();
  expect(calls).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('link', { name: 'Build roadmap' }).click();
  await expect(page).toHaveURL(/#roadmap$/);
});

test('shows database failure and recovers after retry', async ({ page }) => {
  let ready = false;
  await page.route('**/api/v1/health/ready', async (route) => {
    await route.fulfill({
      status: ready ? 200 : 503,
      json: {
        status: ready ? 'ok' : 'unavailable',
        service: 'game-ops-api',
        checks: { database: ready ? 'up' : 'down' },
        checkedAt: new Date().toISOString(),
      },
    });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your database needs attention' })).toBeVisible();
  ready = true;
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByRole('heading', { name: 'Your foundation is ready' })).toBeVisible();
});

test('handles an unavailable API and keeps keyboard navigation usable', async ({ page }) => {
  await page.route('**/api/v1/health/ready', (route) => route.abort('connectionrefused'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Waiting for your API' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
});
