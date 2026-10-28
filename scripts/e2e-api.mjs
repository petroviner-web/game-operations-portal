import { randomBytes } from 'node:crypto';
import { migrate } from './migrate.mjs';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString || !new URL(connectionString).pathname.endsWith('_test')) {
  throw new Error('Browser tests require TEST_DATABASE_URL ending in _test.');
}
if (process.env.DATABASE_URL) {
  const test = new URL(connectionString);
  const dev = new URL(process.env.DATABASE_URL);
  if (test.host + test.pathname === dev.host + dev.pathname) {
    throw new Error('Browser tests must use a separate database.');
  }
}
Object.assign(process.env, {
  DATABASE_URL: connectionString,
  API_PORT: process.env.E2E_API_PORT || '4100',
  APP_ORIGIN: 'http://127.0.0.1:3100',
  CSRF_SECRET: randomBytes(32).toString('hex'),
  NODE_ENV: 'test',
});
await migrate(connectionString);
await import('../apps/api/dist/main.js');
