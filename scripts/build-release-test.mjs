import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Separate ports and build output keep the existing development server intact.
const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', 'build'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  stdio: 'inherit',
  env: { ...process.env, API_ORIGIN: 'http://127.0.0.1:4300', NEXT_DIST_DIR: '.next-release-test' },
});
process.exitCode = result.status ?? 1;
