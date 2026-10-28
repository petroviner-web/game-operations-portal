import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

test('real account lifecycle persists login and revokes access on logout', async ({ page }) => {
  const email = `browser-${randomUUID()}@example.test`;
  const password = 'A unique browser test passphrase';
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Test database required.');
  try {
    await page.goto('/workspace');
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole('link', { name: 'Create an account' }).click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByRole('heading', { name: 'Create your account.' })).toBeVisible();
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/workspace$/);
    await expect(page.getByTestId('account-email')).toHaveText(email);
    await page.reload();
    await expect(page.getByTestId('account-email')).toHaveText(email);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/workspace');
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('wrong password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.locator('form').getByRole('alert')).toBeFocused();
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByTestId('account-email')).toHaveText(email);
    await page.goto('/login');
    await expect(page).toHaveURL(/\/workspace$/);
  } finally {
    const db = new Client({ connectionString: url });
    await db.connect();
    try {
      await db.query('DELETE FROM users WHERE email_normalized=$1', [email]);
    } finally {
      await db.end();
    }
  }
});

test('registration errors are accessible and password visibility is optional', async ({ page }) => {
  await page.goto('/register');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.locator('form').getByRole('alert')).toBeFocused();
  await expect(page.getByLabel('Email address')).toHaveAttribute('aria-invalid', 'true');
  const password = page.getByLabel('Password', { exact: true });
  await password.fill('long visible passphrase');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(password).toHaveAttribute('type', 'password');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
