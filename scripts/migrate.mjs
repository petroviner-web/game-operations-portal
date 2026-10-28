import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const directory = fileURLToPath(new URL('../migrations/', import.meta.url));

export async function migrate(connectionString) {
  if (!connectionString) throw new Error('DATABASE_URL is required. Copy .env.example to .env.');
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
    lock_timeout: 10000,
  });
  await client.connect();
  try {
    // One migration runner at a time, including across separate processes.
    await client.query('SELECT pg_advisory_lock(713429)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const files = (await readdir(directory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
    for (const name of files) {
      const sql = await readFile(path.join(directory, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = await client.query(
        'SELECT checksum FROM schema_migrations WHERE name = $1',
        [name],
      );
      if (previous.rowCount) {
        if (previous.rows[0].checksum !== checksum)
          throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [
          name,
          checksum,
        ]);
        await client.query('COMMIT');
        console.log(`Applied ${name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    // Closing the connection also releases the advisory lock on errors.
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrate(process.env.DATABASE_URL).catch(() => {
    console.error(
      'Migration failed. Check the database connection and migration files. No credentials are logged.',
    );
    process.exitCode = 1;
  });
}
