import { test, expect } from './project-fixture';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

test('owner adds and removes an existing developer', async ({ page }) => {
  test.setTimeout(60000);
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl || !new URL(testUrl).pathname.endsWith('_test'))
    throw new Error('Separate test database required.');
  const email = `developer-browser-${randomUUID()}@example.test`;
  const db = new Client({ connectionString: testUrl });
  await db.connect();
  try {
    await db.query('INSERT INTO users (email_normalized,password_hash) VALUES ($1,$2)', [
      email,
      'fixture-no-password-login',
    ]);
    await page.goto('/workspace/projects/new');
    await page.getByLabel('Project name').fill('Team game');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByRole('heading', { name: 'Developers' })).toBeVisible();
    await page.getByLabel('Account email').fill(email);
    await page.getByRole('button', { name: 'Add developer' }).click();
    await expect(page.getByRole('button', { name: `Remove access for ${email}` })).toBeVisible();
    await page.getByRole('button', { name: `Remove access for ${email}` }).click();
    await expect(page.getByText('No developers added yet.')).toBeVisible();
  } finally {
    await db.query('DELETE FROM users WHERE email_normalized=$1', [email]);
    await db.end();
  }
});
