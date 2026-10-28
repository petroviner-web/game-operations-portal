import EmbeddedPostgres from 'embedded-postgres';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.NODE_ENV === 'production')
  throw new Error('The local database helper is development-only.');
const user = process.env.POSTGRES_USER || 'gameops';
const password = process.env.POSTGRES_PASSWORD || 'gameops_local_only';
const database = process.env.POSTGRES_DB || 'gameops';
const port = Number(process.env.POSTGRES_PORT || 54329);
const databaseDir = fileURLToPath(new URL('../.local/postgres', import.meta.url));
await mkdir(databaseDir, { recursive: true });
const postgres = new EmbeddedPostgres({
  databaseDir,
  user,
  password,
  port,
  persistent: true,
  authMethod: 'scram-sha-256',
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: (message) => {
    if (process.env.DB_DEBUG === '1')
      console.log(String(message).replaceAll(password, '[redacted]'));
  },
  onError: (error) => {
    if (process.env.DB_DEBUG === '1')
      console.error(String(error).replaceAll(password, '[redacted]'));
  },
});
let stopping = false;
let started = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  if (started) await postgres.stop();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
try {
  if (!existsSync(path.join(databaseDir, 'PG_VERSION'))) await postgres.initialise();
  await postgres.start();
  started = true;
  const admin = postgres.getPgClient('postgres', '127.0.0.1');
  await admin.connect();
  try {
    for (const name of [database, 'gameops_test']) {
      const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
      if (!existing.rowCount) await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(name)}`);
    }
  } finally {
    await admin.end();
  }
  console.log(
    `Local PostgreSQL ready on 127.0.0.1:${port}. Keep this terminal open; Ctrl+C stops it.`,
  );
} catch (error) {
  console.error(
    'Local PostgreSQL could not start. Check port availability, or use npm run db:up with Docker.',
  );
  if (error instanceof Error) console.error(error.message.replaceAll(password, '[redacted]'));
  if (started) await postgres.stop().catch(() => {});
  process.exitCode = 1;
}
