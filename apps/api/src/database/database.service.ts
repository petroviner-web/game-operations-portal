import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { readConfig } from '../config';

export const INITIAL_MIGRATION = '001_users.sql';
export const REQUIRED_MIGRATION = '005_project_members.sql';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool = new Pool({
    connectionString: readConfig().databaseUrl,
    max: 5,
    // A hosted database can need a few seconds to resume after idle sleep.
    connectionTimeoutMillis: process.env.NODE_ENV === 'production' ? 10000 : 1500,
    idleTimeoutMillis: 10000,
    statement_timeout: 1500,
    query_timeout: 2000,
  });

  constructor() {
    // An idle connection can fail after a database restart. Do not crash the API.
    this.pool.on('error', () => this.logger.warn('An idle database connection was lost.'));
  }

  async isReady(): Promise<boolean> {
    try {
      const result = await this.pool.query<{ ready: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE name = $1) AND to_regclass('public.users') IS NOT NULL AND to_regclass('public.auth_sessions') IS NOT NULL AND to_regclass('public.auth_rate_limits') IS NOT NULL AND to_regclass('public.projects') IS NOT NULL AND to_regclass('public.project_members') IS NOT NULL AND to_regclass('public.game_sessions') IS NOT NULL AND to_regclass('public.session_participants') IS NOT NULL AS ready",
        [REQUIRED_MIGRATION],
      );
      return result.rows[0]?.ready === true;
    } catch {
      // Readiness is expected to fail during startup/outages; never expose driver errors.
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
    return this.pool.query<T>(text, values);
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
