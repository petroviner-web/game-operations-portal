# Milestone 3 — Game projects

An authenticated developer can create, list, inspect, edit, archive, and restore their own game projects. The workspace now uses real API data, with active/archived views, pagination, empty states, accessible form feedback, and conflict recovery. No game files, engine integration, team sharing, multiplayer sessions, or analytics are included in this slice.

## Schema and ownership

Migration `003_projects.sql` adds `projects`:

| Column        | Meaning and constraint                                |
| ------------- | ----------------------------------------------------- |
| `id`          | Generated UUID primary key                            |
| `owner_id`    | Required user FK; cascade on user deletion            |
| `name`        | Trimmed, nonempty text, at most 100 characters        |
| `description` | Text, at most 2,000 characters; defaults to empty     |
| `engine`      | `UNREAL`, `UNITY`, `GODOT`, or `CUSTOM`               |
| `version`     | Positive integer, starts at 1; increments on change   |
| `created_at`  | Immutable creation time, PostgreSQL `timestamptz`     |
| `updated_at`  | Time of the latest change                             |
| `archived_at` | Null for active projects; otherwise archive timestamp |

Names do not have to be unique; URLs use immutable UUIDs. The engine is organizational metadata, not a runtime integration. Displayed dates use UTC. API validation and database constraints both enforce important bounds. TypeScript alone cannot validate incoming JSON.

The authenticated session supplies the owner ID. Request bodies cannot set or change it. Every read and mutation uses both `owner_id` and `id`; another user's project and a nonexistent project receive the same 404. UUIDs make IDs less predictable but do not replace authorization. The Next.js layout is a presentation check, while Nest's session guard and owner-scoped queries remain the security boundary for every request.

## API contract

All endpoints are under `/api/v1/projects` and require a session. Mutations also require the existing CSRF cookie/header and exact Origin. Responses use `Cache-Control: no-store`.

| Method and path     | Input                                                                    | Success                     |
| ------------------- | ------------------------------------------------------------------------ | --------------------------- |
| `POST /`            | `{ name, engine, description? }`                                         | 201 `{ project }`           |
| `GET /`             | `state=active\|archived\|all`, `limit=1..50`, `cursor=<UUID>`            | 200 `{ items, nextCursor }` |
| `GET /:id`          | Project UUID                                                             | 200 `{ project }`           |
| `PATCH /:id`        | `{ version, name?, engine?, description? }`, at least one editable field | 200 `{ project }`           |
| `POST /:id/archive` | `{ version }`                                                            | 200 `{ project }`           |
| `POST /:id/restore` | `{ version }`                                                            | 200 `{ project }`           |

Project JSON includes `id`, `name`, `description`, `engine`, `state`, `version`, `createdAt`, `updatedAt`, and `archivedAt`. Owner IDs are not included. Unknown body/query fields, invalid UUIDs, empty patches, and out-of-range values return 400. Missing sessions return 401 after CSRF validation on mutations; invalid CSRF returns 403. Inaccessible projects return 404. Stale versions or edits to archived projects return 409.

An empty description explicitly clears the field. Omitted PATCH fields retain their values. There is no hard-delete endpoint.

## Concurrency and archival

Updates acquire a row lock using `SELECT ... FOR UPDATE` inside a short transaction, compare the submitted version, and write the change with `version + 1`. Two edits based on version 1 cannot both succeed: the first commits version 2, and the second receives `VERSION_CONFLICT` (409). The browser preserves the losing draft and offers an explicit reload that discards it. We do not merge text automatically.

Archive and restore use the same lock and version check, so they serialize with editing. Archived projects remain readable but cannot be edited. Repeating an already-applied archive/restore returns the current project without incrementing its version; this makes immediate retries safe when the first response was lost. A transition to a different state still requires the current version.

This combines short database locks with optimistic version checks: locks keep server transitions atomic, while versions protect the user's older form. It costs a transaction and extra query compared with a simple update. For a small developer portal, explicit lifecycle logic is easier to inspect than a complex conditional update.

Milestone 4 adds an archive prerequisite: all game sessions must be ENDED (completed or cancelled). Open lobbies/running sessions return `OPEN_SESSIONS` (409). Project-first locks coordinate this check with session creation and mutations. See [sessions.md](sessions.md).

## Pagination and indexes

Lists default to active projects and 12 items, ordered by `(created_at DESC, id DESC)`. A response with more results returns the last displayed UUID as `nextCursor`; the next query looks up that cursor's creation tuple within the same owner. Timestamps stay in PostgreSQL, avoiding JavaScript millisecond truncation of PostgreSQL microseconds. The UUID breaks equal-timestamp ties.

The database indexes owner/creation/ID, with a smaller partial index for active projects. Keyset pagination avoids increasing OFFSET costs and duplicate rows caused by new projects inserted ahead of the current page. It supports next-page and restart navigation, not arbitrary page numbers or an exact total. Filter changes restart from the first page. Concurrent archive/restore can change membership between requests; this is a live list, not a snapshot. Invalid or foreign cursors return the same 400 response.

## Frontend choices and limits

List/detail/edit pages fetch from Nest on the server without caching. Forms and lifecycle buttons use client components for feedback. Successful REST mutations navigate to a fresh document to discard previously visited project views; this trades a full page load for simple cache consistency. A future Next.js server-action boundary could invalidate specific routes instead.

Network failures preserve form input and explain that a save may have succeeded before the response was lost. Creation is not idempotent, so users should inspect their project list before retrying an ambiguous create. Archive/restore are reversible and described next to their buttons, with no destructive confirmation dialog.

The form does not autosave drafts or warn when navigating away. Creation quotas, shared teams, and production edge rate limiting are future work; the authentication module's existing login limiter does not limit project creation. Keep the local MVP behind its current loopback boundary until deployment controls are designed.

## Review checkpoint

1. Trace an attempted edit by another user from the session guard to the SQL WHERE clause. Why is filtering only in the UI insufficient?
2. Explain why a row lock alone would still allow a stale form to overwrite a newer edit without the version check.
3. Explain the difference between a repeated archive and a stale edit, including their response codes.
4. Follow two pages with equal creation timestamps and explain why the UUID tie-breaker is needed.
5. Before adding multiplayer, decide which session operations an archived project should forbid and how project/session locks will be ordered.
