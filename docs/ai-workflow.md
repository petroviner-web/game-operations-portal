# AI-assisted engineering record

This project uses AI assistance openly. This record describes assistant actions, not a claim that the applicant independently authored or reviewed every line. Before an interview the applicant should review the changes and be able to explain the decisions below.

## Scope and decisions

The user approved project activity history, container delivery and an AI workflow record after comparing the project with the Tools & Portals internship. AI assistance inspected the existing services, proposed changes, wrote implementation and tests, and ran available checks. The user selected the product direction. Human code review remains pending.

Activity writes use the same PostgreSQL transaction/client as the underlying change. Failed operations roll back both. Repeated archive/session transitions and duplicate membership additions do not produce false events. Read access is owner-only because membership history contains account identities. No passwords, tokens or request payloads are recorded. There is no fabricated history for changes predating the migration.

The container design reuses the existing release supervisor rather than changing API network exposure. The initial idea of separate web/API containers was revised after inspecting the enforced loopback contract. Docker is unavailable locally: a CI smoke job is provided, and image execution is not claimed without a successful run.

## Example correction during implementation

A Python edit initially used the Windows default encoding and failed on a Unicode arrow in a TSX file. The failure was observed in tool output, and the change was applied explicitly rather than assuming success. Verification also checks that migration readiness advances with the new table.

## Review checklist for the applicant

- Explain why audit insert and business mutation must commit together.
- Trace an unauthorized activity request from session guard to owner check.
- Explain cursor ordering, timestamp precision and pagination under new writes.
- Demonstrate a failed edit and show that no success event is recorded.
- Explain the local TLS certificate, secure cookies and container network boundaries.
- Identify which code was AI-assisted and which decisions you personally reviewed.

Never submit secrets or production account data as AI prompts. Review generated code and actual test output; distinguish unexecuted checks from passing checks. Keep changes reviewable through Git diffs and PRs.
