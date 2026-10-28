import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { fork, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { createServer as createTcpServer } from 'node:net';
import { createServer } from 'node:https';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
import pg from 'pg';

const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'https://127.0.0.1:3443';

test(
  'production HTTPS journey: secure cookies, CSRF, projects, sessions, analytics, logout',
  { timeout: 120000 },
  async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test'))
      throw new Error('TEST_DATABASE_URL must name a separate database ending in _test.');
    if (process.env.DATABASE_URL) {
      const live = new URL(process.env.DATABASE_URL);
      const testDb = new URL(databaseUrl);
      assert.notEqual(live.host + live.pathname, testDb.host + testDb.pathname);
    }
    // Never reuse or stop an existing developer server.
    for (const port of [3300, 3443, 4300]) {
      const probe = createTcpServer();
      await new Promise((resolve, reject) =>
        probe.once('error', reject).listen(port, '127.0.0.1', resolve),
      );
      await new Promise((resolve) => probe.close(resolve));
    }
    await mkdir(path.join(root, '.local'), { recursive: true });
    const certDir = await mkdtemp(path.join(root, '.local/release-tls-'));
    const gitOpenSsl = 'C:/Program Files/Git/usr/bin/openssl.exe';
    const openssl = process.env.OPENSSL_PATH || (existsSync(gitOpenSsl) ? gitOpenSsl : 'openssl');
    const generated = spawnSync(
      openssl,
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-keyout',
        path.join(certDir, 'key.pem'),
        '-out',
        path.join(certDir, 'cert.pem'),
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost,IP:127.0.0.1',
      ],
      { stdio: 'ignore', timeout: 15000 },
    );
    assert.equal(generated.status, 0, 'OpenSSL is required (or set OPENSSL_PATH).');
    const proxy = createServer(
      {
        key: await readFile(path.join(certDir, 'key.pem')),
        cert: await readFile(path.join(certDir, 'cert.pem')),
      },
      (incoming, outgoing) => {
        const upstream = request(
          {
            hostname: '127.0.0.1',
            port: 3300,
            path: incoming.url,
            method: incoming.method,
            headers: {
              ...incoming.headers,
              'x-forwarded-proto': 'https',
              'x-forwarded-host': incoming.headers.host,
            },
          },
          (response) => {
            outgoing.writeHead(response.statusCode, response.headers);
            response.pipe(outgoing);
          },
        );
        upstream.on('error', () => {
          if (outgoing.destroyed) return;
          if (outgoing.headersSent) outgoing.destroy();
          else {
            outgoing.writeHead(502);
            outgoing.end();
          }
        });
        outgoing.on('close', () => upstream.destroy());
        incoming.pipe(upstream);
      },
    );
    const child = fork(path.join(root, 'scripts/start-release.mjs'), [], {
      cwd: root,
      execArgv: [],
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        APP_ORIGIN: origin,
        CSRF_SECRET: randomBytes(32).toString('hex'),
        PORT: '3300',
        API_PORT: '4300',
        API_ORIGIN: 'http://127.0.0.1:4300',
        WEB_HOST: '127.0.0.1',
        NEXT_DIST_DIR: '.next-release-test',
      },
    });
    let closed = false;
    const finished = new Promise((resolve) =>
      child.once('close', (code) => {
        closed = true;
        resolve(code);
      }),
    );
    let browser;
    const email = `release-${randomUUID()}@example.test`;
    const password = 'Production release test passphrase';
    try {
      await new Promise((resolve, reject) =>
        proxy.once('error', reject).listen(3443, '127.0.0.1', resolve),
      );
      let ready = false;
      for (let attempt = 0; attempt < 60 && !closed; attempt++) {
        try {
          const response = await fetch('http://127.0.0.1:3300/api/v1/health/ready', {
            signal: AbortSignal.timeout(1500),
          });
          await response.arrayBuffer();
          if (response.status === 200) {
            ready = true;
            break;
          }
        } catch {
          /* Startup is expected to take a few seconds. */
        }
        await delay(500);
      }
      assert.ok(ready, 'Production servers must become ready.');
      browser = await chromium.launch();
      // Only this local test context trusts its ephemeral self-signed certificate.
      const context = await browser.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      await page.goto('/register');
      await page.getByLabel('Email address').fill(email);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Create account' }).click();
      await expect(page.getByTestId('account-email')).toHaveText(email);
      const session = (await context.cookies()).find(
        (cookie) => cookie.name === '__Host-gameops_session',
      );
      assert.ok(
        session?.secure && session.httpOnly && session.path === '/' && session.sameSite === 'Lax',
      );
      assert.ok(!(await page.evaluate(() => document.cookie)).includes('gameops_session'));
      const csrf = await (await page.request.get('/api/v1/auth/csrf')).json();
      const denied = await page.request.post('/api/v1/projects', {
        headers: { Origin: 'https://other.example', 'X-CSRF-Token': csrf.csrfToken },
        data: { name: 'Must not exist', engine: 'UNREAL' },
      });
      assert.equal(denied.status(), 403);
      await page.getByRole('button', { name: 'Sign out' }).click();
      await expect(page).toHaveURL(/\/login$/);
      await page.getByLabel('Email address').fill(email);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page.getByTestId('account-email')).toHaveText(email);
      await page.getByRole('link', { name: 'New project' }).click();
      await page.getByLabel('Project name').fill('Release Arena');
      await page.getByRole('button', { name: 'Create project' }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Release Arena.');
      const projectUrl = page.url();
      await page.getByRole('link', { name: 'Multiplayer sessions' }).click();
      await page.getByLabel('Session name').fill('HTTPS playtest');
      await page.getByLabel('Player capacity').fill('2');
      await page.getByRole('button', { name: 'Create lobby' }).click();
      await expect(page.getByTestId('session-state')).toHaveText('Lobby');
      for (const name of ['Nova', 'Orion']) {
        await page.getByLabel('Player name').fill(name);
        await page.getByRole('button', { name: 'Add player' }).click();
        await expect(page.getByRole('button', { name: `Remove ${name}` })).toBeVisible();
      }
      await page.getByRole('button', { name: 'Start session' }).click();
      await expect(page.getByTestId('session-state')).toHaveText('Running');
      await page.getByRole('button', { name: 'End session' }).click();
      await expect(page.getByTestId('session-state')).toHaveText('Ended');
      await page.goto(`${projectUrl}/analytics`);
      await expect(page.getByTestId('metric-completed')).toHaveText('1');
      await page.reload();
      await expect(page.getByTestId('metric-started')).toHaveText('1');
      await page.getByRole('button', { name: 'Sign out' }).click();
      await expect(page).toHaveURL(/\/login$/);
      assert.ok(
        !(await context.cookies()).some((cookie) => cookie.name === '__Host-gameops_session'),
      );
      await page.goto(`${projectUrl}/analytics`);
      await expect(page).toHaveURL(/\/login$/);
    } finally {
      await browser?.close();
      proxy.closeAllConnections();
      await new Promise((resolve) => proxy.close(resolve));
      if (!closed && child.connected) child.send('shutdown');
      const watchdog = setTimeout(() => child.kill(), 15000);
      try {
        assert.equal(await finished, 0, 'Release must shut down both servers cleanly.');
      } finally {
        clearTimeout(watchdog);
      }
      const db = new pg.Client({ connectionString: databaseUrl });
      await db.connect();
      try {
        await db.query('DELETE FROM users WHERE email_normalized=$1', [email]);
      } finally {
        await db.end();
      }
    }
  },
);
