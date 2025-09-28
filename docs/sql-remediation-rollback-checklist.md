# SQL Remediation Rollback & Readiness Checklist

This document lists touched files and how to revert each change safely, plus a short readiness checklist to verify production posture.

## Files Touched (Phase 1–7)
- backend/monitoring/management/commands/monitor_performance.py
  - Added PostgreSQL vendor guards; safe identifier quoting for per-table VACUUM.
- backend/core/management/commands/repair_token_blacklist.py
  - Added PostgreSQL vendor guard; schema-qualified, parameterized information_schema checks; DB_SCHEMA whitelist.
- backend/core/management/commands/restore_database.py
  - psql `-v dbname=...` and `:"dbname"` usage in `_terminate_sessions`; least-privilege grants in `_drop_and_recreate_public`; optional `DB_APP_ROLE` grant.
- backend/reports/views.py
  - Consolidated three `.count()` calls into single `.aggregate(...)` (response shape unchanged).
- backend/projects/views.py
  - Removed per-chunk `.count()` in streaming export progress.
- backend/projects/management/commands/export_projects.py
  - Cached `.count()` once for validation/messages.
- backend/people/management/commands/export_people.py
  - Cached `.count()` once for messages.
- backend/projects/utils/excel_handler.py
  - Switched `count()==0` to `exists()` for emptiness check.
- Tests added (DB-optional, phase verification):
  - backend/monitoring/tests_sql_remediation.py
  - backend/core/tests/test_sql_remediation.py
  - backend/reports/tests/test_sql_remediation.py
  - backend/projects/tests/test_sql_remediation_roundtrips.py
- Docs:
  - docs/activity-watermark-design.md (Phase 8 discovery)
  - prompts/FAILING-TESTS-TRIAGE-APPENDIX.md

## Reverting Individually
Use `git revert` on the commits that introduced each change, or restore files from a known-good revision.

- monitor_performance vendor guards & quoting
  - `git restore --source <base> -- backend/monitoring/management/commands/monitor_performance.py`
- repair_token_blacklist vendor guard & schema filters
  - `git restore --source <base> -- backend/core/management/commands/repair_token_blacklist.py`
- restore_database dbname var & least-privilege grants
  - `git restore --source <base> -- backend/core/management/commands/restore_database.py`
- reports aggregation consolidation
  - `git restore --source <base> -- backend/reports/views.py`
- projects streaming progress & export count caches; people export cache
  - `git restore --source <base> -- backend/projects/views.py`
  - `git restore --source <base> -- backend/projects/management/commands/export_projects.py`
  - `git restore --source <base> -- backend/people/management/commands/export_people.py`
- projects excel handler exists()
  - `git restore --source <base> -- backend/projects/utils/excel_handler.py`
- Tests/docs (optional to revert)
  - `git restore --source <base> -- <path>`

Note: Replace `<base>` with a specific commit (e.g., the parent of these changes).

## Readiness Checklist (Prod)
- Vendor guards present where PostgreSQL-specific code is used:
  - monitor_performance (bloat, vacuum, pg_stat_activity) and repair_token_blacklist.
- Safe identifier quoting used for VACUUM per-table loop.
- `_terminate_sessions` uses psql `-v dbname=...` and `:"dbname"`.
- Least-privilege grants:
  - `REVOKE CREATE ON SCHEMA public FROM PUBLIC;`
  - `GRANT USAGE ON SCHEMA public TO PUBLIC;`
  - Optional: `DB_APP_ROLE` granted CREATE (if configured).
- Reduced round-trips:
  - Reports totals via `.aggregate(...)`.
  - Projects export progress avoids per-chunk `.count()`.
  - Export commands cache `.count()` once.
  - Excel handler uses `.exists()` for emptiness.
- Restore/backup commands validated in staging:
  - Test `backup_database` creation/metadata.
  - Test `restore_database` path (custom and sql.gz) on realistic data.
- Frontend contract check:
  - No API schema drift on endpoints used (deliverables calendar, reports completion, projects filter metadata).

## Docker Commands
- Build & restart backend/frontend:
  - `docker compose build backend frontend`
  - `docker compose up -d backend frontend`
- Targeted backend tests:
  - `docker compose exec backend python manage.py test monitoring.tests_sql_remediation core.tests.test_sql_remediation projects.tests.test_sql_remediation_roundtrips -v 2`

