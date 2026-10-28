import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { Request } from 'express';
import { readAuthConfig } from '../src/auth/auth.config';
import { validateCredentials } from '../src/auth/auth.validation';
import { CsrfService, hashToken } from '../src/auth/csrf.service';

test('production configuration requires HTTPS and strong secret configuration', () => {
  const secret = 'a'.repeat(64);
  assert.throws(() => readAuthConfig({}), /CSRF_SECRET/);
  assert.throws(
    () => readAuthConfig({ CSRF_SECRET: 'replace-this-placeholder-value-please' }),
    /CSRF_SECRET/,
  );
  assert.throws(
    () =>
      readAuthConfig({
        NODE_ENV: 'production',
        CSRF_SECRET: secret,
        APP_ORIGIN: 'http://example.com',
      }),
    /HTTPS/,
  );
  assert.throws(
    () => readAuthConfig({ CSRF_SECRET: secret, APP_ORIGIN: 'http://example.com/path' }),
    /without a path/,
  );
  const config = readAuthConfig({
    NODE_ENV: 'production',
    CSRF_SECRET: secret,
    APP_ORIGIN: 'https://portal.example.com',
  });
  assert.equal(config.sessionCookie, '__Host-gameops_session');
  assert.equal(config.csrfCookie, '__Host-gameops_csrf');
  assert.deepEqual(config.cookieOptions, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  });
});

test('credentials normalize email, preserve password whitespace, and reject extra properties', () => {
  const password = '  a long passphrase  ';
  assert.deepEqual(validateCredentials({ email: ' Dev@Example.com ', password }, true), {
    email: 'dev@example.com',
    password,
  });
  assert.throws(() => validateCredentials({ email: 'dev@example.com', password: 'short' }, true));
  assert.throws(() =>
    validateCredentials({ email: 'dev@example.com', password, role: 'admin' }, true),
  );
  assert.throws(() => validateCredentials({ email: 'invalid', password }, false));
  assert.throws(() =>
    validateCredentials({ email: 'dev@example.com', password: 'x'.repeat(129) }, false),
  );
});

test('CSRF rejects expired and tampered tokens and tokens bound to another session', () => {
  const before = {
    secret: process.env.CSRF_SECRET,
    origin: process.env.APP_ORIGIN,
    mode: process.env.NODE_ENV,
  };
  process.env.CSRF_SECRET = 'unit-test-csrf-secret-'.repeat(3);
  process.env.APP_ORIGIN = 'http://127.0.0.1:3000';
  process.env.NODE_ENV = 'test';
  try {
    const service = new CsrfService();
    const nonce = 'b'.repeat(64);
    const session = 'c'.repeat(64);
    const makeToken = (time: number) => {
      const signature = createHmac('sha256', process.env.CSRF_SECRET!)
        .update(`${nonce}.${time}.${hashToken(session)}`)
        .digest('hex');
      return `${nonce}.${time}.${signature}`;
    };
    const makeRequest = (token: string, sessionToken = session) =>
      ({
        cookies: { gameops_csrf: token, gameops_session: sessionToken },
        get: (name: string) =>
          name === 'origin' ? process.env.APP_ORIGIN : name === 'x-csrf-token' ? token : undefined,
      }) as unknown as Request;
    const token = makeToken(Date.now());
    assert.doesNotThrow(() => service.assertToken(makeRequest(token)));
    assert.throws(() => service.assertToken(makeRequest(token, 'd'.repeat(64))));
    assert.throws(() => service.assertToken(makeRequest(`${token.slice(0, -1)}x`)));
    assert.throws(() => service.assertToken(makeRequest(makeToken(Date.now() - 3600001))));
    assert.throws(() => service.assertToken(makeRequest(makeToken(Date.now() + 60000))));
  } finally {
    for (const [key, value] of Object.entries({
      CSRF_SECRET: before.secret,
      APP_ORIGIN: before.origin,
      NODE_ENV: before.mode,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
