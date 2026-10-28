import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import { migrate } from './migrate.mjs';
import { releaseEnvironment, verifyBuiltProxy } from './release-config.mjs';
import { serveRelease } from './serve-release.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
let stage = 'configuration';
try {
  const env = releaseEnvironment(process.env);
  // Reuse application validation before connecting to the database or opening ports.
  require('../apps/api/dist/config.js').readConfig(env);
  require('../apps/api/dist/auth/auth.config.js').readAuthConfig(env);
  stage = 'build verification';
  const web = path.join(root, 'apps/web');
  const build = path.join(web, env.NEXT_DIST_DIR || '.next');
  await access(path.join(build, 'BUILD_ID'));
  verifyBuiltProxy(
    JSON.parse(await readFile(path.join(build, 'routes-manifest.json'), 'utf8')),
    env.API_ORIGIN,
  );
  stage = 'database migration';
  await migrate(env.DATABASE_URL);
  stage = 'server startup';
  process.exitCode = await serveRelease(
    [
      { name: 'API', cwd: root, args: ['apps/api/dist/main.js'] },
      {
        name: 'Web',
        cwd: web,
        args: [
          require.resolve('next/dist/bin/next'),
          'start',
          '--hostname',
          env.WEB_HOST,
          '--port',
          env.PORT,
        ],
      },
    ],
    env,
  );
} catch {
  console.error(
    `Release startup failed during ${stage}. Check the production build, API_ORIGIN/API_PORT, PORT, APP_ORIGIN, CSRF_SECRET and DATABASE_URL. No configuration values are logged.`,
  );
  process.exitCode = 1;
}
if (process.connected) process.disconnect();
