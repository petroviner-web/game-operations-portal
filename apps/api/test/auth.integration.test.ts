import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { Client } from 'pg';
import { verify } from 'argon2';
import { Controller, Get, Module, Req } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { AuthRequest } from '../src/auth/auth.types';
import { hashToken } from '../src/auth/csrf.service';

@Controller('private-probe')
class ProtectedProbe {
  @Get() get(@Req() request: AuthRequest) {
    return request.user;
  }
}
@Module({ imports: [AppModule], controllers: [ProtectedProbe] })
class TestApp {}

test(
  'authentication lifecycle and security boundaries against real PostgreSQL',
  { timeout: 60000 },
  async (t) => {
    const url = process.env.TEST_DATABASE_URL;
    assert.ok(url, 'TEST_DATABASE_URL is required.');
    const parsed = new URL(url);
    assert.match(parsed.pathname, /_test$/);
    if (process.env.DATABASE_URL) {
      const dev = new URL(process.env.DATABASE_URL);
      assert.notEqual(`${parsed.host}${parsed.pathname}`, `${dev.host}${dev.pathname}`);
    }
    const previous = {
      DATABASE_URL: process.env.DATABASE_URL,
      CSRF_SECRET: process.env.CSRF_SECRET,
      APP_ORIGIN: process.env.APP_ORIGIN,
      NODE_ENV: process.env.NODE_ENV,
    };
    const secret = randomBytes(32).toString('hex');
    Object.assign(process.env, {
      DATABASE_URL: url,
      CSRF_SECRET: secret,
      APP_ORIGIN: 'http://127.0.0.1:3000',
      NODE_ENV: 'test',
    });
    execFileSync(process.execPath, ['scripts/migrate.mjs'], {
      cwd: path.resolve(__dirname, '../../../..'),
      env: process.env,
    });
    const db = new Client({ connectionString: url });
    await db.connect();
    const app = await NestFactory.create(TestApp, { logger: false, bodyParser: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    const emails = [
      `auth-${randomUUID()}@example.test`,
      `missing-${randomUUID()}@example.test`,
      `limit-${randomUUID()}@example.test`,
    ];
    const email = emails[0]!;
    const password = '  an original long passphrase  ';
    const jar = new Map<string, string>();
    function capture(response: globalThis.Response) {
      for (const header of response.headers.getSetCookie()) {
        const pair = header.split(';')[0]!;
        const separator = pair.indexOf('=');
        const name = pair.slice(0, separator);
        const value = pair.slice(separator + 1);
        if (value) jar.set(name, value);
        else jar.delete(name);
      }
    }
    const cookie = () => [...jar].map(([key, value]) => `${key}=${value}`).join('; ');
    async function csrf() {
      const response = await fetch(`${origin}/api/v1/auth/csrf`, { headers: { Cookie: cookie() } });
      assert.equal(response.status, 200);
      capture(response);
      return (await response.json()).csrfToken as string;
    }
    async function post(action: string, body: unknown) {
      const token = await csrf();
      const response = await fetch(`${origin}/api/v1/auth/${action}`, {
        method: 'POST',
        headers: {
          Cookie: cookie(),
          Origin: process.env.APP_ORIGIN!,
          'Content-Type': 'application/json',
          'X-CSRF-Token': token,
        },
        body: JSON.stringify(body),
      });
      capture(response);
      return response;
    }
    const me = (token = jar.get('gameops_session')) =>
      fetch(`${origin}/api/v1/auth/me`, {
        headers: { Cookie: token ? `gameops_session=${token}` : '' },
      });
    try {
      await t.test(
        'anonymous access is denied by default and public health remains available',
        async () => {
          assert.equal((await me()).status, 401);
          assert.equal((await fetch(`${origin}/api/v1/private-probe`)).status, 401);
          assert.equal((await fetch(`${origin}/api/v1/health/live`)).status, 200);
          assert.equal((await fetch(`${origin}/api/v1/health/ready`)).status, 200);
        },
      );
      await t.test(
        'missing CSRF, foreign origin, and missing origin are rejected before credentials',
        async () => {
          const token = await csrf();
          const invalidHeaders: Record<string, string>[] = [
            { Origin: process.env.APP_ORIGIN! },
            { Origin: 'https://evil.example', 'X-CSRF-Token': token },
            { 'X-CSRF-Token': token },
          ];
          for (const headers of invalidHeaders) {
            const response = await fetch(`${origin}/api/v1/auth/login`, {
              method: 'POST',
              headers: { ...headers, Cookie: cookie(), 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password }),
            });
            assert.equal(response.status, 403);
          }
          const crossSite = await fetch(`${origin}/api/v1/auth/csrf`, {
            headers: { Origin: 'https://evil.example' },
          });
          assert.equal(crossSite.status, 403);
        },
      );
      await t.test('runtime validation rejects extra fields and short passwords', async () => {
        const bad = await post('register', { email, password: 'short', role: 'admin' });
        assert.equal(bad.status, 400);
        assert.ok((await bad.json()).fieldErrors.password);
      });
      await t.test('malformed and oversized JSON return safe client errors', async () => {
        for (const [body, status] of [
          ['{', 400],
          [JSON.stringify({ value: 'x'.repeat(9000) }), 413],
        ] as const) {
          const response = await fetch(`${origin}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          });
          assert.equal(response.status, status);
          const result = await response.json();
          assert.equal(result.code, 'INVALID_BODY');
          assert.equal(typeof result.requestId, 'string');
          assert.equal(result.stack, undefined);
        }
      });
      let firstToken: string;
      await t.test(
        'registration hashes credentials and issues a private cookie with no token in JSON',
        async () => {
          const response = await post('register', { email: email.toUpperCase(), password });
          assert.equal(response.status, 201);
          assert.equal(response.headers.get('cache-control'), 'no-store');
          const result = await response.json();
          assert.deepEqual(Object.keys(result), ['user']);
          assert.deepEqual(Object.keys(result.user).sort(), ['createdAt', 'email', 'id']);
          assert.equal(result.user.email, email);
          const setCookie = response.headers
            .getSetCookie()
            .find((value) => value.startsWith('gameops_session='))!;
          assert.match(setCookie, /HttpOnly/);
          assert.match(setCookie, /SameSite=Lax/);
          assert.match(setCookie, /Path=\//);
          firstToken = jar.get('gameops_session')!;
          const stored = await db.query(
            'SELECT u.password_hash, s.token_hash FROM users u JOIN auth_sessions s ON s.user_id=u.id WHERE u.email_normalized=$1',
            [email],
          );
          assert.match(stored.rows[0].password_hash, /^\$argon2id\$/);
          assert.equal(await verify(stored.rows[0].password_hash, password), true);
          assert.equal(stored.rows[0].token_hash, hashToken(firstToken));
          assert.notEqual(stored.rows[0].token_hash, firstToken);
          assert.equal((await me()).status, 200);
          assert.equal(
            (await fetch(`${origin}/api/v1/private-probe`, { headers: { Cookie: cookie() } }))
              .status,
            200,
          );
        },
      );
      await t.test(
        'duplicate registration has no extra user/session and login failures stay generic',
        async () => {
          assert.equal((await post('register', { email, password })).status, 409);
          const wrong = await post('login', { email, password: 'wrong password' });
          const missing = await post('login', { email: emails[1], password });
          assert.equal(wrong.status, 401);
          assert.equal(missing.status, 401);
          assert.equal((await wrong.json()).message, (await missing.json()).message);
          assert.equal(
            (
              await db.query('SELECT count(*)::int AS n FROM users WHERE email_normalized=$1', [
                email,
              ])
            ).rows[0].n,
            1,
          );
        },
      );
      await t.test(
        'successful login rotates the old session and invalidates old CSRF binding',
        async () => {
          const oldCsrf = await csrf();
          assert.equal((await post('login', { email, password })).status, 200);
          assert.notEqual(jar.get('gameops_session'), firstToken);
          assert.equal((await me(firstToken)).status, 401);
          const response = await fetch(`${origin}/api/v1/auth/logout`, {
            method: 'POST',
            headers: {
              Origin: process.env.APP_ORIGIN!,
              Cookie: `gameops_session=${jar.get('gameops_session')}; gameops_csrf=${oldCsrf}`,
              'X-CSRF-Token': oldCsrf,
            },
          });
          assert.equal(response.status, 403);
          assert.equal((await me()).status, 200);
        },
      );
      await t.test('logout revokes the database session and replay is rejected', async () => {
        const token = jar.get('gameops_session')!;
        assert.equal((await post('logout', {})).status, 204);
        assert.equal((await me(token)).status, 401);
        assert.equal(
          (
            await db.query('SELECT count(*)::int AS n FROM auth_sessions WHERE token_hash=$1', [
              hashToken(token),
            ])
          ).rows[0].n,
          0,
        );
        assert.equal((await post('logout', {})).status, 204);
      });
      await t.test('expired and fabricated cookies cannot authenticate', async () => {
        assert.equal((await post('login', { email, password })).status, 200);
        const token = jar.get('gameops_session')!;
        await db.query(
          "UPDATE auth_sessions SET created_at=now()-interval '2 days', expires_at=now()-interval '1 day' WHERE token_hash=$1",
          [hashToken(token)],
        );
        assert.equal((await me(token)).status, 401);
        assert.equal((await me('f'.repeat(64))).status, 401);
        assert.equal((await me('malformed')).status, 401);
        jar.clear();
      });
      await t.test('concurrent requests cannot bypass the account rate limit', async () => {
        const token = await csrf();
        const cookies = cookie();
        const responses = await Promise.all(
          Array.from({ length: 12 }, () =>
            fetch(`${origin}/api/v1/auth/login`, {
              method: 'POST',
              headers: {
                Cookie: cookies,
                Origin: process.env.APP_ORIGIN!,
                'Content-Type': 'application/json',
                'X-CSRF-Token': token,
              },
              body: JSON.stringify({ email: emails[2], password }),
            }),
          ),
        );
        assert.equal(responses.filter((response) => response.status === 401).length, 10);
        assert.equal(responses.filter((response) => response.status === 429).length, 2);
        assert.ok(
          Number(
            responses.find((response) => response.status === 429)!.headers.get('Retry-After'),
          ) > 0,
        );
        const key = createHmac('sha256', secret).update(`account:${emails[2]}`).digest('hex');
        await db.query(
          "UPDATE auth_rate_limits SET resets_at=now()-interval '1 second' WHERE key_hash=$1",
          [key],
        );
        assert.equal((await post('login', { email: emails[2], password })).status, 401);
      });
    } finally {
      await app.close();
      await db.query('DELETE FROM users WHERE email_normalized = ANY($1::text[])', [emails]);
      const keys = [...emails.map((value) => `account:${value}`), 'peer:127.0.0.1'].map((key) =>
        createHmac('sha256', secret).update(key).digest('hex'),
      );
      await db.query('DELETE FROM auth_rate_limits WHERE key_hash = ANY($1::text[])', [keys]);
      await db.end();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  },
);
