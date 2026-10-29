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
  'projects enforce ownership, lifecycle, pagination, and concurrent edits',
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
    const emails = [0, 1].map(() => `projects-${randomUUID()}@example.test`);
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
      const input = {
        name: '  Orbital Arena  ',
        description: 'Co-op exploration',
        engine: 'UNREAL',
      };
      let id = '',
        version = 1;

      await t.test(
        'anonymous requests and missing CSRF cannot access or create projects',
        async () => {
          assert.equal((await anonymous.request('')).status, 401);
          assert.equal((await anonymous.request('', 'POST', input)).status, 401);
          assert.equal((await alice.request('', 'POST', input, false)).status, 403);
        },
      );
      await t.test(
        'validation rejects ownership injection, unknown fields and invalid bounds',
        async () => {
          for (const body of [
            { ...input, ownerId: bob.userId },
            { ...input, name: '   ' },
            { ...input, name: 'x'.repeat(101) },
            { ...input, engine: 'UNKNOWN' },
            { ...input, description: 'x'.repeat(2001) },
          ]) {
            assert.equal((await alice.request('', 'POST', body)).status, 400);
          }
          for (const query of [
            '?limit=0',
            '?limit=51',
            '?limit=2.5',
            '?state=bad',
            '?cursor=invalid',
            '?ownerId=other',
          ]) {
            assert.equal((await alice.request(query)).status, 400);
          }
          assert.equal((await alice.request('/invalid')).status, 400);
        },
      );
      await t.test(
        'create persists data, derives ownership, and normalizes project names',
        async () => {
          const response = await alice.request('', 'POST', input);
          assert.equal(response.status, 201);
          assert.equal(response.headers.get('cache-control'), 'no-store');
          const { project } = await response.json();
          id = project.id;
          assert.equal(project.name, 'Orbital Arena');
          assert.equal(project.state, 'active');
          assert.equal(project.version, 1);
          assert.equal(project.archivedAt, null);
          assert.equal(
            (await db.query('SELECT owner_id FROM projects WHERE id=$1', [id])).rows[0].owner_id,
            alice.userId,
          );
          assert.equal(
            (await (await alice.request(`/${id}`)).json()).project.description,
            input.description,
          );
        },
      );
      await t.test(
        'another owner cannot list, read, update, archive, restore, or use a project cursor',
        async () => {
          assert.deepEqual((await (await bob.request('')).json()).items, []);
          const foreign = await bob.request(`/${id}`);
          const nonexistent = await bob.request(`/${randomUUID()}`);
          assert.equal(foreign.status, 404);
          assert.equal(nonexistent.status, 404);
          assert.equal((await foreign.json()).message, (await nonexistent.json()).message);
          for (const [suffix, method, body] of [
            ['', 'PATCH', { name: 'Stolen', version: 1 }],
            ['/archive', 'POST', { version: 1 }],
            ['/restore', 'POST', { version: 1 }],
          ] as const)
            assert.equal((await bob.request(`/${id}${suffix}`, method, body)).status, 404);
          assert.equal((await bob.request(`?cursor=${id}`)).status, 400);
          assert.equal(
            (await (await alice.request(`/${id}`)).json()).project.name,
            'Orbital Arena',
          );
        },
      );
      await t.test(
        'keyset pagination preserves equal timestamp rows and excludes other owners',
        async () => {
          const ids = [id];
          for (let n = 0; n < 4; n++)
            ids.push(
              (await (await alice.request('', 'POST', { ...input, name: `World ${n}` })).json())
                .project.id,
            );
          await bob.request('', 'POST', { ...input, name: 'Private world' });
          await db.query(
            "UPDATE projects SET created_at='2026-01-01T00:00:00.123456Z' WHERE owner_id=$1",
            [alice.userId],
          );
          const seen: string[] = [];
          let cursor: string | null = null;
          do {
            const response = await alice.request(`?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
            assert.equal(response.status, 200);
            const page = await response.json();
            seen.push(...page.items.map((project: { id: string }) => project.id));
            cursor = page.nextCursor;
            assert.ok(seen.length <= ids.length, 'cursor must advance');
          } while (cursor);
          assert.deepEqual(seen, ids.sort().reverse());
          assert.equal(new Set(seen).size, ids.length);
        },
      );
      await t.test(
        'concurrent edits with the same version produce one winner, not a lost update',
        async () => {
          assert.equal((await alice.request(`/${id}`, 'PATCH', { version: 1 })).status, 400);
          assert.equal(
            (await alice.request(`/${id}`, 'PATCH', { name: 'Missing version' })).status,
            400,
          );
          const responses = await Promise.all(
            ['First edit', 'Second edit'].map((name) =>
              alice.request(`/${id}`, 'PATCH', { name, version: 1 }),
            ),
          );
          assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
          const winner = (await responses.find((response) => response.status === 200)!.json())
            .project;
          const current = (await (await alice.request(`/${id}`)).json()).project;
          assert.equal(current.name, winner.name);
          assert.equal(current.version, 2);
          version = current.version;
          const cleared = await alice.request(`/${id}`, 'PATCH', { description: '', version });
          assert.equal(cleared.status, 200);
          const project = (await cleared.json()).project;
          version = project.version;
          assert.equal(project.description, '');
          assert.equal(project.engine, 'UNREAL');
        },
      );
      await t.test(
        'archive is reversible, filtered, versioned, idempotent, and prevents edits',
        async () => {
          assert.equal((await alice.request(`/${id}/archive`, 'POST', { version: 1 })).status, 409);
          const archived = await alice.request(`/${id}/archive`, 'POST', { version });
          assert.equal(archived.status, 200);
          const project = (await archived.json()).project;
          assert.equal(project.state, 'archived');
          assert.ok(project.archivedAt);
          const again = (await (await alice.request(`/${id}/archive`, 'POST', { version })).json())
            .project;
          assert.equal(again.version, project.version);
          assert.equal(again.archivedAt, project.archivedAt);
          assert.equal(
            (
              await alice.request(`/${id}`, 'PATCH', {
                name: 'Blocked edit',
                version: project.version,
              })
            ).status,
            409,
          );
          assert.ok(
            !(await (await alice.request('')).json()).items.some(
              (item: { id: string }) => item.id === id,
            ),
          );
          assert.deepEqual(
            (await (await alice.request('?state=archived')).json()).items.map(
              (item: { id: string }) => item.id,
            ),
            [id],
          );
          assert.equal((await (await alice.request('?state=all')).json()).items.length, 5);
          const restored = (
            await (
              await alice.request(`/${id}/restore`, 'POST', { version: project.version })
            ).json()
          ).project;
          assert.equal(restored.state, 'active');
          assert.equal(restored.archivedAt, null);
          assert.equal(restored.version, project.version + 1);
          const repeat = (
            await (
              await alice.request(`/${id}/restore`, 'POST', { version: project.version })
            ).json()
          ).project;
          assert.equal(repeat.version, restored.version);
        },
      );
      await t.test(
        'database constraints also reject invalid projects independently of HTTP validation',
        async () => {
          await assert.rejects(
            db.query('INSERT INTO projects (owner_id,name,engine) VALUES ($1,$2,$3)', [
              alice.userId,
              '',
              'UNREAL',
            ]),
            { code: '23514' },
          );
          await assert.rejects(
            db.query('INSERT INTO projects (owner_id,name,engine) VALUES ($1,$2,$3)', [
              alice.userId,
              'Valid',
              'UNKNOWN',
            ]),
            { code: '23514' },
          );
          await assert.rejects(
            db.query('INSERT INTO projects (owner_id,name,engine) VALUES ($1,$2,$3)', [
              randomUUID(),
              'Valid',
              'UNREAL',
            ]),
            { code: '23503' },
          );
        },
      );
      await t.test(
        'owner can grant and revoke developer access without granting ownership',
        async () => {
          const created = await alice.request('', 'POST', {
            name: 'Shared project',
            engine: 'UNREAL',
          });
          assert.equal(created.status, 201);
          const shared = (await created.json()).project;
          const projectId = shared.id;
          assert.equal((await bob.request(`/${projectId}`)).status, 404);
          assert.equal(
            (await bob.request(`/${projectId}/members`, 'POST', { email: emails[0] })).status,
            404,
          );
          assert.equal(
            (await alice.request(`/${projectId}/members`, 'POST', { email: emails[1] }, false))
              .status,
            403,
          );
          assert.equal(
            (
              await alice.request(`/${projectId}/members`, 'POST', {
                email: emails[1],
                role: 'owner',
              })
            ).status,
            400,
          );
          assert.equal(
            (await alice.request(`/${projectId}/members`, 'POST', { email: emails[1] })).status,
            200,
          );
          assert.equal(
            (await alice.request(`/${projectId}/members`, 'POST', { email: emails[1] })).status,
            200,
          );
          const members = (await (await alice.request(`/${projectId}/members`)).json()).members;
          assert.equal(members.length, 1);
          assert.equal(members[0].id, bob.userId);
          assert.equal(
            (await (await bob.request(`/${projectId}`)).json()).project.role,
            'developer',
          );
          assert.ok(
            (await (await bob.request('')).json()).items.some(
              (p: { id: string }) => p.id === projectId,
            ),
          );
          assert.equal(
            (
              await bob.request(`/${projectId}`, 'PATCH', {
                name: 'Shared edit',
                version: shared.version,
              })
            ).status,
            200,
          );
          assert.equal(
            (await bob.request(`/${projectId}/archive`, 'POST', { version: 2 })).status,
            404,
          );
          assert.equal((await bob.request(`/${projectId}/members`)).status, 404);
          assert.equal(
            (
              await bob.request(`/${projectId}/sessions`, 'POST', {
                name: 'Playtest',
                maxPlayers: 2,
              })
            ).status,
            201,
          );
          assert.equal((await bob.request(`/${projectId}/sessions`)).status, 200);
          assert.equal((await bob.request(`/${projectId}/analytics`)).status, 200);
          assert.equal(
            (await alice.request(`/${projectId}/members/${bob.userId}`, 'DELETE', undefined, false))
              .status,
            403,
          );
          assert.equal(
            (await alice.request(`/${projectId}/members/${bob.userId}`, 'DELETE')).status,
            200,
          );
          assert.equal((await bob.request(`/${projectId}`)).status, 404);
          assert.equal((await bob.request(`/${projectId}/sessions`)).status, 404);
          assert.equal((await bob.request(`/${projectId}/analytics`)).status, 404);
        },
      );
      await t.test('member addition is rate limited per authenticated owner', async () => {
        let limited = false;
        for (let attempt = 0; attempt < 22; attempt++) {
          const response = await alice.request(`/${id}/members`, 'POST', {
            email: 'missing@example.test',
          });
          if (response.status === 429) {
            assert.ok(response.headers.get('retry-after'));
            limited = true;
            break;
          }
          assert.equal(response.status, 200);
        }
        assert.equal(limited, true);
        assert.equal((await alice.request(`/${id}`)).status, 200);
      });
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
