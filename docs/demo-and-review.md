# GameOps: demo and engineering review

## Five-minute demo

1. **0:00–0:40 — Problem and architecture.** “I built a developer portal for managing game projects, simulating multiplayer sessions and examining session activity.” Show live readiness. Explain browser → Next.js → NestJS → PostgreSQL, with same-origin API requests and server-owned authorization.
2. **0:40–1:30 — Identity and projects.** Create your own account, then create an Unreal project. Edit it and explain owner-scoped queries and version checks. Do not show passwords or hosting secrets on screen.
3. **1:30–2:40 — Simulation.** Open a lobby with capacity two, add two synthetic players, start the session and end it. Explain that this is a REST lifecycle simulator; it does not implement actual game networking or matchmaking.
4. **2:40–3:30 — Analytics.** Show starts/completions and average duration with a date filter. Explain UTC buckets, historical cohorts versus currently connected players and why no duration data is represented by null.
5. **3:30–4:30 — Reliability.** Show the automated checks and one Network response request ID. Explain safe structured logs, readiness versus liveness, transaction locks, idempotent joins and protected test databases.
6. **4:30–5:00 — Trade-offs.** One free service is simple and economical, but both Node processes share resources and restart together. Free hosting can sleep. Finish with one justified next improvement, such as reliable client-aware edge rate limiting or password recovery.

Use an existing account if registration is unnecessary for the demo. Finish all demo sessions, archive disposable projects and sign out. Do not delete other users' data. The repository is private; do not claim interviewers can access it until you explicitly grant the intended access.

## Review questions — answer before reading the checkpoints

| Question | What a strong answer covers |
| --- | --- |
| Why separate Next.js and NestJS? | Presentation/server rendering versus API behavior; explicit boundary and validation; extra process/deployment complexity. |
| Why PostgreSQL and explicit SQL? | Constraints and transactions encode lifecycle invariants; parameterized queries; manual query/migration maintenance versus ORM convenience. |
| Can user A guess user B's project ID? | UUID unpredictability is not authorization. Every relevant query is owner-scoped; inaccessible records use the same response shape. |
| How do two players race for the last slot? | Transactional row locks serialize capacity checks and writes. Lock order and concurrency tests matter more than a browser-side counter. |
| What happens when a join response is lost? | A retry for the same player/session returns the existing participant instead of consuming another slot. |
| Why not put tokens in localStorage? | HttpOnly session cookies reduce script access; hashes at rest, secure production cookies, revocation, CSRF tokens and origin checks cover different risks. |
| What do tests prove? | Unit contracts, real PostgreSQL behavior, browser flows and production TLS are different layers. Stubbed UI readiness alone does not prove database health. |
| How would you investigate a 500? | Capture response request ID, correlate route/status/duration in logs, compare dependency health and deploy timing; avoid raw credentials/PII in logs. |
| Why not log full exception stacks? | Useful for diagnosis but may contain SQL, user data or credentials; this MVP favors a safe field allowlist and reproducible local debugging. Add classified internal error codes deliberately if needed. |
| What would you change at scale? | Separate process scaling, trusted edge/client rate limiting, query plans/indexes, load tests, durable monitoring and tested recovery, driven by measured bottlenecks. |

## Portfolio wording

“Built and deployed a TypeScript game developer portal with Next.js, NestJS and PostgreSQL: authenticated project management, transactional multiplayer session simulation, UTC analytics, automated API/database/browser tests and request-level observability.”

Use only results you can demonstrate. Do not invent traffic, uptime, latency improvements or Epic Games affiliation. This is an independent interview/learning project. Be able to explain and modify the implementation yourself, including where AI assistance was used.

## Deliberate MVP limits

No real-time transport, actual game server, matchmaking, team roles, email verification, password recovery, load/SLA guarantee, durable audit trail or automated monitoring. Backup restore has not been rehearsed. These are documented follow-up options, not unfinished claims within the six-milestone MVP.
