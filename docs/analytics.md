# Milestone 5 — Project analytics

Open a project and choose **View analytics**. The dashboard shows historical session activity for a selected UTC date range and a separate snapshot of the project's current running sessions and connected test players. It works for both active and archived projects.

## Metric definitions

| Metric                 | Definition                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| Sessions created       | Sessions with `created_at` in the selected period, including lobbies later cancelled                         |
| Sessions started       | Sessions with `started_at` in the selected period, regardless of their present state                         |
| Sessions completed     | Sessions with `end_reason = COMPLETED` and `ended_at` in the selected period                                 |
| Average duration       | Mean of `ended_at - started_at` for that completion cohort; full duration, not clipped to the period         |
| Daily session starts   | Start events grouped by UTC calendar date; missing days explicitly return zero                               |
| Running sessions       | Sessions currently in RUNNING, independent of the historical date filter                                     |
| Connected test players | Participant rows with `left_at IS NULL` in LOBBY/RUNNING sessions, independent of the historical date filter |

A session created yesterday, started yesterday and completed today contributes to today's completion count and full duration, but not today's created or started count. Consequently, starts and completions do not have to match. Cancelling a lobby counts as creation but never as a completed session or duration sample.

No completed sessions yields `averageDurationSeconds: null`; a genuine zero-second duration yields `0`. The API rounds the average to three decimal places; the UI formats it in seconds, minutes or hours. Current player counts describe synthetic connections, not unique people, daily active users, retention, latency, or physical network presence.

## Dates and endpoint

`GET /api/v1/projects/:projectId/analytics`

Query parameters: `from=YYYY-MM-DD&to=YYYY-MM-DD`. Both are required when either is supplied. The interval is **[from midnight UTC, to midnight UTC)**: the start is included and the end excluded. This lets adjacent ranges meet without double counting. The UI explicitly labels the end as excluded and explains how to include the final day.

Omitting both dates defaults to seven UTC calendar days including today so far; `to` is tomorrow. The dashboard also offers a 30-day preset. Explicit ranges must span 1–90 calendar days. Invalid calendar dates, repeated query parameters, timestamps instead of dates, unknown keys, reversed/empty ranges, and ranges longer than 90 days return 400 with `INVALID_ANALYTICS_RANGE`. Year zero is rejected because PostgreSQL dates do not support it.

The route requires the existing login session. It is read-only and needs no mutation CSRF header. Missing authentication returns 401. Invalid project UUIDs return 400; another owner's project and an absent project both return 404. Existing request tracing may add a distinct `requestId` to each error. All responses use `Cache-Control: no-store`.

Successful JSON has this shape:

```typescript
{
  project: { id: string, name: string, state: 'active' | 'archived' },
  range: { from: string, to: string, timeZone: 'UTC', endExclusive: true },
  summary: {
    createdSessions: number,
    startedSessions: number,
    completedSessions: number,
    averageDurationSeconds: number | null
  },
  current: { runningSessions: number, activePlayers: number },
  dailyStarts: Array<{ date: string, count: number }>,
  generatedAt: string // UTC snapshot timestamp
}
```

`dailyStarts` is chronological and contains every day in the interval. Its count sum equals `summary.startedSessions`. Archived projects retain their history. Date filters do not affect the `current` object.

## SQL and consistency

No migration or additional dependency is required: `game_sessions` and `session_participants` already preserve the facts needed for these metrics. The existing project/session indexes support this MVP; persisted counters would add write paths and synchronization risks before there is a demonstrated need.

A single SQL statement first scopes the project by the authenticated owner and UUID. Every session and participant aggregate derives from that scope. Counts, average, daily values, project state, current metrics and the snapshot timestamp are returned together, using one PostgreSQL statement snapshot. This avoids totals and charts observing different committed states during a concurrent session transition. Reads do not acquire application row locks.

Date boundaries and grouping explicitly use UTC, independently of the PostgreSQL connection time zone. The calendar is generated with integer day offsets, which avoids daylight-saving shifts in timestamp stepping. Comparisons stay in PostgreSQL, preserving microseconds at the exclusive end boundary. Tests run the analytics API's database connections in `America/Los_Angeles` while asserting UTC output across the European DST weekend.

The query scans the scoped project's session history and uses conditional aggregates. The 90-day cap bounds returned daily rows, **not** the number of historical sessions scanned. The existing statement timeout bounds execution time. This is appropriate for a local portfolio MVP; it is not a claim of benchmarked production scalability. At larger volumes, inspect query plans, consider date/state indexes and daily rollups, then choose a refresh policy that makes data staleness explicit. No cache, background aggregation, or materialized views are introduced in this slice.

## Presentation choices

Next.js loads analytics on the server without caching. The range form uses GET parameters, so a filtered view is bookmarkable and works with ordinary navigation. Invalid ranges retain valid date input and focus the error message. API outages show a recovery state instead of fabricated zero metrics. Refresh reloads the document and updates the snapshot; there is no background polling or claim of live streaming.

The page preserves the portal's existing dark palette and spacing. Local UI/UX guidance supported timestamped operational data and an accessible table alongside charts. Its landing-page and glass styling suggestions did not fit the established interface. Discrete daily counts use a small SVG bar chart with a zero baseline and visible scale, rather than a smoothed trend implying measurements between days. There is no new charting dependency. The expandable table exposes exact values to keyboard and screen-reader users; understanding the chart never requires hovering or distinguishing colors.

## Verification and review

Integration cases cover empty projects, owner isolation, strict date validation, equal/exclusive microsecond boundaries, UTC grouping on a non-UTC database connection, cancelled sessions, different creation/start/completion cohorts, full-run average duration, zero duration, archived history, and independent current metrics. Unit tests cover default windows at year/leap boundaries and the 90-day cap.

Browser cases verify the real API and test database, known daily values, GET filtering, a zero-activity day, keyboard access to the data table, focused range errors, missing projects, refresh after an actual start/end transition, and archived metrics. Fixtures and screenshots use disposable test data, not seeded development history.

Before the release phase, review:

1. Why can the number of completed sessions exceed the number started in the same period?
2. Explain why `BETWEEN` is inappropriate for adjacent half-open date ranges.
3. Which operations would produce inconsistent cards if each metric used a separate SQL query?
4. Why must no completed sessions return null rather than a fabricated average of zero?
5. Explain why connected test players is neither DAU nor a count of distinct people.
6. Identify what would change with daily rollups: write/refresh complexity, index strategy and stale-data semantics.

The next phase is release preparation: operational review, production configuration and deployment planning. Deployment itself has not been performed.
