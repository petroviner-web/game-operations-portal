# Milestone 2 — Authentication

This slice provides registration, login, logout, current-user lookup, and a protected workspace. It stops before project CRUD.

## Request flow

1. The browser requests `GET /api/v1/auth/csrf`. Nest sets an HttpOnly CSRF cookie and returns its signed value in JSON.
2. The browser submits credentials with same-origin cookies, `Origin`, and `X-CSRF-Token`.
3. Global guards verify origin/CSRF, then the endpoint rate limiter runs before validation and password hashing.
4. Nest creates a random 256-bit session token. PostgreSQL stores only its SHA-256 hash; the browser receives the raw token only through an HttpOnly cookie.
5. Next.js reads the cookie server-side and requests `/auth/me` with `cache: no-store` before rendering account data.
6. Logout deletes the database session and clears both cookies. A replayed token fails authentication immediately.

API responses use `no-store`. Unexpected errors return a generic message and request ID. Logs omit request bodies, credentials, and database diagnostics. JSON bodies are limited to 8 KB, with safe 400/413 errors for malformed/oversized input.

## API contract

Paths are relative to `/api/v1`. `user` contains only `id`, `email`, and ISO `createdAt`.

| Method and path       | Input                                             | Success                                | Main failures                                        |
| --------------------- | ------------------------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| `GET /auth/csrf`      | Existing cookies if available                     | 200 `{ csrfToken }`, CSRF cookie       | 403 foreign origin                                   |
| `POST /auth/register` | `{ email, password }`, CSRF header/cookie, Origin | 201 `{ user }`, session cookie         | 400 validation, 403 CSRF, 409 duplicate, 429 limit   |
| `POST /auth/login`    | Same shape and headers                            | 200 `{ user }`, rotated session cookie | 400 validation, 401 credentials, 403 CSRF, 429 limit |
| `POST /auth/logout`   | CSRF header/cookie and Origin                     | 204, cookie clearing                   | 403 CSRF                                             |
| `GET /auth/me`        | Session cookie                                    | 200 `{ user }`                         | 401 missing/expired/invalid session                  |

Logout is idempotent and does not require a valid login, but still requires CSRF protection. CLI clients must keep a cookie jar, request a CSRF token, and send the configured Origin on mutations. Errors include `statusCode`, `message`, and `requestId`; validation errors also include `fieldErrors`. Rate-limit responses include `Retry-After`.

Registration requires a 12–128 character password; login accepts 1–128 characters. Email is trimmed and lowercased as a product identity policy. Passwords are never trimmed. Unknown request fields are rejected. Login gives the same error for a missing account and wrong password, and verifies a dummy hash for missing accounts.

## Schema

| Table              | Columns and constraints                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `users`            | UUID PK, unique `email_normalized`, Argon2id `password_hash`, `created_at`                                                                |
| `auth_sessions`    | UUID PK, `user_id` FK with cascade delete, unique 64-character `token_hash`, `created_at`, `expires_at > created_at`; user/expiry indexes |
| `auth_rate_limits` | HMAC `key_hash` PK, positive `attempts`, `resets_at`; expiry index                                                                        |

User creation and session issuance are one transaction. Login rotates the presented session in a transaction; other devices remain signed in. Sessions expire after seven days without sliding renewal. The API checks expiry on every request. Cleanup removes expired sessions/counters every 15 minutes; expiry enforcement does not depend on cleanup.

## Decisions and trade-offs

**Opaque sessions instead of JWTs.** A database lookup adds latency and makes authentication dependent on PostgreSQL, but logout and future account revocation are straightforward. The portal already requires the database. JWTs would add expiry/revocation complexity without a current distributed-consumer requirement.

**Argon2id passwords.** Parameters are 19,456 KiB memory, two iterations, parallelism one. Hashing runs outside transactions to avoid holding database connections during expensive work. The native package adds platform requirements; measure production capacity before raising work factors or exposing public traffic.

**Cookies and CSRF.** Cookies use HttpOnly, SameSite=Lax, Path=/; production adds Secure and the `__Host-` prefix without Domain. A signed double-submit CSRF token is bound to the current session, expires after one hour, and must match the header and cookie. Mutations require the exact APP_ORIGIN. Valid CSRF cookies are reused to reduce cross-tab churn. Session changes clear the CSRF cookie. These controls do not prevent same-origin XSS.

**Database rate limits.** Atomic upserts enforce ten credential attempts per normalized email and 100 per direct socket peer per 15-minute fixed window, including successful attempts. Counts persist across API processes. HMAC keys avoid storing raw emails/IPs in counters. No Redis is needed, but fixed windows permit boundary bursts and account limits can temporarily block legitimate users.

**Proxy limitation.** Next.js forwards calls through one peer address, so the peer budget is shared across local users. Client-supplied X-Forwarded-For is not trusted. Before public deployment, configure a verified ingress identity boundary and per-client quotas there. Blindly enabling trust proxy would allow spoofing.

**UI and caching.** Forms support password managers, paste, visibility controls, inline errors, and a focused error summary. Full document navigation after login/logout discards Next's client router cache after Nest changes cookies. This costs a page load but makes the auth boundary explicit. The workspace fails closed if session lookup is unavailable and offers retry without discarding the cookie.

**Scope limits.** Duplicate registration returns 409, revealing that an address is registered despite generic wording. Email verification, password reset, MFA, global device logout, and an audit trail are not implemented. Verification/recovery need an email provider and a separate token lifecycle. This is a local interview MVP, not a complete public account service.

## Review checkpoint

The root npm override pins Nest's transitive Multer dependency to 2.5.0 for advisory GHSA-q7qp-rjg7-q26m. This application has no upload routes. Keep the patch until the Nest dependency range includes a fixed release; update the lockfile and rerun integration tests when changing it.

Trace registration through guards, rate limiting, validation, the service transaction, and the response cookie. Explain why a database leak does not directly yield usable session tokens, why a stolen live cookie still authenticates, and why projects must query by both project ID and authenticated owner ID. Run integration tests when changing these boundaries.
