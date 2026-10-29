# Project developer access — local verification

Added migration `005_project_members.sql`, owner-only member management, per-project developer access and a member management interface. Existing ownership stays in `projects.owner_id`. Locally, 43 PostgreSQL integration checks passed, including grant/revoke, CSRF, role injection, project/session/analytics permissions and the per-owner rate limit. The desktop and mobile member-management browser flows passed (2 tests). An initial browser assertion used exact text that included a nested role label; the selector was corrected to target the actual remove button. TypeScript and production build passed. Public deployment and backup/restore are separate checks and are not implied by these local results.

# Final MVP slice — 28 October 2026

Added request completion telemetry, production JSON logs, finished-MVP landing copy and direct registration links, operations/rollback notes and the interview demo/review guide. No schema or hosting-plan change.

| Check | Result |
| --- | --- |
| ESLint | Passed after excluding generated `.next-release-test` output |
| TypeScript | Passed |
| Unit/HTTP tests | 9 passed, including request-ID correlation, input/exception exclusion, unknown routes, malformed JSON and disconnect behavior |
| PostgreSQL integration | 41 passed |
| Release configuration/process tests | 4 passed |
| Production builds | Passed for both normal and isolated HTTPS-test builds |
| Production HTTPS browser journey | 1 passed, 24.8 seconds, no retries in final run; production JSON request events observed |
| Affected desktop/mobile browser journeys | 6 passed, 1.4 minutes; status/retry, keyboard focus and horizontal overflow |

Initial HTTP checks were blocked by sandbox loopback permissions and passed with local execution permissions. Windows had also reserved 3435–3534 and 4083–4182, which prevented test ports 3443 and 4100 from binding. The harness now accepts `RELEASE_HTTPS_PORT` and `E2E_API_PORT`; final runs used 34430 and 4310 without changing Windows reservations or production ports. One HTTPS startup exceeded the old roughly 30-second polling window under concurrent local work; the harness now uses an explicit 90-second startup deadline within a 180-second test budget. The final standalone journey passed. Generated build files are now excluded from ESLint/Prettier. Test-account cleanup precedes the release-exit assertion.

The complete 28-test development browser suite was not rerun in this slice: affected overview journeys and the real production HTTPS end-to-end journey were run, alongside all API/database checks. GitHub Actions, production load, automated alerting and backup restore are not claimed. Deployment of this final slice is recorded separately from the initial public release below.

# Public deployment verification — 28 October 2026

Live URL: [GameOps portal](https://gameops-portal.onrender.com/). Deployed application commit: `31645c7af1b51f5594c3afd3e49a81c500ab250c` in the private `petroviner-web/game-operations-portal` repository.

- Render dashboard confirmed **Deploy succeeded | Live**, service `srv-dbh084mtlv9c73dhv5b0`, **Free** instance, initial deployment duration 1m37s.
- Neon console confirmed **Free**, PostgreSQL 18, Frankfurt, project `geops`. The direct database connection uses `sslmode=verify-full` and is stored in Render's `DATABASE_URL`, not in source control.
- Public HTTPS live/readiness returned 200. Anonymous projects returned 401 and workspace redirected to login.
- One synthetic account completed registration, logout/login, project creation, two-player lobby, start/end, analytics reads and authenticated dashboard rendering against the real hosted database.
- The production session used Secure/HttpOnly/__Host- cookies. Cross-origin mutation returned 403. After logout, `/auth/me` returned 401 and the protected dashboard redirected to login.
- The smoke session was ended and its project archived; no active simulated players remain. One isolated synthetic account and archived project are retained. Its generated credentials are kept only in ignored `.local/live-smoke-account.json`, never in GitHub. No existing user data was changed.
- `npm audit --omit=dev`: 0 known vulnerabilities at verification time. This is an advisory check, not a security guarantee.

A browser independently displayed the public landing page and its live API/database-ready state. The full browser journey was verified locally over production HTTPS; the hosted full journey used HTTP requests and server-rendered dashboard HTML. No hosting payment method was added and no paid resource was created. CI was skipped on the initial source commits to avoid consuming private-repository Actions quota; GitHub Actions execution is not claimed. Free-tier sleeping and quotas still apply. Load capacity, backup restoration and ongoing monitoring have not been validated.

# Milestone 6 release preparation (in progress)

Local verification on 27–28 October 2026, Windows and Node.js 24.12.0:

| Check | Result |
| --- | --- |
| Production NestJS/Next.js builds | Passed, including isolated `.next-release-test` build |
| ESLint | Passed |
| Release configuration/process tests | 4 passed |
| PostgreSQL integration | 41 passed |
| Production HTTPS browser journey | 1 passed, real PostgreSQL, Chromium, no retries in the final run |
| Neon project | Free plan, PostgreSQL 18, Frankfurt confirmed in console |
| Public Render deployment / real Neon connection | Passed; see public verification above |

The new journey uses NODE_ENV=production, a local TLS ingress and the real built Next.js/NestJS servers. It verifies registration, secure HttpOnly __Host- session cookies, denied cross-origin mutation, login, project creation, a two-player session, completion, analytics, logout and protected navigation. It cleans up its test account. The process test verifies sibling termination after an unexpected server exit.

Initial runs found an occupied development API port and a stopped local database after a resumed turn. Tests now use separate ports 3300/4300/3443 and an isolated build; the local database was restarted. A test-only proxy initially attempted to write a second error response after headers had been sent; that handler was fixed and the final complete HTTPS journey passed in 9.3 seconds. Early readiness requests can briefly return 502 until NestJS starts. No public TLS, Linux signal handling, free-instance load capacity or GitHub Actions execution is claimed by these local results. The 28 development browser tests documented below were not rerun for this release-only change.

# Milestone 5 verification

Verified on 27 October 2026 with Node.js 24.12.0 and real PostgreSQL 18.4 on Windows.

Final local smoke check: API and Next.js proxy readiness returned 200, the anonymous workspace redirected to `/login` with 307, and the new analytics endpoint rejected an anonymous request with 401.

| Check                  | Result                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| ESLint and TypeScript  | Passed                                                                                                          |
| Unit/HTTP tests        | 7 passed, including default UTC date windows and strict range validation                                        |
| PostgreSQL integration | 41 passed (5 top-level tests and 36 subtests)                                                                   |
| Production builds      | NestJS and Next.js passed, including the project analytics route                                                |
| Playwright             | 28 passed without retries, desktop/mobile Chromium, full suite in 1.5 minutes                                   |
| Visual review          | Desktop and mobile dashboard screenshots inspected; no horizontal overflow at 375px portrait or 812px landscape |

The analytics API tests run database connections in America/Los_Angeles while asserting UTC dates. Cases cover empty history, inaccessible projects, invalid date input, microsecond boundary inclusion/exclusion, daily counts across the DST weekend, completed-session cohorts, full duration for sessions started before the range, null versus zero duration, archived history, and current metrics independent of the range. Existing authentication, project and session tests also passed.

The initial analytics integration run exposed a test assertion comparing unique request IDs between two 404 responses. The assertion now compares the stable status/code/message fields; the final complete suite passes. No implementation failure or skipped integration case was hidden by that change.

Browser tests use the real API and separate test database: exact seeded counts, date filters, accessible daily table with keyboard interaction, focused validation errors, refresh after a real session end, and archived history. The responsive check also enables reduced motion. Screenshots `analytics-preview.png` and `analytics-mobile-preview.png` show disposable test fixtures; these are not seeded development data. Test account deletion cascades to their projects and sessions.

No schema migration or chart dependency was added. Production-scale query performance, screen-reader software, deployed TLS, Docker and GitHub Actions were not exercised here. See [analytics.md](analytics.md) for metric definitions, API contract, query cost, and review exercises.

# Milestone 4 record

Verified on 27 October 2026 with Node.js 24.12.0 and real PostgreSQL 18.4 on Windows.

| Check                  | Result                                                                   |
| ---------------------- | ------------------------------------------------------------------------ |
| ESLint and TypeScript  | Passed                                                                   |
| Unit/HTTP tests        | 5 passed                                                                 |
| PostgreSQL integration | 33 passed (4 top-level tests and 29 subtests)                            |
| Production builds      | NestJS and Next.js passed, including session list/detail routes          |
| Playwright             | 22 passed, desktop/mobile Chromium, no retries (1.8 minutes)             |
| Development migration  | `004_game_sessions.sql` applied successfully                             |
| Local smoke check      | API and Next.js proxy readiness 200; anonymous workspace 307 to `/login` |

After resuming, the stopped local PostgreSQL and development servers were restarted. The final read-only smoke check passed on ports 3000/4000.

The new backend tests exercise owner isolation, strict bounds, concurrent identical joins, two contenders for one remaining slot, minimum players, retry-safe transitions, departures, terminal states, cancellation, equal-timestamp pagination, archived writes, five archive/create races, and SQL constraints. All requests pass through the real NestJS guards and PostgreSQL transactions.

Browser journeys create real accounts/projects/lobbies and cover two-player startup, a departure, completion, reload persistence, blocked archival, cancellation, and read-only archived history. A lost-response test lets the join commit on the server, drops the response, and verifies that resubmitting creates no second player. Desktop and mobile Chromium run against the separate test database on ports 3100/4100; fixture accounts and their data are cleaned up.

Initial browser failures came from alert selectors also matching Next.js's route announcer; selectors now target the relevant region. A subsequent run passed 21/22 but encountered one `ECONNRESET` on the local CSRF proxy during lobby setup while a production build was also running. The final full suite passed all 22 tests without a concurrent build and without retries. This record does not claim a proven root cause for that transient connection reset.

Desktop/mobile simulator screenshots are visually reviewed for layout, labels, capacity, state controls, and horizontal overflow. Full-page captures scroll to the top first so offscreen fixed elements are not included by the screenshot scroll offset. Saved screenshots use disposable test data.

See [sessions.md](sessions.md) for the API, schema, lock order, retry guarantees and review exercises. This phase simulates players over REST with manual refresh; real networking and analytics are not implemented. CI, Docker, production TLS and deployment have not been executed here.

# Milestone 3 record

Completed on 27 October 2026 using Node.js 24.12.0 and real PostgreSQL 18.4 on Windows.

| Check                  | Result                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| ESLint and TypeScript  | Passed                                                                                                                    |
| Unit/HTTP tests        | 5 passed                                                                                                                  |
| PostgreSQL integration | 21 passed, including ownership, equal-timestamp pagination, concurrent updates, archival/restoration, and SQL constraints |
| Playwright             | 16 passed in the final full run, desktop and mobile Chromium                                                              |
| Production builds      | NestJS and Next.js passed, including all new project routes                                                               |
| Local smoke check      | Readiness 200; anonymous workspace request redirects to login with 307                                                    |
| Visual review          | Desktop/mobile list and form screenshots captured; project lists inspected                                                |

The project browser journey creates a real account and project, edits and reloads it, archives it, verifies filtering, and restores it. Additional cases cover an edit conflict between two tabs, missing projects, and preservation of input after an aborted save. Backend tests deny another user's reads, edits, archival, restoration, and cursor access. Test accounts and their projects are removed after each run.

The first browser attempt after resuming required restarting PostgreSQL. Initial cold-route runs exceeded the default 30-second journey budget and 5-second assertion budget (one edit route took 5.2 seconds). The final configuration uses two workers, 10-second assertions, and a 60-second budget only for the long project lifecycle journey; the complete final run passed without retries in 1.3 minutes.

Snapshots `projects-preview.png` and `projects-mobile-preview.png` show disposable test data, not seeded development accounts. Browser tests use a separate test database and ports 3100/4100. GitHub Actions, Docker, production TLS ingress, and deployment have not been executed here. Multiplayer and analytics remain for later phases. See [projects.md](projects.md) for design decisions and limitations.

## Milestone 2 record

Verified on 26 October 2026 with Node.js 24.12.0 and real PostgreSQL 18.4 on Windows.

| Check                  | Result                                                              |
| ---------------------- | ------------------------------------------------------------------- |
| ESLint and TypeScript  | Passed                                                              |
| Unit/HTTP tests        | 5 passed: configuration, credential validation, CSRF crypto, health |
| PostgreSQL integration | 12 tests passed (two top-level tests, ten auth subtests)            |
| Playwright             | 10 passed across desktop and mobile Chromium                        |
| Production builds      | Next.js and NestJS passed                                           |
| Dependency audit       | No known vulnerabilities reported; Multer patched to 2.5.0          |
| Clean-install metadata | `npm ci --dry-run --ignore-scripts` passed                          |
| Visual review          | Registration inspected in the local browser; `auth-preview.png`     |

Authentication integration checks exercise a real HTTP server and test database: denied anonymous access, public health, origin/CSRF enforcement, validation, safe parser errors, Argon2id storage, hashed tokens, session rotation, logout/replay, expiry, fabricated cookies, and concurrent rate limits. Browser tests register a unique account, reload the protected workspace, sign out, verify denied access, and sign back in. Test-owned users are cleaned up.

The registration/login flows use the real Next.js proxy and NestJS API. Readiness UI tests still stub responses to exercise outages. Production HTTPS cookie configuration is unit-tested, not verified through a deployed TLS ingress. Docker and GitHub Actions have not been run on this workstation. Local checks require permission to bind/connect to loopback; the default sandbox blocks that traffic.

Project CRUD, multiplayer simulation, analytics, email verification, password recovery, and public deployment remain outside this phase. See [authentication.md](authentication.md) for trade-offs and launch limitations.

## Milestone 1 record

Verified locally on Windows with Node.js 24.12.0 and PostgreSQL 18.4.

| Check                                | Result                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| ESLint                               | Passed                                                                                            |
| TypeScript checking                  | Passed                                                                                            |
| API/configuration tests              | 2 passed                                                                                          |
| PostgreSQL integration suite         | 1 passed, covering migrations, constraints, HTTP readiness, absent schema, and connection failure |
| Playwright                           | 6 passed across desktop Chromium and mobile Chromium emulation                                    |
| Production builds                    | Next.js and NestJS passed                                                                         |
| Actual web page                      | HTTP 200                                                                                          |
| Actual same-origin readiness request | HTTP 200, database up                                                                             |
| Visual inspection                    | Local preview showed successful readiness; snapshot in preview.png                                |

The initial sandbox run blocked localhost connections and one generated Next.js output directory. Those checks were rerun successfully with the required local execution permissions.

Docker is not available on this workstation. The Compose configuration and GitHub Actions workflow are prepared but have not been executed here. Database checks used real PostgreSQL from the project-local development helper. GitHub Actions expects the portal folder to be the repository root, as documented in README.md.

The browser suite stubs health responses to verify UI states deterministically. The integration suite and separate real HTTP smoke request verify the backend and proxy; the stubbed browser tests alone are not proof of backend correctness.

No authentication, project CRUD, session simulation, or analytics functionality is claimed in this milestone.
