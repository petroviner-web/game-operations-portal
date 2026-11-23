# Local production-mode container demo

Requires Docker Engine with Compose v2. From the repository root:

```sh
node scripts/setup-env.mjs
docker compose --env-file .env -f infra/compose.app.yaml up --build -d --wait
```

Open https://localhost:8443. Caddy uses its local CA; the browser will require trusting that local certificate. Export the CA using `docker compose --env-file .env -f infra/compose.app.yaml cp https:/data/caddy/pki/authorities/local/root.crt ./local-demo-ca.crt` and trust it only for your local demo environment. The CI readiness check uses curl -k solely against this loopback demo.

The multi-stage image runs the existing supervised Next.js + NestJS release as the unprivileged node user. Keeping both in one container deliberately preserves the existing loopback API contract and release supervisor. Only Caddy is published, on loopback. PostgreSQL and the API are not exposed to the host. Startup applies migrations before serving traffic; failed child processes stop the sibling. Production cookie security remains enabled.

This Compose file is a local demonstration, with fixed local database credentials, persistent isolated volumes and a generated CSRF secret. Do not deploy it unchanged to the internet. Real hosting needs externally supplied credentials, trusted TLS, backups and an image/version rollout policy. No cloud resources are provisioned.

```sh
# Inspect readiness/logs
docker compose --env-file .env -f infra/compose.app.yaml ps
docker compose --env-file .env -f infra/compose.app.yaml logs portal
# Stop, preserving data
docker compose --env-file .env -f infra/compose.app.yaml down
```

The Container smoke test workflow builds the image and checks HTTPS readiness and HTML. Authentication, authorization and activity behavior are tested separately by the application's browser/integration tests. Docker is not installed on the authoring host; container execution must be verified by CI or a Docker-equipped machine.
