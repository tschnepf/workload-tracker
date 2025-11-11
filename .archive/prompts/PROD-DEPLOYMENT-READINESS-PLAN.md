# Production Deployment Readiness Plan — Workload Tracker

Scope
- Prepare the application, infrastructure, and team for first production release using the existing Docker Compose + Nginx + Django (Gunicorn) + React stack.
- Produce a clear checklist with owners, commands, and acceptance criteria. Keep changes minimal and leverage what’s already in this repo.

Outcomes (Definition of Done)
- Production stack builds and runs from pinned images; `make up-prod` serves the app over Nginx with TLS and returns 200 on `GET /api/readiness/`.
- Secrets and security flags are correctly set: `DEBUG=false`, cookie refresh mode on, OpenAPI gated, CSP enforced, secure cookies, and security headers present.
- CI passes: security scan, OpenAPI schema/type sync, e2e smoke; image build/publish pipeline green (or manual push documented).
- Backups enabled and tested; restore drill executed; read-only maintenance mode validated.
- Rollback plan documented and tested. Basic monitoring/alerting enabled (Sentry + request logs).

Non-Goals and Guardrails
- Do not run `make clean` or `docker compose down -v` on a production host; use distinct project/volume names for prod.
- Prefer a managed Postgres in production. The bundled `db` service in prod compose is staging-only unless hardened and configured with strong credentials.

References
- Runtime guide: PRODUCTION.md
- Extended notes: prompts/Production-Deployment-Guide.md
- Security: SECURITY-FINDINGS.md, prompts/SECURITY-REMEDIATION-PLAN-V1.md
- Nginx: nginx/sites-available/workload-tracker.conf
- Compose: docker-compose.yml, docker-compose.prod.yml
- CI: .github/workflows/*

Prompt — Phase 0: Pre‑Flight (Inventory & Baseline)
Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches. After edits, run the frontend type check/build to validate.
Quality rules: Only best-practice programming; no shortcuts or band‑aids; never remove code or functionality to make tests pass.

Context: Establish current state, verify build/run locally, and prepare safe project/volume isolation before making any code/config changes.

Tasks
- Verify required files exist before proceeding:
  - `.env.production.template` (prod env template)
  - `docker-compose.host-expose.yml` (only if using external host nginx)
  - TLS files `nginx/ssl/fullchain.pem` and `nginx/ssl/privkey.pem` (only if enabling built‑in HTTPS)
- Read `PRODUCTION.md` and `prompts/Production-Deployment-Guide.md`; list any drift to resolve later.
- Review `.github/workflows/` for security, OpenAPI, e2e, prod-guard.
- Verify dev vs prod Dockerfiles and compose targets.
- Run `make build-prod` then `make up-prod`; verify `curl -I http://localhost/` returns 200 and `curl -fsS http://localhost/api/readiness/` returns 200.
- Ensure prod isolation: set a distinct `COMPOSE_PROJECT_NAME` for prod and verify with `docker volume ls` the project prefix is unique (optionally suffix volumes like `postgres_data_v17_prod`). Do not run `make clean` on prod hosts.
- Run deploy checks: `manage.py check --deploy`, generate schema to `/tmp/schema.json`, and `showmigrations`. Optionally review `migrate --plan` on staging.
- Compose profiles sanity: confirm nginx is gated by profile — without `COMPOSE_PROFILES=proxy`, `docker compose config` should not render the nginx service; with it, nginx appears.

Validation
- Both health endpoints 200 via Nginx; readiness shows DB/Redis ok.
- No deploy-check errors; schema generation succeeds; migrations listed without unexpected surprises.
 - Required files present; compose profile behaves as expected; unique project prefix observed in volume names.

Prompt — Phase 1: Configuration & Secrets (Owners: App/Ops)
Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches. After edits, run the frontend type check/build to validate.
Quality rules: Only best-practice programming; no shortcuts or band‑aids; never remove code or functionality to make tests pass.

Context: Provide a production-safe env template, wire necessary flags, and document secrets handling.

Tasks
- Add `.env.production.template` (copy from `.env.example`, remove dev-only entries, keep placeholders).
- Include keys: `SECRET_KEY`, `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, `DATABASE_URL` (or `POSTGRES_*`), `REDIS_PASSWORD` (and optional `REDIS_URL`), `COOKIE_REFRESH_AUTH=true`, `AUTH_ENFORCED=true`, `OPENAPI_PUBLIC=false`, `JWT_ACCESS_MINUTES=20`, `CSP_ENABLED=true`, `CSP_REPORT_ONLY=false`, `CSP_REPORT_URI=/csp-report/`, `SECURE_SSL_REDIRECT=true`.
- Optional: DB TLS (`DB_SSLMODE=require`, `DB_SSLROOTCERT`), Redis TLS (`rediss://` or `REDIS_TLS=true`).
- Confirm frontend build args in prod compose: `VITE_COOKIE_REFRESH_AUTH="true"`, `VITE_API_URL=/api`.
- Add a brief note in `PRODUCTION.md` on secrets delivery (host env/SSM/Vault); remind to include apex and www in `ALLOWED_HOSTS` if used.
- Never use `.env.example` for production. CI should guard that `.env.production.template` sets `DEBUG=false` and uses a non‑default `SECRET_KEY` placeholder.

Validation
- `rg` shows `.env.production.template` present with placeholders, not secrets.
- Frontend `npm --prefix frontend run build` passes (type check).
 - CI guard for prod template passes (`DEBUG=false` enforced, `SECRET_KEY` not a dev default).

Prompt — Phase 2: Security Posture (Owners: Security/App/Ops)
Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches. After edits, run the frontend type check/build to validate.
Quality rules: Only best-practice programming; no shortcuts or band‑aids; never remove code or functionality to make tests pass.

Context: Ensure auth gating, CSP, headers, and Nginx limits are production-strong and consistent.

Tasks
- Verify `COOKIE_REFRESH_AUTH=true` and that refresh cookie flags are `HttpOnly; Secure; SameSite=Lax`.
- Confirm no refresh token in localStorage when cookie mode is on (frontend code path).
- Ensure OpenAPI/Swagger require auth in prod: `OPENAPI_PUBLIC=false` and Spectacular serve permissions.
- Align CSP string between backend settings and Nginx files; include fonts if used; keep HTTP free of HSTS, HTTPS with HSTS; ensure `Permissions-Policy` present once.
- Keep per-route body sizes: 2g for `/api/backups/upload-restore/`, 100m for import routes.
- Run security workflow in CI or locally per `SECURITY-FINDINGS.md`.

Validation
- `curl -I` shows CSP with no drift between dynamic/static, no HSTS on HTTP, HSTS on HTTPS, and single `Permissions-Policy` header.
- Anonymous `GET /api/schema/` returns 401/403 in prod.
 - `Set-Cookie` on auth/refresh operations includes `HttpOnly; Secure; SameSite=Lax`.

Prompt — Phase 3: CI/CD & Images (Owners: DevOps)
Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches. After edits, run the frontend type check/build to validate.
Quality rules: Only best-practice programming; no shortcuts or band‑aids; never remove code or functionality to make tests pass.

Context: Provide an automated image build/publish path; keep CI gates green; ensure Lighthouse config doesn’t assume webpack.

Tasks
- If absent, add `.github/workflows/docker-publish.yml` to build/push backend and frontend images with Buildx and proper tags (semver + SHA). Document required secrets.
- Ensure `security`, `openapi-ci`, and `e2e` workflows remain green.
- Review `lighthouserc.js` readiness pattern and switch to explicit health probing if necessary.

Validation
- A tagged push builds and pushes images; CI gates pass.
 - Lighthouse run completes without relying on webpack‑specific markers.

Prompt — Phase 4: Database & Backups (Owners: App/Ops)
Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches. After edits, run the frontend type check/build to validate.
Quality rules: Only best-practice programming; no shortcuts or band‑aids; never remove code or functionality to make tests pass.

Context: Ensure safe backup/restore with read-only guard and predictable migrations.

Tasks
- Prefer Django backup: `manage.py backup_database --compression gz`; update Makefile only if needed to parameterize user/db or to call Django command.
- Add/verify restore drill instructions using `manage.py restore_database` with confirmation and `--migrate`.
- Verify read-only mode (env or `.restore.lock`) blocks unsafe methods globally, while health/readiness remain reachable.
- Dry-run migrations on staging clone and document duration/impact.
- Verify `/backups` write permissions inside backend container and confirm timestamped archive naming convention in output (e.g., `backup_YYYYMMDD_HHMMSS.sql[.gz|.pgcustom]`).

Validation
- Backup archive appears under `BACKUPS_DIR`; restore drill completes on a disposable DB.
- Read-only acceptance: POST blocked (503); health 200.
 - Permissions sufficient on `/backups`; archive names follow the expected pattern.

Prompt — Phase 5: Observability & Ops Runbooks (Owners: App/Ops)
Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches. After edits, run the frontend type check/build to validate.
Quality rules: Only best-practice programming; no shortcuts or band‑aids; never remove code or functionality to make tests pass.

Context: Ensure logs, monitoring, and operational runbooks are ready.

Tasks
- Confirm structured JSON request logs are emitted and redaction works for sensitive keys.
- Enable Sentry in prod (`SENTRY_DSN`) and verify event capture; `X-Request-ID` present for correlation.
- Add/verify uptime checks for `/api/health/` and `/api/readiness/`.
- Document runbooks: start/stop, logs, backup/restore, read-only toggle, and rollback.
- Ensure proxies/load balancers redact or drop `Authorization` in access logs.

Validation
- Sentry receives a test event from prod.
- Sample log lines show JSON with request_id and no sensitive fields.

Prompt — Phase 6: Testing Gates (Owners: Eng)
Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches. After edits, run the frontend type check/build to validate.
Quality rules: Only best-practice programming; no shortcuts or band‑aids; never remove code or functionality to make tests pass.

Context: Validate correctness and contracts across backend, frontend, e2e, and generated OpenAPI types.

Tasks
- Run backend tests: `make test` (or `docker compose ... manage.py test`). Log unrelated failures in `prompts/FAILING-TESTS-TRIAGE-2025-09-29.md`.
- Run frontend tests: `npm --prefix frontend run test:run`.
- Ensure OpenAPI schema (`backend/openapi.json`) and generated types (`frontend/src/api/schema.ts`) are in sync.
- Optionally run Lighthouse via `npx lhci autorun` and review budgets.

Validation
- All targeted tests pass; any unrelated failures are triaged, not “fixed” by weakening tests.
- Frontend build (`npm --prefix frontend run build`) succeeds.

Prompt — Phase 7: Infrastructure (Owners: Ops)
Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches. After edits, run the frontend type check/build to validate.
Quality rules: Only best-practice programming; no shortcuts or band‑aids; never remove code or functionality to make tests pass.

Context: Choose proxy mode, prepare TLS/DNS, and ensure database strategy is production-appropriate.

Tasks
- Provision host with Docker Engine + Compose V2; expose only 80/443; keep DB/Redis internal or managed.
- TLS: install certs and enable HTTPS server block; validate with `nginx -t`.
- DNS: point domains; set `ALLOWED_HOSTS` and `CSRF_TRUSTED_ORIGINS`.
- Proxy choice:
  - External host Nginx (e.g., Unraid): omit `COMPOSE_PROFILES=proxy`, include `-f docker-compose.host-expose.yml`, set `BACKEND_HOST_PORT`/`FRONTEND_HOST_PORT`.
  - Built‑in Nginx: set `COMPOSE_PROFILES=proxy`; set `NGINX_HTTP_PORT`/`NGINX_HTTPS_PORT` if needed.
- Database: prefer managed Postgres; if containerized, set strong `POSTGRES_DB/USER/PASSWORD` and secure backup storage.
 - Test both proxy modes in staging and confirm certificates load only when built‑in HTTPS is enabled (TLS files required only for built‑in HTTPS).

Validation
- Nginx config `nginx -t` passes; site serves over HTTPS; only Nginx ports exposed externally.
 - External host nginx and built‑in nginx both proxy correctly in staging.

Prompt — Phase 8: Release, Cutover, and Rollback (Owners: App/Ops)
Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches. After edits, run the frontend type check/build to validate.
Quality rules: Only best-practice programming; no shortcuts or band‑aids; never remove code or functionality to make tests pass.

Context: Execute a controlled production cut with read-only guard, migration timing, and quick rollback.

Tasks
- Staging cut (T‑7 to T‑2): deploy to staging mirror; run Phase 6 gates; exercise critical flows.
- Set `READ_ONLY_MODE=true` or add `.restore.lock` before migrations if downtime required.
- Migrations behavior: default auto-run; for manual timing, set `RUN_MIGRATIONS_ON_START=false`, run `manage.py migrate` at the planned minute, then restore flag on next deploy.
- TLS sequencing: if `SECURE_SSL_REDIRECT=true`, ensure HTTPS live before exposing HTTP.
- Command order: `make build-prod` → `make up-prod` → readiness checks → migrate (if gated) → remove read-only.
- Post-deploy smokes: readiness, login, key pages, admin, backup create.
- Rollback: `make down-prod`, restore previous tags, `make up-prod`. If migrations ran, restore latest backup and revert.
 - Rehearse rollback in staging (image rollback + DB restore). Note: toggling `.restore.lock` enables/disables read‑only mode without restart.

Validation
- Smokes pass; no error bursts in logs; fast rollback path verified.

Prompt — Phase 9: Post‑Deploy (T+1h/T+24h) (Owners: App/Ops)
Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches. After edits, run the frontend type check/build to validate.
Quality rules: Only best-practice programming; no shortcuts or band‑aids; never remove code or functionality to make tests pass.

Context: Monitor and close the loop with backups and security findings.

Tasks
- Monitor error rates and slow endpoints (Sentry + logs); inspect Nginx access/error logs.
- Verify backup job executed or is scheduled; confirm archives in `/backups`.
- Update `SECURITY-FINDINGS.md` statuses; create backlog items for deferrals.

Validation
- No critical errors sustained; backups visible; findings updated.

Owner Matrix (example — update to real owners)
- App: Backend/Frontend engineering lead
- Ops: Infrastructure/DevOps owner
- Security: Security reviewer

Quick Command Appendix
- Build+run prod locally: `make build-prod && make up-prod`
- Tail logs: `make logs-prod`
- Enter backend shell: `docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec backend /bin/bash`
- Health/readiness: `curl -fsS http://localhost/api/health/ && curl -fsS http://localhost/api/readiness/`
- Backup now (preferred): `docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec backend python manage.py backup_database --compression gz`
- Backup now (alt): `make backup-db` (ensure DB envs are set and match)
- OpenAPI gating acceptance: anonymous `GET /api/schema/` returns 401/403 in prod
