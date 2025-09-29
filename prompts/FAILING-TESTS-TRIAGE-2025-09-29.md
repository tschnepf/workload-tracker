# Failing Tests Triage — Out‑of‑Scope Items

Scope
- Purpose: track test failures that are outside the current remediation phases (CSP, OpenAPI gating, Projects import hardening), so we can resolve them later without blocking the current work.
- Inclusion rule: any failing test that relates to features/pages we did not change in this pass should be recorded here with reproduction steps and suspected UI impact.
- Exclusion: tests added/changed as part of the current phase and already validated (e.g., Projects import validations) are not listed here if they pass.

How These Were Found
- Full suite command used:
  - `docker compose exec backend python manage.py test -v 1`
- Environment: dev docker‑compose stack, Django test runner. During this pass, we focused changes on CSP, OpenAPI schema gating, and Projects import.

Failing Tests (names and likely impacted UI/flows)

1) `core.tests.test_backup.BackupAPITests.test_create_backup_enqueues_job_and_throttle`
- Symptom: expected 429 (throttled on second POST) but received 202.
- Likely UI surface: Settings → Backups page (Create backup), API `POST /api/backups/` throttle behavior.
- Suspected area: DRF throttle config for scope `backup_create`; interaction with test override and view throttle scope.
- Quick repro: `docker compose exec backend python manage.py test core.tests.test_backup.BackupAPITests.test_create_backup_enqueues_job_and_throttle -v 2`

2) `core.tests.test_backup.MaintenanceMiddlewareTests.test_read_only_mode_blocks_post_when_lock_present`
- Symptom: expected 503 during read‑only lock; received 200.
- Likely UI surface: global maintenance/restore window — write operations should be blocked (Read‑Only Mode middleware).
- Suspected area: `ReadOnlyModeMiddleware` path allow‑list or lock‑file detection.
- Quick repro: `docker compose exec backend python manage.py test core.tests.test_backup.MaintenanceMiddlewareTests.test_read_only_mode_blocks_post_when_lock_present -v 2`

3) `deliverables.tests.test_calendar_union_mine_only.CalendarUnionMineOnlyTests.test_duplicate_deliverables_eliminated_with_distinct`
- Symptom: duplicate elimination assertion failed (expected 1, found 0 or >1).
- Likely UI surface: Deliverables → Calendar (Mine Only) — duplicate rows or missing items.
- Suspected area: queryset union/distinct logic for calendar data when filtering to “mine only”.
- Quick repro: `docker compose exec backend python manage.py test deliverables.tests.test_calendar_union_mine_only.CalendarUnionMineOnlyTests.test_duplicate_deliverables_eliminated_with_distinct -v 2`

4) `deliverables.tests.test_calendar_union_mine_only.CalendarUnionMineOnlyTests.test_mine_only_includes_deliverables_via_project_assignments`
- Symptom: expected deliverable IDs from project assignments not present in result.
- Likely UI surface: Deliverables → Calendar (Mine Only) — missing items assigned via projects.
- Suspected area: join/filter covering deliverables reachable through project assignments.
- Quick repro: `docker compose exec backend python manage.py test deliverables.tests.test_calendar_union_mine_only.CalendarUnionMineOnlyTests.test_mine_only_includes_deliverables_via_project_assignments -v 2`

Errors Observed (need test name confirmation)
- IntegrityError: `duplicate key value violates unique constraint "accounts_userprofile_user_id_key"` (trace surfaced during suite run).
  - Likely UI surface: user profile creation/linkage (not a direct end‑user page, but underlying auth/profile lifecycle).
  - Suspected area: automatic creation of `UserProfile` (signal/fixture) causing duplicate profiles in certain tests.
  - Next step: identify the exact failing test(s) and ensure profile creation is idempotent (use get_or_create) or adjust test setup to avoid double creation.
  - Repro tip: re‑run full suite with higher verbosity to capture exact test name: `docker compose exec backend python manage.py test -v 2` and search for `ERROR:` lines.

What To Do Next (later task)
- Backups throttle: verify DRF `DEFAULT_THROTTLE_RATES['backup_create']` and the view’s throttle scope; add an explicit throttle class/scope if needed and assert 429 on second POST.
- Read‑Only middleware: ensure `.restore.lock` under `BACKUPS_DIR` triggers 503 for mutating methods across routes, with a minimal allow‑list.
- Deliverables calendar: adjust unions/filters to maintain distinctness and project‑assignment inclusion; add focused queryset/tests.
- UserProfile duplication: audit signals/fixtures; ensure one‑to‑one creation per user.

Append New Failures Here
- For any future out‑of‑scope failure, append an item with:
  - Test path (module.class.method)
  - Symptom (expected vs actual)
  - Likely affected UI/flow
  - Suspected code area
  - One‑line repro command (manage.py test … -v 2)




# Failing Tests Triage — Backend (2025‑09‑29)

This dated supplement records backend test failures observed during a broader spot‑check. It complements `prompts/FAILING-TESTS-TRIAGE.md` without changing its historical entries.

## Summary

- Resolved since last triage
  - Deliverables calendar (mine_only) — duplicates eliminated and via‑project inclusion ensured; targeted tests pass.
  - UserProfile duplication IntegrityError — hardened signal to be idempotent and race‑safe; targeted tests added.

- New/changed failures
  1) `core.tests.test_backup.BackupAPITests.test_create_backup_enqueues_job_and_throttle`
     - Symptom: first `POST /api/backups/` returned 429 (should be 202). Likely throttle state leakage or mis‑scoped throttle.
     - Repro: `python backend/manage.py test core.tests.test_backup.BackupAPITests.test_create_backup_enqueues_job_and_throttle -v 2`

  2) `deliverables.tests.test_pre_types.PreDeliverableTypeTests.test_seeded_types_exist`
     - Symptom: built‑in pre‑deliverable types missing under SQLite test profile.
     - Cause: migrations disabled in `config.settings_test` prevent seed migrations from running.
     - Repro: `python backend/manage.py test deliverables.tests.test_pre_types -v 2`

  3) `people.tests.test_object_permissions.PeopleObjectPermissionTests.test_user_cannot_edit_own_person`
     - Symptom: expected 403/404 on self‑edit; received 200.
     - Note: current permission policy allows self‑edits; decide product policy and align tests/logic.
     - Repro: `python backend/manage.py test people.tests.test_object_permissions -v 2`

  4) `core.tests.test_backup.BackupCommandTests.test_restore_from_custom_archive_succeeds`
     - Symptom: FileNotFoundError for external restore tool (platform binary missing on Windows/dev).
     - Repro: `python backend/manage.py test core.tests.test_backup.BackupCommandTests.test_restore_from_custom_archive_succeeds -v 2`

## Next Steps Plan

1) Backups Throttle (align with B‑Phase 1 intent)
   - Verify view throttle scope and DRF rates.
   - Ensure test isolation (clear throttle cache/user between requests).
   - Assert first POST 202, second POST within window 429.

2) Seeded Types under Tests
   - For tests depending on seeds, re‑enable migrations for `deliverables` in the SQLite test profile or provide test fixtures to guarantee presence.

3) People Object Permissions
   - Decide policy for self‑edits. If blocked, tighten `RoleBasedAccessPermission.has_object_permission` for `people.person`; else update tests and document behavior.

4) Restore Command Environment
   - Make the test conditional on required tools (skip with reason) or provide a portable stub to validate the flow on Windows/CI.

