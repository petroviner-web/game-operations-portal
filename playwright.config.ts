import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

const apiPort = Number(process.env.E2E_API_PORT || 4100);
if (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65535 || apiPort === 3100)
  throw new Error('E2E_API_PORT must be a valid port distinct from the web test port 3100.');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 2,
  // First visits compile protected routes in the development server.
  expect: { timeout: 10000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    {
      command: 'npm run build -w @game-ops/api && node scripts/e2e-api.mjs',
      url: `http://127.0.0.1:${apiPort}/api/v1/health/ready`,
      env: { E2E_API_PORT: String(apiPort) },
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: 'npm run dev -w @game-ops/web -- --port 3100',
      url: 'http://127.0.0.1:3100',
      env: { API_ORIGIN: `http://127.0.0.1:${apiPort}`, NEXT_DIST_DIR: '.next-e2e' },
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
