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
  'sessions enforce lifecycle, ownership, retries, capacity and archive races',
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
    Object.assign(process.env, {
      DATABASE_URL: url,
      CSRF_SECRET: randomBytes(32).toString('hex'),
      APP_ORIGIN: 'http://127.0.0.1:3000',
      NODE_ENV: 'test',
    });
    const emails = [0, 1].map(() => `sessions-${randomUUID()}@example.test`);
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
      async function createProject(name = 'Session tests') {
        const response = await alice.request('', 'POST', { name, engine: 'UNREAL' });
        assert.equal(response.status, 201);
        return (await response.json()).project.id as string;
      }
      const project = await createProject();
      const base = `/${project}/sessions`;
      async function create(name = 'Playtest', parent = project) {
        const response = await alice.request(`/${parent}/sessions`, 'POST', {
          name,
          maxPlayers: 2,
        });
        assert.equal(response.status, 201);
        return (await response.json()).session;
      }
      const session = await create();
      const route = `${base}/${session.id}`;
      const player = { id: randomUUID(), name: 'Pilot' };
      await t.test(
        'authentication, CSRF and every owner-scoped operation are enforced',
        async () => {
          assert.equal((await anonymous.request(base)).status, 401);
          assert.equal(
            (await alice.request(base, 'POST', { name: 'Blocked', maxPlayers: 2 }, false)).status,
            403,
          );
          for (const [path, method, body] of [
            [base, 'GET', undefined],
            [base, 'POST', { name: 'Foreign', maxPlayers: 2 }],
            [route, 'GET', undefined],
            [`${route}/players`, 'POST', player],
            [`${route}/players/${player.id}/leave`, 'POST', {}],
            ...['start', 'end', 'cancel'].map((action) => [`${route}/${action}`, 'POST', {}]),
          ] as [string, string, unknown][])
            assert.equal((await bob.request(path, method, body)).status, 404);
          const other = await createProject();
          assert.equal((await alice.request(`/${other}/sessions/${session.id}`)).status, 404);
          assert.equal(
            (await alice.request(`/${other}/sessions?cursor=${session.id}`)).status,
            400,
          );
        },
      );
      await t.test(
        'strict validation rejects invalid capacity, identifiers and extra fields',
        async () => {
          for (const input of [
            { name: '', maxPlayers: 2 },
            { name: 'x'.repeat(81), maxPlayers: 2 },
            { name: 'X', maxPlayers: 1 },
            { name: 'X', maxPlayers: 33 },
            { name: 'X', maxPlayers: 2.5 },
            { name: 'X', maxPlayers: 2, state: 'RUNNING' },
          ])
            assert.equal((await alice.request(base, 'POST', input)).status, 400);
          for (const input of [
            { id: 'bad', name: 'A' },
            { ...player, name: ' ' },
            { ...player, name: 'x'.repeat(41) },
            { ...player, ownerId: bob.userId },
          ])
            assert.equal((await alice.request(`${route}/players`, 'POST', input)).status, 400);
          for (const query of [
            '?limit=0',
            '?limit=51',
            '?limit=2.5',
            '?cursor=bad',
            '?ownerId=bad',
          ])
            assert.equal((await alice.request(base + query)).status, 400);
          assert.equal(
            (await alice.request(`${route}/start`, 'POST', { force: true })).status,
            400,
          );
          assert.equal((await alice.request(`${base}/bad`)).status, 400);
        },
      );
      await t.test(
        'a new lobby cannot start without two players or end before starting',
        async () => {
          assert.equal(session.state, 'LOBBY');
          assert.equal(session.activePlayers, 0);
          assert.deepEqual(session.participants, []);
          assert.equal(session.startedAt, null);
          assert.equal((await alice.request(`${route}/start`, 'POST', {})).status, 409);
          assert.equal((await alice.request(`${route}/end`, 'POST', {})).status, 409);
          assert.equal(
            (await alice.request(`/${project}/archive`, 'POST', { version: 1 })).status,
            409,
          );
        },
      );
      await t.test(
        'concurrent retries join once; two distinct requests for the last slot have one winner',
        async () => {
          const repeats = await Promise.all(
            [0, 1].map(() => alice.request(`${route}/players`, 'POST', player)),
          );
          assert.deepEqual(
            repeats.map((r) => r.status),
            [200, 200],
          );
          assert.equal((await (await alice.request(route)).json()).session.activePlayers, 1);
          assert.equal(
            (await alice.request(`${route}/players`, 'POST', { ...player, name: 'Changed' }))
              .status,
            409,
          );
          const races = await Promise.all(
            ['Two', 'Three'].map((name) =>
              alice.request(`${route}/players`, 'POST', { id: randomUUID(), name }),
            ),
          );
          assert.deepEqual(races.map((r) => r.status).sort(), [200, 409]);
          assert.equal((await (await alice.request(route)).json()).session.activePlayers, 2);
        },
      );
      await t.test(
        'start is retry-safe, running sessions close joins but allow departures',
        async () => {
          const started = (await (await alice.request(`${route}/start`, 'POST', {})).json())
            .session;
          assert.equal(started.state, 'RUNNING');
          assert.ok(started.startedAt);
          const again = (await (await alice.request(`${route}/start`, 'POST', {})).json()).session;
          assert.equal(again.startedAt, started.startedAt);
          assert.equal((await alice.request(`${route}/players`, 'POST', player)).status, 200);
          assert.equal(
            (await alice.request(`${route}/players`, 'POST', { id: randomUUID(), name: 'Late' }))
              .status,
            409,
          );
          assert.equal((await alice.request(`${route}/cancel`, 'POST', {})).status, 409);
          for (let i = 0; i < 2; i++)
            assert.equal(
              (await alice.request(`${route}/players/${player.id}/leave`, 'POST', {})).status,
              200,
            );
          const current = (await (await alice.request(route)).json()).session;
          assert.equal(current.state, 'RUNNING');
          assert.equal(current.activePlayers, 1);
          assert.equal(
            (await alice.request(`${route}/players/${randomUUID()}/leave`, 'POST', {})).status,
            404,
          );
          assert.equal((await alice.request(`${route}/players`, 'POST', player)).status, 409);
        },
      );
      await t.test(
        'ending disconnects remaining players, preserves timestamps and is terminal',
        async () => {
          const ended = (await (await alice.request(`${route}/end`, 'POST', {})).json()).session;
          assert.equal(ended.state, 'ENDED');
          assert.equal(ended.endReason, 'COMPLETED');
          assert.equal(ended.activePlayers, 0);
          assert.deepEqual(ended.participants, []);
          assert.ok(new Date(ended.endedAt) >= new Date(ended.startedAt));
          assert.equal(
            (await (await alice.request(`${route}/end`, 'POST', {})).json()).session.endedAt,
            ended.endedAt,
          );
          assert.equal(
            (
              await db.query(
                'SELECT count(*)::int AS count FROM session_participants WHERE session_id=$1 AND left_at IS NOT NULL',
                [session.id],
              )
            ).rows[0].count,
            2,
          );
          for (const action of ['start', 'cancel'])
            assert.equal((await alice.request(`${route}/${action}`, 'POST', {})).status, 409);
          assert.equal(
            (await alice.request(`${route}/players`, 'POST', { id: randomUUID(), name: 'Late' }))
              .status,
            409,
          );
        },
      );
      await t.test(
        'lobby departures can be replaced and cancellation closes even an empty lobby',
        async () => {
          for (const populated of [false, true]) {
            const lobby = await create();
            const path = `${base}/${lobby.id}`;
            if (populated) {
              assert.equal((await alice.request(`${path}/players`, 'POST', player)).status, 200);
              assert.equal(
                (await alice.request(`${path}/players/${player.id}/leave`, 'POST', {})).status,
                200,
              );
              assert.equal((await alice.request(`${path}/players`, 'POST', player)).status, 409);
              assert.equal(
                (await alice.request(`${path}/players`, 'POST', { ...player, id: randomUUID() }))
                  .status,
                200,
              );
            }
            const cancelled = (await (await alice.request(`${path}/cancel`, 'POST', {})).json())
              .session;
            assert.equal(cancelled.endReason, 'CANCELLED');
            assert.equal(cancelled.startedAt, null);
            assert.equal(cancelled.activePlayers, 0);
            assert.equal(
              (await (await alice.request(`${path}/cancel`, 'POST', {})).json()).session.endedAt,
              cancelled.endedAt,
            );
            assert.equal((await alice.request(`${path}/end`, 'POST', {})).status, 409);
          }
        },
      );
      await t.test(
        'pagination handles identical timestamps without skipping or leaking sessions',
        async () => {
          await db.query(
            "UPDATE game_sessions SET created_at='2026-01-01T00:00:00.123456Z' WHERE project_id=$1",
            [project],
          );
          const seen: string[] = [];
          let cursor: string | null = null;
          do {
            const response = await alice.request(
              `${base}?limit=1${cursor ? `&cursor=${cursor}` : ''}`,
            );
            assert.equal(response.status, 200);
            const page = await response.json();
            seen.push(...page.items.map((item: { id: string }) => item.id));
            cursor = page.nextCursor;
            assert.ok(seen.length <= 3);
          } while (cursor);
          assert.equal(seen.length, 3);
          assert.equal(new Set(seen).size, 3);
          assert.deepEqual(seen, [...seen].sort().reverse());
        },
      );
      await t.test(
        'archived sessions remain readable but reject writes until restoration',
        async () => {
          const archived = await alice.request(`/${project}/archive`, 'POST', { version: 1 });
          assert.equal(archived.status, 200);
          const version = (await archived.json()).project.version;
          assert.equal((await alice.request(route)).status, 200);
          assert.equal((await alice.request(base)).status, 200);
          assert.equal(
            (await alice.request(base, 'POST', { name: 'Blocked', maxPlayers: 2 })).status,
            409,
          );
          assert.equal((await alice.request(`${route}/end`, 'POST', {})).status, 409);
          assert.equal(
            (await alice.request(`/${project}/restore`, 'POST', { version })).status,
            200,
          );
          await create('After restoration');
        },
      );
      await t.test(
        'creation racing with archival never leaves an archived project with an open lobby',
        async () => {
          for (let i = 0; i < 5; i++) {
            const parent = await createProject('Archive race');
            const responses = await Promise.all([
              alice.request(`/${parent}/sessions`, 'POST', {
                name: 'Concurrent lobby',
                maxPlayers: 2,
              }),
              alice.request(`/${parent}/archive`, 'POST', { version: 1 }),
            ]);
            const statuses = responses.map((r) => r.status);
            assert.ok(
              (statuses[0] === 201 && statuses[1] === 409) ||
                (statuses[0] === 409 && statuses[1] === 200),
              JSON.stringify(statuses),
            );
            const invalid = await db.query(
              "SELECT 1 FROM projects p JOIN game_sessions s ON s.project_id=p.id WHERE p.id=$1 AND p.archived_at IS NOT NULL AND s.state<>'ENDED'",
              [parent],
            );
            assert.equal(invalid.rowCount, 0);
          }
        },
      );
      await t.test(
        'database constraints reject impossible lifecycle states and capacities',
        async () => {
          await assert.rejects(
            db.query("INSERT INTO game_sessions(project_id,name,max_players) VALUES ($1,'Bad',1)", [
              project,
            ]),
            { code: '23514' },
          );
          await assert.rejects(
            db.query("UPDATE game_sessions SET state='RUNNING',started_at=NULL WHERE id=$1", [
              session.id,
            ]),
            { code: '23514' },
          );
          await assert.rejects(
            db.query('UPDATE game_sessions SET end_reason=NULL WHERE id=$1', [session.id]),
            { code: '23514' },
          );
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
