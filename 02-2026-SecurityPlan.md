# 02-2026 Security Plan

Date: February 15, 2026  
Scope: Remediation plan for security findings from full codebase review, excluding finding #2 by owner decision.

## Scope Decision

- Excluded by owner decision:
1. Finding #2 (project risk access model) is accepted as-is and not in this plan.

- In scope:
1. Finding #1: Manager privilege escalation on user-admin endpoints.
2. Finding #3: Job status/download authorization gaps.
3. Finding #4: Production `SECRET_KEY` fallback behavior.
4. Finding #5: OAuth popup `postMessage` origin/source trust.
5. Finding #6: Frontend dependency vulnerabilities.
6. Finding #7: Production CORS fail-open defaults.

## Delivery Principles

1. Security controls must fail closed in production.
2. Rollouts must be deterministic and reversible.
3. For job authz (#3), use a hard cutover policy: no legacy compatibility layer.
4. Database schema and producer write paths must be deployed before enforcement flags are enabled.
5. Queue drain/purge actions must be scoped to workload-tracker-owned queues and result keys only.
6. Version pins in Workstream E are temporary stabilization controls for cutover; ongoing upgrades continue on a scheduled cadence.
7. Redis purge operations are allowed only when Redis isolation is verified (dedicated DB/index for this app or enforced key prefixing).

## Prioritization

1. Critical: #1
2. High: #3
3. Medium: #4, #5, #7
4. Medium/Operational: #6

## Intentional Breaking Changes (Approved)

1. Managers lose access to admin-sensitive user management endpoints.
2. Pre-cutover async job URLs become invalid by design after hard cutover.
3. Production startup will fail fast if security-critical env values are missing/invalid.

## Prerequisite Stability Gate

1. Normalize feature-flag initialization in `backend/config/settings.py` so flags are not overwritten later in module load.
2. Add startup/assertion test proving required flags (`ASYNC_JOBS`, new job auth flags, auth flags) resolve to expected values in production config.
3. Block Workstream B rollout until this gate is complete.

## Milestones

1. February 17, 2026: Complete fixes for #1 and #4 with tests.
2. February 21, 2026: Complete #3 implementation and hard-cutover runbook.
3. February 24, 2026: Complete #5 and #7 with integration tests.
4. February 27, 2026: Complete #6 dependency updates and CI policy updates.
5. March 2, 2026: Security regression pass and production rollout checklist sign-off.

## Workstream A: Account Privilege Boundary Hardening (#1)

### Objectives

- Remove manager ability to perform admin-sensitive account actions.

### Changes

1. Restrict endpoints to admin-only (`IsAdminUser`) for:
1. `SetPasswordView`
2. `DeleteUserView`
3. `UpdateUserRoleView`
4. `LinkUserPersonAdminView`
2. Add explicit target guards:
1. Non-superuser cannot alter superuser account data.
2. Optional policy toggle: only superuser can reset admin/staff passwords.
3. Preserve self-protection logic (no self-delete, no self-role-change).

### Verification

1. Add tests proving managers receive `403` for all above endpoints.
2. Add tests proving admins can perform allowed actions.
3. Add tests for superuser-only protections where configured.

### Rollout

1. No schema migration required.
2. Release note callout: manager role capability reduction.
3. Monitor auth endpoint `403` rate for first 24 hours after deploy.

## Workstream B: Async Job Access Control (#3)

### Objectives

- Ensure job status/download access is owner-or-admin only.
- Enforce via hard cutover with no legacy fallback.

### Changes

1. Introduce job ownership metadata (`JobAccessRecord` or equivalent) with:
1. `job_id`
2. `created_by_user_id` (nullable for system jobs)
3. `is_admin_only`
4. Optional `purpose`, `created_at`
2. At all user-facing async job creation sites that return a `job_id` to clients, persist ownership metadata before enqueue success is returned.
3. In `JobStatusView` and `JobDownloadView`:
1. Require authenticated user by default.
2. Enforce owner-or-admin access rule.
4. For restore windows where DB-backed auth may be unavailable:
1. Replace anonymous access with signed restore-session token access (job-bound, short TTL).
2. Validate signature, expiry, and job ID binding without requiring DB reads.
3. Add dedicated signing secret (`RESTORE_JOB_TOKEN_SECRET`) and explicit TTL (`RESTORE_JOB_TOKEN_TTL_SECONDS`).
5. Add endpoint inventory control to ensure all user-facing job producers persist ownership metadata.
6. If ownership metadata write fails for a user-facing producer, fail the request and do not enqueue the job.
7. Add DB safety constraints for ownership records:
1. `job_id` unique constraint.
2. Index on `created_by_user_id`.
3. Ownership fields immutable after creation (no update path in app code/admin).
8. Define restore-token lifecycle controls:
1. Token issuer limited to restore-start flow only.
2. Max token TTL cap: 900 seconds.
3. Rotate token signing context each restore session.
4. Invalidate restore tokens when restore lock clears or service exits restore mode.

### Hard Cutover Policy (No Legacy Support)

1. Pre-cutover maintenance window required.
2. Disable new async job creation (set `ASYNC_JOBS=false` via deploy config override, or apply equivalent traffic guard).
3. Verify quiesce condition: no API path can enqueue new jobs.
4. Pause schedulers/periodic producers (Celery Beat, cron-driven enqueuers, integration planners).
5. Drain workers until workload-tracker queues are empty:
1. active = 0
2. reserved = 0
3. scheduled = 0
6. Verify Redis isolation precondition (dedicated DB/index or required key prefix) before any purge.
7. Purge/expire workload-tracker result-backend entries (namespace-scoped only).
8. Apply schema migration for ownership metadata.
9. Deploy job-owner enforcement code to API and workers from the same release artifact (no mixed-version cluster).
10. Enable strict flags (`JOB_AUTHZ_WRITE_REQUIRED=true`, `JOB_AUTHZ_ENFORCED=true`).
11. Re-enable async jobs and schedulers.
12. Communicate that pre-cutover job URLs are intentionally invalid.

### Verification

1. Tests: owner allowed, non-owner denied, admin override allowed.
2. Tests: anonymous access denied in normal and restore modes.
3. Tests: restore-session token accepted only for matching job ID and within TTL.
4. Tests: all known user-facing job-producing endpoints create ownership metadata.
5. Tests: metadata-write failure prevents enqueue and returns explicit error.
6. Operational check: queue drained and result backend purged before flag enablement.
7. Operational check: only workload-tracker queue names and key prefixes were drained/purged.
8. CI check: endpoint inventory for all `jobId` producers matches Appendix A and fails on drift.
9. Tests: ownership immutability and uniqueness constraints enforced.
10. Tests: restore tokens expire, are session-bound, and are rejected once restore mode ends.

### Rollout

1. Feature flag gates: `JOB_AUTHZ_WRITE_REQUIRED=true`, `JOB_AUTHZ_ENFORCED=true`.
2. Enable only after drain + purge checklist passes.
3. Rollback path: disable `JOB_AUTHZ_WRITE_REQUIRED` and `JOB_AUTHZ_ENFORCED`, keep async disabled until confirmed stable.
4. Restore-mode token gate: `JOB_RESTORE_TOKEN_MODE=true` (default enabled once validated).
5. Require non-default `RESTORE_JOB_TOKEN_SECRET` in non-debug environments.
6. Require `RESTORE_JOB_TOKEN_TTL_SECONDS<=900` in non-debug environments.

## Workstream C: Production Secret Key Fail-Closed (#4)

### Objectives

- Prevent accidental production startup with known/dev secret.

### Changes

1. Startup checks:
1. If `DEBUG=false` and `SECRET_KEY` is missing/blank/dev-default, raise `ImproperlyConfigured`.
2. Reject known insecure fallback values explicitly.
2. Add CI guard to fail if `.env.production.template` contains insecure defaults.
3. Add deploy preflight check that validates real production env values before rollout.

### Verification

1. Unit test for failure behavior in production mode.
2. Startup smoke test with valid secret passes.

### Rollout

1. Coordinate with ops to run preflight before each deploy.
2. Block deploy if preflight fails.

## Workstream D: OAuth Popup Message Trust Hardening (#5)

### Objectives

- Eliminate cross-window message spoofing risk without breaking valid OAuth flows.

### Changes

1. Backend callback response:
1. Use strict `targetOrigin` (resolved from configured app origins), never `*`.
2. Frontend message handler:
1. Validate `event.origin` against allowlisted app origin(s).
2. Validate `event.source === oauthWindow`.
3. Keep current payload marker (`source`) as secondary check.
3. Add config for explicit allowed frontend origins for OAuth callback messaging.
4. Add fallback UX message for rejected origin/source.

### Verification

1. Tests for valid origin acceptance.
2. Negative tests for spoofed origin/source.
3. Staging test across all supported hostnames/domains.

### Rollout

1. Deploy backend + frontend changes together.
2. Block rollout if allowed-origin config is incomplete.

## Workstream E: Dependency Vulnerability Remediation (#6)

### Objectives

- Remove known moderate+ frontend dependency vulnerabilities in production dependency graph.

### Changes

1. Pin strategy intent:
1. Use exact versions as a short-lived stabilization baseline for the security release.
2. After production stabilization, resume controlled upgrades to newer versions via scheduled dependency-review cycles.
2. Upgrade and lock vulnerable chains with exact pinned targets:
1. `openapi-typescript` -> `7.13.0` (pin in `devDependencies`).
2. `markdown-it` -> `14.1.1` (pin via `overrides` because it is transitive through `prosemirror-markdown`).
3. `undici` -> `7.22.0` (pin via `overrides` to close transitive advisory path).
4. `lodash` -> `4.17.23` (pin via `overrides`).
5. `lodash-es` -> `4.17.23` (pin via `overrides`).
3. Regenerate lockfile and run full test/build matrix.
4. CI policy:
1. Fail on `npm audit --omit=dev` moderate+.
2. Maintain explicit accepted-risk registry for dev-only findings with expiry dates.
5. Establish dependency upgrade cadence:
1. First post-cutover review on March 16, 2026.
2. Recurring monthly dependency review thereafter.
3. Upgrade rule: prefer latest patched minor/major only after audit + tests + staging smoke pass.

### Verification

1. `npm audit --omit=dev` = zero moderate/high/critical.
2. Frontend build + tests + smoke flows pass.
3. `npm ls markdown-it openapi-typescript undici lodash lodash-es` matches pinned versions exactly.

### Rollout

1. Deploy with runtime smoke checks (auth, settings, integrations UI).

## Workstream F: Production CORS Fail-Closed Defaults (#7)

### Objectives

- Ensure production CORS/CSRF is explicit and fail-closed.

### Changes

1. In settings when `DEBUG=false`:
1. Default `CORS_ALLOWED_ORIGINS` to empty.
2. Require explicit configured origins when cookie auth is enabled.
3. Require explicit valid `CSRF_TRUSTED_ORIGINS`.
4. Raise startup error for missing/invalid required values.
2. Keep localhost defaults only when `DEBUG=true`.
3. Update `.env.production.template` with required origin variables and examples.
4. Add environment matrix validation (staging/prod hostnames).

### Verification

1. Production config test: missing origins causes startup failure.
2. Valid config allows authenticated browser flows and CSRF-protected requests.

### Rollout

1. Stage rollout with production-like DNS/TLS first.
2. Confirm browser auth refresh and CSRF behavior before production cutover.

## Cross-Workstream Preflight Checklist

1. Confirm backup and rollback plan is documented per release.
2. Run config preflight:
1. `SECRET_KEY` valid.
2. CORS/CSRF origins valid.
3. OAuth allowed origins valid.
4. Restore token secret/TTL valid.
5. Feature-flag integrity check passes (no late overwrite/regression).
3. Run regression suite:
1. Authz tests.
2. Job access tests.
3. OAuth popup flow tests.
4. Run security tooling:
1. `npm audit --omit=dev`.
2. Existing `security/` validation scripts.
5. Workstream B cutover dry run in staging:
1. Queue drain procedure succeeds.
2. Result backend purge procedure succeeds.
3. Restore workflow can still poll/download with restore-session token flow.
4. Scoped purge verified against workload-tracker-only key prefix.
6. Verify Redis isolation precondition documented with evidence (dedicated DB/index or enforced prefix).
7. CI endpoint-inventory drift check passes for job-producing endpoints.

## Operational Go/No-Go and Rollback Triggers

1. Go criteria:
1. Preflight checklist complete with evidence attached.
2. All blocking tests green.
3. Staging dry run completed for hard cutover.
2. Immediate rollback triggers (first 30-60 minutes):
1. Sustained 5xx increase on auth or jobs endpoints above baseline (for example, +2% absolute over 10 minutes).
2. Restore workflow unable to poll or download job outputs.
3. OAuth callback success rate drops below accepted threshold (for example, <99% over 15 minutes).
3. Rollback actions:
1. Re-enable previous app version.
2. Disable enforcement flags (`JOB_AUTHZ_WRITE_REQUIRED`, `JOB_AUTHZ_ENFORCED`, related strict gates).
3. Keep maintenance mode until service health stabilizes.
4. If startup fails from #4/#7 fail-closed checks:
1. Reapply last-known-good env bundle (`SECRET_KEY`, CORS, CSRF, OAuth origins).
2. Redeploy backend with known-good env.
3. Re-run config preflight before reopening traffic.

## Rollout Strategy

1. Deploy order:
1. Workstreams A + C first.
2. Workstream B hard cutover in maintenance window.
3. Workstreams D + F together.
4. Workstream E after dependency validation.
5. For each stage, deploy API + worker services as one version set.
2. Monitoring for first 24 hours:
1. Auth endpoint `401/403` rates.
2. Job status/download `403` rates.
3. OAuth callback success/failure ratio.
4. Frontend error rate for settings/integrations screens.

## Exit Criteria

1. Critical/high findings (#1, #3) remediated and verified in production.
2. Medium trust/config findings (#4, #5, #7) remediated.
3. Dependency risk (#6) reduced to zero moderate+ in production dependency graph.
4. Regression test coverage added for all changed security controls.

## Appendix A: User-Facing Endpoints Returning `jobId`

1. `GET /api/people/export_excel/` -> JSON body includes `jobId`, `statusUrl`, `downloadUrl` (`backend/people/views.py:588`).
2. `POST /api/people/import_excel/` -> JSON body includes `jobId`, `statusUrl` (`backend/people/views.py:1415`).
3. `GET /api/people/skill_match_async/` -> JSON body includes `jobId` (`backend/people/views.py:1396`).
4. `GET /api/projects/export_excel/` -> JSON body includes `jobId`, `statusUrl`, `downloadUrl` (`backend/projects/views.py:926`).
5. `GET /api/assignments/grid_snapshot_async/` -> JSON body includes `jobId` (`backend/assignments/views.py:3154`).
6. `POST /api/deliverables/pre_deliverable_items/backfill/` -> JSON body includes `jobId`, `statusUrl` when async path is used (`backend/deliverables/views.py:942`).
7. `POST /api/backups/` -> JSON body includes `jobId`, `statusUrl` (`backend/core/backup_views.py:129`).
8. `POST /api/backups/{id}/restore/` -> JSON body includes `jobId`, `statusUrl` (`backend/core/backup_views.py:233`).
9. `POST /api/backups/upload-restore/` -> JSON body includes `jobId`, `statusUrl` (`backend/core/backup_views.py:278`).
10. Header-based job ID surface:
1. `PUT/PATCH /api/people/{id}/` can return `X-Job-Id` and `X-Job-Status-Url` when deactivation cleanup is enqueued (`backend/people/views.py:202`).
11. CI ownership:
1. Appendix A is generated/validated by CI and cannot drift from OpenAPI + endpoint tests.

## Appendix B: Hard-Cutover Operator Commands (Drain/Purge)

1. Required queue names:
1. `celery` (default worker queue).
2. `db_maintenance` (backup/restore maintenance queue).
2. Required result-key prefixes (Redis backend):
1. `celery-task-meta-*`
2. `celery-taskset-meta-*`
3. `chord-unlock-*`
3. If Redis result backend `global_keyprefix` is later enabled, prepend that prefix to all patterns above.
4. Precondition (must pass before purge):
1. Redis is app-isolated: dedicated Redis DB/index for workload-tracker OR enforced result/backend key prefixing.
2. If precondition is false, abort cutover purge and implement isolation first.
5. Commands (docker-compose deployment):

```bash
# Choose compose file for target environment
export COMPOSE_FILE=docker-compose.prod.yml
dc(){ docker compose -f "$COMPOSE_FILE" "$@"; }

# 1) Quiesce producers (no new job enqueue during cutover)
# Option A: deploy override with ASYNC_JOBS=false; Option B: enforce maintenance traffic guard + stop API producers
dc stop worker_beat
dc stop backend
dc ps worker_beat backend

# 2) Verify queue depths (REDIS DB index is /1 from REDIS_URL)
dc exec redis redis-cli -n 1 LLEN celery
dc exec redis redis-cli -n 1 LLEN db_maintenance

# 3) Verify no in-flight tasks on workers (active/reserved/scheduled must be empty)
dc exec worker celery -A config inspect active
dc exec worker celery -A config inspect reserved
dc exec worker celery -A config inspect scheduled
dc exec worker_db celery -A config inspect active
dc exec worker_db celery -A config inspect reserved
dc exec worker_db celery -A config inspect scheduled

# 4) Verify Redis isolation precondition (document evidence before purge)
dc exec redis redis-cli -n 1 INFO keyspace

# 5) If any queued tasks remain and maintenance window requires hard cut:
dc exec worker celery -A config purge -Q celery -f
dc exec worker_db celery -A config purge -Q db_maintenance -f

# 6) Purge result backend keys for pre-cutover jobs (namespace-scoped)
dc exec redis sh -lc "redis-cli -n 1 --scan --pattern 'celery-task-meta-*' | xargs -r redis-cli -n 1 DEL"
dc exec redis sh -lc "redis-cli -n 1 --scan --pattern 'celery-taskset-meta-*' | xargs -r redis-cli -n 1 DEL"
dc exec redis sh -lc "redis-cli -n 1 --scan --pattern 'chord-unlock-*' | xargs -r redis-cli -n 1 DEL"

# 7) Post-purge verification
dc exec redis redis-cli -n 1 --scan --pattern 'celery-task-meta-*' | head
dc exec redis redis-cli -n 1 --scan --pattern 'celery-taskset-meta-*' | head
dc exec redis redis-cli -n 1 --scan --pattern 'chord-unlock-*' | head
```

## Appendix C: Dependency Pin Set for Workstream E

1. `frontend/package.json` target pins:
1. `devDependencies.openapi-typescript = 7.13.0`
2. `overrides.markdown-it = 14.1.1`
3. `overrides.undici = 7.22.0`
4. `overrides.lodash = 4.17.23`
5. `overrides.lodash-es = 4.17.23`
2. Lockfile regeneration requirement:
1. Run install to regenerate `frontend/package-lock.json`.
2. Record exact resolved versions in PR notes using `npm ls` command from verification section.
3. These pins are temporary release controls, not a long-term freeze.
4. At each monthly dependency review:
1. Propose newer versions.
2. Run `npm audit --omit=dev`, full test/build matrix, and staging smoke validation.
3. Promote only if checks pass; otherwise keep current pins and document reason.
