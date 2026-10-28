import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';

test(
  'migrations, database constraints, and HTTP readiness work against PostgreSQL',
  { timeout: 30000 },
  async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    assert.ok(
      connectionString,
      'TEST_DATABASE_URL is required; integration tests never silently skip.',
    );
    const testUrl = new URL(connectionString);
    assert.match(testUrl.pathname, /_test$/, 'Use a dedicated database ending in _test.');
    if (process.env.DATABASE_URL) {
      const appUrl = new URL(process.env.DATABASE_URL);
      assert.notEqual(
        `${testUrl.host}${testUrl.pathname}`,
        `${appUrl.host}${appUrl.pathname}`,
        'Test and development databases must differ.',
      );
    }
    const client = new Client({ connectionString });
    await client.connect();
    const originalUrl = process.env.DATABASE_URL;
    process.env.CSRF_SECRET ||= 'database-integration-test-secret-only-0001';
    try {
      const root = path.resolve(__dirname, '../../../..');
      const runMigration = () =>
        execFileSync(process.execPath, ['scripts/migrate.mjs'], {
          cwd: root,
          env: { ...process.env, DATABASE_URL: connectionString },
          encoding: 'utf8',
        });
      runMigration();
      runMigration();
      const applied = await client.query(
        'SELECT count(*)::int AS count FROM schema_migrations WHERE name = $1',
        ['001_users.sql'],
      );
      assert.equal(applied.rows[0].count, 1, 'rerunning migrations must not duplicate records');

      await client.query('BEGIN');
      try {
        const email = `${randomUUID()}@example.test`;
        await client.query('INSERT INTO users (email_normalized, password_hash) VALUES ($1, $2)', [
          email,
          'test-hash-only',
        ]);
        await assert.rejects(
          client.query('INSERT INTO users (email_normalized, password_hash) VALUES ($1, $2)', [
            email,
            'test-hash-only',
          ]),
          { code: '23505' },
        );
      } finally {
        await client.query('ROLLBACK');
      }
      await client.query('BEGIN');
      try {
        await assert.rejects(
          client.query('INSERT INTO users (email_normalized, password_hash) VALUES ($1, $2)', [
            'UPPER@example.test',
            'test-hash-only',
          ]),
          { code: '23514' },
        );
      } finally {
        await client.query('ROLLBACK');
      }

      process.env.DATABASE_URL = connectionString;
      const app = await NestFactory.create(AppModule, { logger: false });
      app.setGlobalPrefix('api/v1');
      await app.listen(0, '127.0.0.1');
      try {
        const response = await fetch(`${await app.getUrl()}/api/v1/health/ready`);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).checks.database, 'up');
      } finally {
        await app.close();
      }

      // A reachable server with no application schema is still not ready.
      const schema = `health_${randomUUID().replaceAll('-', '')}`;
      await client.query(`CREATE SCHEMA "${schema}"`);
      try {
        const isolatedUrl = new URL(connectionString);
        isolatedUrl.searchParams.set('options', `-c search_path=${schema}`);
        process.env.DATABASE_URL = isolatedUrl.toString();
        const unmigrated = new DatabaseService();
        try {
          assert.equal(await unmigrated.isReady(), false);
        } finally {
          await unmigrated.onModuleDestroy();
        }
      } finally {
        await client.query(`DROP SCHEMA "${schema}"`);
      }

      const unavailableUrl = new URL(connectionString);
      unavailableUrl.host = '127.0.0.1:1';
      process.env.DATABASE_URL = unavailableUrl.toString();
      const unavailable = new DatabaseService();
      try {
        assert.equal(await unavailable.isReady(), false);
      } finally {
        await unavailable.onModuleDestroy();
      }
    } finally {
      if (originalUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalUrl;
      await client.end();
    }
  },
);
