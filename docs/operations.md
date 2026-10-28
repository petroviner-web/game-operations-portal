# Operating the portfolio demo

Scope: one Render Free Node service, one Neon Free database. This is a demonstrable MVP, not a highly available game backend. No paid monitoring, scheduled keep-alive traffic or new external log destination is required.

## Find a failing request

1. In the browser's Network panel, select the failed `/api/v1/...` request and copy its **response** `X-Request-Id`. API error JSON also contains `requestId`. Do not copy cookies, authorization headers or request bodies into tickets.
2. Open the Render `gameops-portal` service's **Logs**, choose the failure's time window and search for that ID. Production Nest logs use JSON. The `HttpRequest` context's `message` contains the request event.
3. Read `statusCode`, `route`, `durationMs` and `outcome`. The route is the registered template, e.g. `/api/v1/projects/:id`; unknown paths and requests rejected before routing appear as `unmatched`.
4. Compare `/api/v1/health/live` and `/api/v1/health/ready`. Live 200 with ready 503 points to the database/schema dependency. Neither responding can indicate wake-up, build/start failure or the hosting proxy. Requests that never reach Nest do not have its request ID/log.

Request completion events include exactly `event`, a server-generated `requestId`, bounded `method`, registered `route`, `statusCode`, `durationMs` and `outcome`. Nest adds timestamp, level, process ID and context. Incoming IDs are ignored. No raw URL/query, route parameter values, body, cookies, headers, email, user/IP address, SQL or exception message is recorded by this telemetry. 2xx/3xx use log, 4xx use warn and 5xx use error. A socket closing before finish uses warn, `outcome=aborted` and `statusCode=null`; it is not counted as a successful 200. One response produces at most one event, even when finish and close both fire. Finish means Node handed the response to the transport, not proof the browser consumed it.

All API completions, including health probes, are logged. This deliberately favors simple diagnosis at demo volume; log volume and retention are bounded by the hosting plan. There is no durable audit trail, metrics store, distributed tracing or automatic alerting. Platform access/build logs are separate and must be reviewed under the provider's controls. See [Nest JSON logging](https://docs.nestjs.com/techniques/logger) and [Node HTTP events](https://nodejs.org/api/http.html#event-finish_2).

## Triage without making the incident worse

| Symptom | First action |
| --- | --- |
| First visit is slow after idle | Allow Render to wake. Retry once the loading screen finishes; do not create keep-alive jobs. |
| Ready 503, live 200 | Check Neon status and Render startup/migration messages. Verify secret variable names and TLS configuration without printing their values. Do not reset the database. |
| 401 | Sign in again. Check cookie presence/flags locally; do not paste their values. |
| 403 mutation | Reload to renew CSRF state; confirm the browser is on the configured HTTPS origin. Do not disable origin/CSRF checks. |
| 409 | Refresh stale project/session state and retry deliberately. A version or lifecycle conflict is expected behavior. |
| 429 | Stop retrying and wait for the rate-limit window. The demo shares a peer budget behind the Next.js proxy. |
| Repeated 5xx or growing duration | Match request IDs and route/status trends. Inspect deploy timing, database availability and resource limits before changing code. |
| Build/start fails | Inspect the failed stage, compare build/runtime API ports, migration state and required variables. Keep the last working deployment available. |

## Release and rollback

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:release`, the real-database integration suite, the production HTTPS journey and affected desktop/mobile browser journeys. Use only the disposable `_test` database for automated writes. Save results in [verification.md](verification.md). CI is defined but execution must be checked separately; a local pass is not a CI pass. On a private repository, confirm the included Actions quota before enabling runs. Existing initial publication commits used `[skip ci]` for the zero-cost constraint.

Upload only reviewed source/docs/config changes to the private portal repository; no `.env`, `.local`, build/test output or surrounding thesis files. Use Render's manual deploy for the reviewed commit. Confirm Live, readiness and the changed behavior over public HTTPS. No automatic deployment is configured. If the new version is unhealthy, use the hosting rollback/redeploy controls for the last known good commit, checking plan availability before confirming. Record the selected commit. Do not change plans to obtain a rollback feature; redeploy an approved compatible revision instead.

Code rollback does **not** undo SQL migrations. This final slice changes no schema. Future schema changes require a private `pg_dump` backup and a successful restore into a separate empty database first. Keep credentials in a password file/secret store, not command history, and keep dumps out of Git. Rehearse ownership, row counts, readiness and sign-in after restore. Never restore over the live database as a test. Backup/restore has not been executed for this MVP, so recovery time/data-loss guarantees are not claimed.

## Before a live interview

Open the demo shortly before the interview to allow normal wake-up. Sign in with your own demo account, prepare an empty project, and keep [the demo outline](demo-and-review.md) ready. Avoid personal or customer data. If hosting is unavailable, use the same application locally; explain the Free-tier trade-off honestly.
