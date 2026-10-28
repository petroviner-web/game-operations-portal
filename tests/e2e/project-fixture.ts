import { test as base, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

export const test = base.extend<{ projectAccount: string }>({
  projectAccount: [
    async ({ page }, use) => {
      const url = process.env.TEST_DATABASE_URL;
      if (!url || !new URL(url).pathname.endsWith('_test'))
        throw new Error('Separate test database required.');
      const email = `project-browser-${randomUUID()}@example.test`;
      const csrf = await page.request.get('/api/v1/auth/csrf');
      const response = await page.request.post('/api/v1/auth/register', {
        headers: { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': (await csrf.json()).csrfToken },
        data: { email, password: 'Project browser test passphrase' },
      });
      expect(response.status()).toBe(201);
      try {
        await use(email);
      } finally {
        const db = new Client({ connectionString: url });
        await db.connect();
        try {
          await db.query('DELETE FROM users WHERE email_normalized=$1', [email]);
        } finally {
          await db.end();
        }
      }
    },
    { auto: true },
  ],
});

export { expect };
