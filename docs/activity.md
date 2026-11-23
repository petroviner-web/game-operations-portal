# Project activity

GET /api/v1/projects/:id/activity is authenticated and owner-only. Non-owners receive 404. Optional action is one of the ten event names in activity.ts; limit is 1–50 (default 20); cursor is a recorded event UUID belonging to the same project. Invalid filters/cursors return 400. Newest events are first, ordered by database timestamp and UUID; timestamp comparison stays in PostgreSQL without JavaScript precision loss. Changing the UI filter resets pagination.

Migration 006 creates the table and indexes; readiness now requires it. Mutations record the authenticated actor in their existing transaction. Project creation is now transactional too. Failed mutations do not create success records; repeated lifecycle transitions and no-op membership changes do not duplicate history. Player joins/departures are outside this initial scope.

The UI links from project details for owners and supports empty, invalid, unavailable and paginated views. Archived projects retain history. Events begin when the migration is enabled, with no invented backfill. Target UUIDs identify affected members or sessions. Actor email is resolved from the current account; deleted accounts show Deleted account. Project deletion cascades its history; this is operational history, not a tamper-proof compliance ledger. There are no public update/delete endpoints for events.

Verification includes API behavior through Playwright, filter UI and mobile overflow checks. Existing integration tests exercise project/session authorization and rollback paths. A production database requires applying migration 006 before the new API starts serving traffic.

Local verification (2026-11-23): production build passed; 43 integration checks passed; new activity desktop/mobile browser scenarios passed. Docker execution remains unverified locally because Docker is unavailable. Next.js 16.4.3 emitted a security advisory; dependency remediation is a separate outstanding task.
