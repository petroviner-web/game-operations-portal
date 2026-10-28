import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseEnvironment, verifyBuiltProxy } from '../scripts/release-config.mjs';
import { serveRelease } from '../scripts/serve-release.mjs';

test('hosting origin and production mode are passed to both servers', () => {
  const env = releaseEnvironment({
    NODE_ENV: 'development',
    RENDER_EXTERNAL_URL: 'https://demo.onrender.com',
    PORT: '10000',
  });
  assert.equal(env.NODE_ENV, 'production');
  assert.equal(env.APP_ORIGIN, 'https://demo.onrender.com');
  assert.equal(env.API_ORIGIN, 'http://127.0.0.1:4000');
  assert.equal(env.PORT, '10000');
  assert.equal(
    releaseEnvironment({
      APP_ORIGIN: 'https://example.org',
      RENDER_EXTERNAL_URL: 'https://demo.onrender.com',
    }).APP_ORIGIN,
    'https://example.org',
  );
});

test('release rejects port collisions, invalid binds and mismatched internal API', () => {
  for (const input of [
    { PORT: '4000' },
    { PORT: '0' },
    { API_PORT: '1.5' },
    { PORT: '65536' },
    { WEB_HOST: 'example.org' },
    { API_ORIGIN: 'https://external.example' },
  ])
    assert.throws(() => releaseEnvironment(input));
});

test('a build with a different baked-in API address cannot start', () => {
  const manifest = {
    rewrites: {
      beforeFiles: [],
      afterFiles: [
        { source: '/api/v1/:path*', destination: 'http://127.0.0.1:4000/api/v1/:path*' },
      ],
      fallback: [],
    },
  };
  verifyBuiltProxy(manifest, 'http://127.0.0.1:4000');
  assert.throws(() => verifyBuiltProxy(manifest, 'http://127.0.0.1:4100'));
  assert.throws(() => verifyBuiltProxy({}, 'http://127.0.0.1:4000'));
});

test(
  'unexpected server exit stops its sibling and fails the release process',
  { timeout: 5000 },
  async () => {
    assert.equal(
      await serveRelease(
        [
          { name: 'fixture API', args: ['-e', 'setTimeout(() => process.exit(1), 100)'] },
          { name: 'fixture Web', args: ['-e', 'setInterval(() => {}, 1000)'] },
        ],
        process.env,
        500,
      ),
      1,
    );
  },
);
