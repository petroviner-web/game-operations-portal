import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const file = new URL('../.env', import.meta.url);
let contents;
try {
  contents = await readFile(file, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  contents = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
}
const existing = /^CSRF_SECRET=(.*)$/m.exec(contents);
if (!existing || existing[1].trim().startsWith('replace-')) {
  const line = `CSRF_SECRET=${randomBytes(32).toString('hex')}`;
  contents = existing
    ? contents.replace(/^CSRF_SECRET=.*$/m, line)
    : `${contents.trimEnd()}\n${line}\n`;
}
if (!/^APP_ORIGIN=/m.test(contents)) contents += '\nAPP_ORIGIN=http://127.0.0.1:3000\n';
await writeFile(file, contents, { mode: 0o600 });
console.log(
  'Local configuration ready. Existing credentials are preserved; secrets are not printed.',
);
