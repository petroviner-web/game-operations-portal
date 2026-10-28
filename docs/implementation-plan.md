# Incremental implementation plan

## Milestone 1 — Foundation (implemented)

- npm workspace with Next.js and NestJS applications.
- Strict TypeScript, lint, production builds, and CI definition.
- PostgreSQL via Docker or a local development helper.
- Transactional, checksummed initial migration.
- Live readiness UI with recovery, keyboard focus, and narrow-screen layout.
- HTTP contract tests, real-database integration tests, and browser tests.

Review the code and verification results before extending the scope.

## Milestone 2 — Authentication (implemented)

Implemented sessions, registration, Argon2id passwords, login/logout/me, expiration, cookie configuration, CSRF/origin protection, and database rate limiting. The workspace checks sessions on the server. See [authentication.md](authentication.md) for contracts and trade-offs and [verification.md](verification.md) for results. Review this checkpoint before adding project ownership.

## Milestone 3 — Game projects (implemented)

Implemented `projects` and owner-scoped queries, creation, listing, detail, editing, archival, and restoration. Updates protect against stale drafts with version checks and row locks. Tests cover cross-user access, equal-timestamp pagination, validation, and archived behavior. See [projects.md](projects.md) for API contracts, limitations, and review exercises.

## Milestone 4 — Multiplayer simulation (implemented)

Implemented game sessions and participant history, LOBBY → RUNNING → ENDED, lobby cancellation, capacity, minimum two players, retry-safe joins, and departures. Project/session row locks serialize lifecycle and capacity changes and prevent archive/create races. The desktop/mobile interface uses real REST data and manual refresh. See [sessions.md](sessions.md) for contracts, trade-offs, and review exercises.

## Milestone 5 — Analytics (implemented)

Implemented per-project analytics: creation/start/completion counts, UTC daily starts, average completed-session duration, running sessions and connected test players. One owner-scoped SQL snapshot separates historical event cohorts from current state. The dashboard includes 7/30-day presets, custom 1–90-day ranges, an SVG chart and an accessible daily table. See [analytics.md](analytics.md) for metric definitions, tests and review exercises.

## Milestone 6 — Release (implemented)

Added the Render Free + Neon Free release configuration, supervised production start, bounded migrations and an HTTPS production browser journey covering sign-in through analytics and logout. Existing accessibility coverage remains in the desktop/mobile suite. Deployment instructions and limitations are in [deployment.md](deployment.md). The portal is deployed on Render Free with Neon Free, and the public HTTPS/API journey passed on 28 October 2026. The final slice adds structured request logs with safe route templates, status/duration/outcome, no request payloads and tests for correlation, redaction and disconnects. The landing page reflects the completed MVP and supports direct registration. [Operations](operations.md) and [demo/review notes](demo-and-review.md) complete the handoff; [verification.md](verification.md) distinguishes local checks from deployed evidence. No schema change, paid monitor or keep-alive job is introduced. Load guarantees, automatic alerting and backup restoration are outside this MVP.

## Design decisions

The status page uses a restrained dark operational palette, green for verified availability, amber for dependency problems, visible keyboard focus, and reduced-motion support. Local UI/UX guidance matched a minimal dashboard style; its marketing/FAQ page layout suggestions were not a fit, so the layout follows the status-and-roadmap task. Status is always conveyed in text as well as color.

Keep code and the UI in English for interview discussion. Implementation notes can be discussed in Serbian.
