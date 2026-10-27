# GameOps — Developer portal

An incremental interview project using Next.js, TypeScript, NestJS, and PostgreSQL.

**Current scope: milestones 1–5, foundation, authentication, game projects, multiplayer simulation, and project analytics.** Manage projects, run synthetic playtests, and inspect session activity and duration by UTC date. Milestone 6 release preparation is in progress: a Render Free + Neon Free configuration, supervised production start and a local HTTPS production journey are available. Public deployment is not yet verified; see [deployment guide](docs/deployment.md).

## Run locally

Requires Node.js 22.16+ or 24 and npm. Run all commands from this directory.

```powershell
npm ci
npm run setup
npm run db:up
npm run db:migrate
npm run dev
```

Open [the portal](http://127.0.0.1:3000) or [registration](http://127.0.0.1:3000/register). The API listens on port 4000. Use `127.0.0.1` consistently: `localhost` is a different origin for CSRF checks. `npm run setup` creates `.env` if missing and generates a random private `CSRF_SECRET` without printing it; existing configuration is preserved.

If Docker is unavailable, run `npm run db:local` instead of `npm run db:up` in a separate terminal and keep it open. This starts real PostgreSQL 18 with project-local data in `.local/postgres`; it does not install a system service. Use Ctrl+C to stop it. Do not run both database options on the same port. Embedded PostgreSQL is a development convenience; CI uses the official PostgreSQL container.

The local helper and Docker initialization create both `gameops` and `gameops_test`. Development credentials in `.env.example` are only for loopback development. Database files, build artifacts, and `.env` are ignored by Git.

## Commands

| Command                           | Purpose                                                       |
| --------------------------------- | ------------------------------------------------------------- |
| `npm run dev`                     | Run Next.js and NestJS with watch mode                        |
| `npm run db:migrate`              | Apply missing SQL migrations transactionally                  |
| `npm run db:down`                 | Stop Docker database without deleting its volume              |
| `npm run lint`                    | Check frontend/backend lint rules                             |
| `npm run typecheck`               | Generate Next.js route types and check both applications      |
| `npm test`                        | Test health, configuration, validation, and CSRF              |
| `npm run test:integration`        | Test real PostgreSQL, authentication, and security boundaries |
| `npx playwright install chromium` | Install the browser used by browser tests                     |
| `npm run test:e2e`                | Browser tests at desktop and mobile sizes                     |
| `npm run build`                   | Build both applications                                       |

Production requires TLS ingress, `NODE_ENV=production` for both apps, an exact HTTPS `APP_ORIGIN`, and securely supplied `CSRF_SECRET`/`DATABASE_URL`. Secure `__Host-` cookies cannot be exercised in the local HTTP demo. Start built apps using `npm run start -w @game-ops/api` and `npm run start -w @game-ops/web` after migration and environment setup. Set server-only `API_ORIGIN` during web build and runtime if changing the default `http://127.0.0.1:4000` API address. For the combined hosting service use `npm run start:release`; see [deployment guide](docs/deployment.md).

## Architecture

```text
Browser -> Next.js :3000 -> /api/v1/* rewrite -> NestJS :4000 -> PostgreSQL :54329
```

- Next.js owns presentation and checks the workspace session server-side without caching. Forms, sign-out, and readiness interactions use Client Components.
- NestJS owns application behavior and database access. Browser code never receives database credentials.
- A same-origin rewrite avoids a separate browser CORS setup.
- PostgreSQL connection and statement timeouts bound dependency failures.
- The API stays alive during database outages so it can report failure and recover.
- `GET /api/v1/health/live` returns 200 if the API is running.
- `GET /api/v1/health/ready` returns 200 only if PostgreSQL is reachable, migration `004_game_sessions.sql` is recorded, and users/auth-session/rate-limit/project/game-session/participant tables exist. Otherwise it returns 503. Responses use `Cache-Control: no-store`; driver diagnostics are not exposed.
- The browser distinguishes API failure from database failure, times out after five seconds, and supports retry. It does not poll in the background.

NestJS protects endpoints by default; `@Public()` explicitly opts out of authentication. Public mutations still require CSRF/origin protection. Both servers bind to loopback. See [authentication design](docs/authentication.md) for endpoints, security decisions, and scope limits before public deployment.

## Database and migrations

`001_users.sql` defines users with UUID IDs and unique normalized emails. `002_auth.sql` adds hashed session tokens and shared rate-limit counters. Passwords use Argon2id; raw passwords and session tokens are never stored in PostgreSQL.

`003_projects.sql` adds owner-scoped projects, archival timestamps, version checks, and pagination indexes. See [project architecture and API](docs/projects.md). For an existing setup, run `npm run db:migrate` before restarting the API.

`004_game_sessions.sql` adds game sessions and participant history. See [session architecture and API](docs/sessions.md) for lifecycle, concurrency, retry behavior, and archive rules.

Milestone 5 computes analytics from the existing session timestamps and participant state; it needs no new migration. See [analytics definitions and API](docs/analytics.md).

The migration runner takes a PostgreSQL advisory lock, applies each migration in a transaction, and stores its SHA-256 checksum. Re-running is safe; editing an already-applied migration fails. Add a new migration for changes. The runner never resets or drops application tables.

This slice uses `pg` and explicit SQL to keep the initial dependency boundary small and make transactions visible. Prisma was a proposed option in the design; introducing it should be an explicit later decision before CRUD expands.

## Tests and CI

Integration tests require `TEST_DATABASE_URL` naming a separate database ending in `_test`. They fail if missing rather than silently skipping. They verify migrations, constraints, readiness, authentication, CSRF, revocation, expiration, safe JSON errors, concurrent rate limiting, project ownership, pagination, simultaneous edits, capacity races, retry-safe joins, lifecycle transitions, archive/create races, UTC analytics boundaries, completion cohorts, empty periods, and current snapshots. Test-owned accounts and projects are deleted afterward; user constraint tests use rollback and a temporary schema.

Playwright starts its own API on 4100 and Next.js on 3100 with an isolated `.next-e2e` build directory. It never reuses the development server. Authentication, project, multiplayer, and analytics journeys use the real API and test database; readiness UI and failed-save tests control network responses for deterministic recovery checks. Both desktop and mobile layouts run with two workers. Do not run concurrent browser suites on the same ports.

`.github/workflows/ci.yml` runs lint, type checking, API tests, PostgreSQL integration tests, production builds, and Chromium browser tests. The workflow assumes **this folder is the repository root**. If keeping the surrounding thesis repository, move the workflow into that repository's root and set the working directory and npm cache dependency path accordingly.

## Next review checkpoint

Before [milestone 6: release](docs/implementation-plan.md), review [analytics definitions, consistency and limits](docs/analytics.md). Explain the difference between event cohorts and current snapshots, and why missing duration is null. Then review production configuration, observability and deployment readiness.

