import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { Client } from 'pg';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { hashToken } from '../src/auth/csrf.service';

test(
  'analytics aggregates respect UTC cohorts, ownership, and empty periods',
  { timeout: 60000 },
  async (t) => {
    const url = process.env.TEST_DATABASE_URL;
    assert.ok(url, 'TEST_DATABASE_URL is required.');
    const parsed = new URL(url);
    assert.match(parsed.pathname, /_test$/);
    if (process.env.DATABASE_URL) {
      const dev = new URL(process.env.DATABASE_URL);
      assert.notEqual(parsed.host + parsed.pathname, dev.host + dev.pathname);
    }
    const previous = {
      DATABASE_URL: process.env.DATABASE_URL,
      CSRF_SECRET: process.env.CSRF_SECRET,
      APP_ORIGIN: process.env.APP_ORIGIN,
      NODE_ENV: process.env.NODE_ENV,
    };
    const zonedUrl = new URL(url);
    zonedUrl.searchParams.set('options', '-c timezone=America/Los_Angeles');
    Object.assign(process.env, {
      DATABASE_URL: zonedUrl.toString(),
      CSRF_SECRET: randomBytes(32).toString('hex'),
      APP_ORIGIN: 'http://127.0.0.1:3000',
      NODE_ENV: 'test',
    });
    const emails = [0, 1].map(() => `analytics-${randomUUID()}@example.test`);
    const db = new Client({ connectionString: url });
    let app: INestApplication | undefined;
    try {
      execFileSync(process.execPath, ['scripts/migrate.mjs'], {
        cwd: path.resolve(__dirname, '../../../..'),
        env: process.env,
      });
      await db.connect();
      app = await NestFactory.create(AppModule, { logger: false, bodyParser: false });
      configureApp(app);
      await app.listen(0, '127.0.0.1');
      const origin = await app.getUrl();
      async function client(index?: number) {
        let cookie = '';
        let userId = '';
        if (index !== undefined) {
          const user = await db.query(
            'INSERT INTO users (email_normalized,password_hash) VALUES ($1,$2) RETURNING id',
            [emails[index], 'fixture-no-password-login'],
          );
          userId = user.rows[0].id;
          const token = randomBytes(32).toString('hex');
          await db.query(
            "INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES ($1,$2,now()+interval '1 day')",
            [userId, hashToken(token)],
          );
          cookie = `gameops_session=${token}`;
        }
        const response = await fetch(`${origin}/api/v1/auth/csrf`, { headers: { Cookie: cookie } });
        const csrf = (await response.json()).csrfToken;
        cookie += `; ${response.headers.getSetCookie()[0]!.split(';')[0]}`;
        return {
          userId,
          request: (route: string, method = 'GET', body?: unknown, protect = true) =>
            fetch(`${origin}/api/v1/projects${route}`, {
              method,
              headers: {
                Cookie: cookie,
                Origin: process.env.APP_ORIGIN!,
                'Content-Type': 'application/json',
                ...(protect ? { 'X-CSRF-Token': csrf } : {}),
              },
              ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            }),
        };
      }
      const alice = await client(0),
        bob = await client(1),
        anonymous = await client();
      async function projectFor(owner = alice.userId, archived = false) {
        const result = await db.query(
          "INSERT INTO projects(owner_id,name,engine,archived_at) VALUES ($1,'Analytics test','UNREAL',CASE WHEN $2 THEN now() ELSE NULL END) RETURNING id",
          [owner, archived],
        );
        return result.rows[0].id as string;
      }
      async function seed(
        project: string,
        created: string,
        started: string | null,
        ended: string | null,
        reason: 'COMPLETED' | 'CANCELLED' | null = null,
      ) {
        const result = await db.query(
          'INSERT INTO game_sessions(project_id,name,max_players,state,created_at,started_at,ended_at,end_reason) VALUES ($1,$2,4,$3,$4,$5,$6,$7) RETURNING id',
          [
            project,
            'Fixture playtest',
            ended ? 'ENDED' : started ? 'RUNNING' : 'LOBBY',
            created,
            started,
            ended,
            reason,
          ],
        );
        return result.rows[0].id as string;
      }
      const project = await projectFor();
      const base = `/${project}/analytics`;
      const range = '?from=2024-03-30&to=2024-04-02';
      await t.test(
        'empty projects return zero-filled UTC days, null duration and an explicit snapshot',
        async () => {
          const response = await alice.request(base + range);
          assert.equal(response.status, 200);
          assert.equal(response.headers.get('cache-control'), 'no-store');
          const data = await response.json();
          assert.deepEqual(data.summary, {
            createdSessions: 0,
            startedSessions: 0,
            completedSessions: 0,
            averageDurationSeconds: null,
          });
          assert.deepEqual(data.current, { runningSessions: 0, activePlayers: 0 });
          assert.deepEqual(data.dailyStarts, [
            { date: '2024-03-30', count: 0 },
            { date: '2024-03-31', count: 0 },
            { date: '2024-04-01', count: 0 },
          ]);
          assert.deepEqual(data.range, {
            from: '2024-03-30',
            to: '2024-04-02',
            timeZone: 'UTC',
            endExclusive: true,
          });
          assert.ok(Number.isFinite(Date.parse(data.generatedAt)));
          assert.equal(data.project.id, project);
        },
      );
      await t.test(
        'authentication, owner isolation, UUIDs, and strict date validation apply',
        async () => {
          assert.equal((await anonymous.request(base + range)).status, 401);
          const foreign = await bob.request(base + range),
            missing = await alice.request(`/${randomUUID()}/analytics${range}`);
          assert.equal(foreign.status, 404);
          assert.equal(missing.status, 404);
          const foreignBody = await foreign.json(),
            missingBody = await missing.json();
          for (const key of ['statusCode', 'code', 'message'])
            assert.equal(foreignBody[key], missingBody[key]);
          assert.equal((await alice.request('/invalid/analytics')).status, 400);
          for (const query of [
            '?from=2024-03-30',
            '?to=2024-04-02',
            '?from=2024-04-02&to=2024-03-30',
            '?from=2024-03-30&to=2024-03-30',
            '?from=2026-02-29&to=2026-03-01',
            '?from=2026-01-01&to=2026-04-02',
            '?from=2024-03-30&from=2024-03-31&to=2024-04-02',
            '?ownerId=other',
            '?from=%27%3BDROP&to=2024-04-02',
          ])
            assert.equal((await alice.request(base + query)).status, 400, query);
        },
      );
      await seed(
        project,
        '2024-03-29T23:59:59.999999Z',
        '2024-03-30T00:00:00Z',
        '2024-03-30T00:10:00Z',
        'COMPLETED',
      );
      await seed(
        project,
        '2024-03-30T00:00:00Z',
        '2024-03-30T23:30:00Z',
        '2024-03-31T00:00:00Z',
        'COMPLETED',
      );
      await seed(
        project,
        '2024-03-31T12:00:00Z',
        '2024-04-01T23:59:59.999999Z',
        '2024-04-02T00:00:00Z',
        'COMPLETED',
      );
      await seed(
        project,
        '2024-04-02T00:00:00Z',
        '2024-04-02T00:00:00Z',
        '2024-04-02T00:15:00Z',
        'COMPLETED',
      );
      await seed(project, '2024-03-30T12:00:00Z', null, '2024-03-30T12:10:00Z', 'CANCELLED');
      await seed(
        project,
        '2024-03-29T23:00:00Z',
        '2024-03-29T23:30:00Z',
        '2024-03-30T00:00:00Z',
        'COMPLETED',
      );
      const running = await seed(project, '2024-03-31T20:00:00Z', '2024-03-31T21:00:00Z', null);
      const lobby = await seed(project, '2024-03-31T22:00:00Z', null, null);
      await seed(
        project,
        '2024-03-29T22:00:00Z',
        '2024-03-29T23:00:00Z',
        '2024-03-29T23:59:59.999999Z',
        'COMPLETED',
      );
      await seed(project, '2024-04-01T23:59:59.999999Z', null, null);
      for (const id of [running, running, lobby])
        await db.query(
          "INSERT INTO session_participants(session_id,id,name) VALUES ($1,$2,'Connected')",
          [id, randomUUID()],
        );
      await db.query(
        "INSERT INTO session_participants(session_id,id,name,joined_at,left_at) VALUES ($1,$2,'Departed','2024-03-31T20:00:00Z','2024-03-31T20:10:00Z')",
        [running, randomUUID()],
      );
      for (const owner of [alice.userId, bob.userId]) {
        const other = await projectFor(owner);
        const session = await seed(other, '2024-03-30T00:00:00Z', '2024-03-30T01:00:00Z', null);
        await db.query(
          "INSERT INTO session_participants(session_id,id,name) VALUES ($1,$2,'Other project')",
          [session, randomUUID()],
        );
      }
      await t.test(
        'event cohorts include the lower boundary and exclude the upper boundary at microsecond precision',
        async () => {
          const data = await (await alice.request(base + range)).json();
          assert.deepEqual(data.summary, {
            createdSessions: 6,
            startedSessions: 4,
            completedSessions: 3,
            averageDurationSeconds: 1400,
          });
          assert.deepEqual(data.dailyStarts, [
            { date: '2024-03-30', count: 2 },
            { date: '2024-03-31', count: 1 },
            { date: '2024-04-01', count: 1 },
          ]);
          assert.equal(
            data.dailyStarts.reduce((sum: number, day: { count: number }) => sum + day.count, 0),
            data.summary.startedSessions,
          );
        },
      );
      await t.test(
        'current metrics ignore the historical range and exclude departed players and other projects',
        async () => {
          for (const query of [range, '?from=2020-01-01&to=2020-01-02']) {
            const data = await (await alice.request(base + query)).json();
            assert.deepEqual(data.current, { runningSessions: 1, activePlayers: 3 });
          }
          const empty = await (await alice.request(base + '?from=2020-01-01&to=2020-01-02')).json();
          assert.equal(empty.summary.averageDurationSeconds, null);
          assert.equal(empty.summary.createdSessions, 0);
        },
      );
      await t.test(
        'completion cohorts count the full run even when the start lies outside the range',
        async () => {
          const data = await (await alice.request(base + '?from=2024-03-30&to=2024-03-31')).json();
          assert.equal(data.summary.completedSessions, 2);
          assert.equal(data.summary.averageDurationSeconds, 1200);
          const next = await (await alice.request(base + '?from=2024-04-02&to=2024-04-03')).json();
          assert.equal(next.summary.completedSessions, 2);
          assert.equal(next.summary.startedSessions, 1);
        },
      );
      await t.test(
        'zero duration is distinct from no data and archived histories remain visible',
        async () => {
          const archived = await projectFor(alice.userId, true);
          await seed(
            archived,
            '2024-03-30T00:00:00Z',
            '2024-03-30T00:00:00Z',
            '2024-03-30T00:00:00Z',
            'COMPLETED',
          );
          const data = await (await alice.request(`/${archived}/analytics${range}`)).json();
          assert.equal(data.project.state, 'archived');
          assert.equal(data.summary.averageDurationSeconds, 0);
          assert.equal(data.summary.completedSessions, 1);
          assert.deepEqual(data.current, { runningSessions: 0, activePlayers: 0 });
        },
      );
      await t.test(
        'defaults are seven UTC days and explicit ranges may include up to ninety days',
        async () => {
          const data = await (await alice.request(base)).json();
          assert.equal(data.dailyStarts.length, 7);
          assert.equal(data.range.from, data.dailyStarts[0].date);
          assert.equal(Date.parse(data.range.to) - Date.parse(data.range.from), 7 * 86400000);
          assert.ok(
            data.generatedAt.slice(0, 10) >= data.range.from &&
              data.generatedAt.slice(0, 10) < data.range.to,
          );
          const long = await (await alice.request(base + '?from=2026-01-01&to=2026-04-01')).json();
          assert.equal(long.dailyStarts.length, 90);
          assert.equal(long.dailyStarts[89].date, '2026-03-31');
        },
      );
    } finally {
      await app?.close();
      try {
        await db.query('DELETE FROM users WHERE email_normalized=ANY($1::text[])', [emails]);
      } finally {
        await db.end();
        for (const [key, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    }
  },
);
