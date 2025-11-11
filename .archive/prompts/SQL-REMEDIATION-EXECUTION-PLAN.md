# SQL Remediation Execution Plan (Prescriptive, Lean, No Shortcuts)

Scope: Implement safe identifier handling, vendor guards, least‑privilege grants, query round‑trip reductions, and schema‑qualified, parameterized metadata checks. Keep behavior stable for clients. Apply lean programming: minimal code paths, clear ownership, no band‑aids, no dead code.

Deliverable: Execute phases in order. Each step is a ready‑to‑use prompt you can re‑feed to the AI agent. Prompts are prescriptive and broken down to avoid risky, sweeping edits.

---

## Guiding Principles
- Favor correctness and safety over expedience; no shortcuts or quick fixes.
- Keep changes minimal, local, and reversible; avoid broad refactors.
- Maintain API response shapes and semantics; coordinate backend/frontend.
- Prefer built‑in quoting/helpers over manual string building.
- Reduce round trips where it clearly lowers cost without changing behavior.
- Do not widen ORM coupling in backup/restore commands; keep them DSN/psql‑driven.


---

## Phase 0 — Pre‑Flight (Context, Baselines)

1) Prompt: Establish context and guardrails
- "Scan the repo to confirm the files to modify exist and are tracked: `backend/monitoring/management/commands/monitor_performance.py`, `backend/core/management/commands/restore_database.py`, `backend/core/management/commands/backup_database.py`, `backend/core/management/commands/repair_token_blacklist.py`, `backend/reports/views.py`, `backend/projects/views.py`, `backend/projects/management/commands/export_projects.py`, `backend/people/management/commands/export_people.py`, `backend/projects/utils/excel_handler.py`. Do NOT modify any other files. Acknowledge lean programming best practices and confirm no shortcuts will be taken."

2) Prompt: Baseline tests and typing
- "Run the test suite and lint/type checks (if configured) and capture a baseline. Do not 'fix' unrelated failures. We will only adjust what we touch. Summarize current status."

---

## Phase 1 — Vendor Guards for Postgres‑Specific Code (Safety)

1) Prompt: Add vendor guard in monitor_performance
- "In `backend/monitoring/management/commands/monitor_performance.py`, add an early vendor guard for all Postgres‑only branches (bloat check, vacuum/analyze, reference to `pg_stat_activity`). Use: `if connection.vendor != 'postgresql': self.stdout.write('PostgreSQL required for this option; skipping.'); return`. Apply this guard to:
  - `check_database_bloat`
  - `vacuum_analyze_database`
  - the `pg_stat_activity` query in `collect_system_metrics` (wrap only the DB query with a guard).
  Keep code paths lean and readable. Do not add new settings flags."

2) Prompt: Add vendor guard in restore/backup admin commands (DSN‑based, no ORM)
- "In `backend/core/management/commands/restore_database.py` and `backend/core/management/commands/backup_database.py`, do not import or use `django.db.connection`. These commands remain ORM‑free and already parse a DSN. Enforce Postgres vendor via `_parse_dsn` scheme (`postgres`/`postgresql`) and bail out with a clear message if the scheme is unsupported. Preserve existing help text."

3) Prompt: Add vendor guard in repair_token_blacklist
- "In `backend/core/management/commands/repair_token_blacklist.py`, add an early return if not Postgres. Keep it lean: a single check and message."



Testing step
- "Re‑run unit tests for these commands if present; otherwise import modules to ensure no import‑time errors. Confirm non‑Postgres backends skip gracefully."

---

## Phase 2 — Safe Identifier Quoting (Correctness)

1) Prompt: Quote table identifiers in VACUUM loop
- "In `backend/monitoring/management/commands/monitor_performance.py`, replace `cursor.execute(f'VACUUM ANALYZE \"{table}\";')` with a version that uses `connection.ops.quote_name(table)` to produce a safely quoted identifier. Build SQL as `f'VACUUM ANALYZE {quoted};'` where `quoted = connection.ops.quote_name(table)`. Apply this only within a Postgres vendor guard. No manual escaping."

2) Prompt: Eliminate f‑string DB name in psql SQL; apply consistently
- "In `backend/core/management/commands/restore_database.py` within `_terminate_sessions`, stop interpolating `dbname` directly. Pass `-v dbname=<name>` to `psql` and use `REVOKE CONNECT ON DATABASE :\"dbname\" FROM PUBLIC;`. Keep `-v ON_ERROR_STOP=1`. Apply this pattern consistently to any psql call that needs the DB name. Optionally add `-X` to ignore user `psqlrc`. Ensure the subsequent `pg_terminate_backend` stays unchanged. Keep code minimal."

Testing step
- "Dry‑run these management commands (without a live PG) to ensure string building passes unit/static checks. Where possible, use a fake dbname containing a double quote to validate quoting paths in isolated helpers."

---

## Phase 3 — Least‑Privilege Grants (Security)

1) Prompt: Replace GRANT ALL TO PUBLIC with least‑privilege
- "In `backend/core/management/commands/restore_database.py`, replace `GRANT ALL ON SCHEMA public TO PUBLIC;` with:
  - `REVOKE CREATE ON SCHEMA public FROM PUBLIC;`
  - `GRANT USAGE ON SCHEMA public TO PUBLIC;`
  Optionally, if an app role is configured (e.g., `DB_APP_ROLE` env var present), add `GRANT CREATE ON SCHEMA public TO \"<role>\";`.
  Add a brief note in help/log that schema CREATE is no longer public and that an app role may be required in some deployments. Keep conditionals lean. Do not add new settings; read env only."

Testing step
- "Run a restore dry‑run path (command help or mocked subprocess) to verify SQL strings are built as expected. Confirm no changes to non‑security behavior or API shape."

---

## Phase 4 — Schema‑Qualified, Parameterized information_schema Queries (Correctness)

1) Prompt: Qualify schema in blacklist checks and use parameters
- "In `backend/core/management/commands/repair_token_blacklist.py`, update all `information_schema.tables` and `information_schema.columns` checks to include `table_schema = %s` and bind parameters via Django cursor (psycopg2). Example:
  `cursor.execute("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = %s AND table_name = %s)", [schema, 'token_blacklist_outstandingtoken'])`.
  Get `schema = os.getenv('DB_SCHEMA', 'public')`, validate with a whitelist regex `^[A-Za-z0-9_]+$`, and reject otherwise. Keep the code lean; no broad utilities."

Testing step
- "Add quick unit coverage or run the command with `DB_SCHEMA=public` to ensure existence/column checks still work. Validate behavior when tables are missing."

---

## Phase 5 — VACUUM Enumeration Strategy (Completeness)

1) Prompt: Prefer single VACUUM (ANALYZE) with fallback
- "In `backend/monitoring/management/commands/monitor_performance.py`, prefer issuing a single `VACUUM (ANALYZE);` guarded by vendor check. If it raises (insufficient privileges), attempt `VACUUM ANALYZE;` for compatibility. If that also fails, fallback to enumerating user tables via:
  SELECT c.relname
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = <validated schema> AND c.relkind IN ('r','p')
  ORDER BY c.relname;
  Then iterate with safe quoting (from Phase 2). Keep control flow simple and explicit."

Testing step
- "Static test only: ensure the fallback path composes SQL correctly and the primary/global paths are attempted first (`VACUUM (ANALYZE)` then `VACUUM ANALYZE`). Log and continue gracefully on permission errors."

---

## Phase 6 — Report Totals: Combine Counts (Efficiency)

1) Prompt: Consolidate counts in reports view
- "In `backend/reports/views.py` `PreDeliverableCompletionView.get`, replace the three separate `qs.count()` calls with a single `.aggregate(total=..., completed=..., overdue=...)` using filtered `Count`. Ensure the returned JSON fields and values remain unchanged. Example: `qs.aggregate(total=Count('id'), completed=Count('id', filter=Q(is_completed=True)), overdue=Count('id', filter=Q(is_completed=False, generated_date__lt=_date.today())))`. Keep code concise; no helper abstractions."

Testing step
- "Run or simulate the endpoint to verify identical keys/values and reduced query count (log queries if available). Confirm no frontend payload changes (fields and casing unchanged)."

---

## Phase 7 — Round‑Trip Reductions (Low‑Risk Wins)

1) Prompt: Remove per‑chunk COUNT() in projects export stream
- "In `backend/projects/views.py` streaming export, replace `processed += chunk_queryset.count()` with arithmetic based on `chunk_size` and remaining records: `processed += min(chunk_size, total_count - chunk_start)`. Do not alter response format or progress semantics."

2) Prompt: Reuse `.count()` results in CLI exports
- "In `backend/projects/management/commands/export_projects.py` and `backend/people/management/commands/export_people.py`, store `n = queryset.count()` once and reuse for all subsequent log messages and decisions. Keep messages identical. Do not refactor unrelated code."

3) Prompt: Use `.exists()` instead of `.count()==0`
- "In `backend/projects/utils/excel_handler.py`, change `if is_template or queryset.count() == 0:` to `if is_template or not queryset.exists():`. No other changes."

Testing step
- "Exercise export flows (dry‑run where supported). Confirm outputs and logs are unchanged except fewer DB hits."

---

## Phase 8 — Optional: Centralized Multi‑Model Watermark (Deferred)

1) Prompt: Discovery only (no code changes)
- "Propose a design doc stub for a single 'activity watermark' (trigger or signal‑maintained) that tracks max(updated_at) across People/Assignments/Deliverables. Do not implement. Ensure it's optional and orthogonal to current caching/ETag logic."

---

## Phase 9 — Coordination With Frontend (Stability)

1) Prompt: Verify API contracts
- "Search the frontend for usages of affected endpoints (deliverables calendar, reports completion, projects filter metadata). Confirm that field names and structures did not change. If any serializer fields were inadvertently altered, revert. No API schema drift is acceptable."

2) Prompt: Browser sanity
- "If a local dev server is available, hit the relevant views from the UI and confirm no regressions. Capture any JS console errors or mismatches."

---

## Phase 10 — Testing & Validation (Repeatable)

1) Prompt: Unit/integration tests
- "Run the test suite. Where we changed query paths, add or adjust minimal tests that assert behavior (not implementation). Do not widen scope. Confirm green."

2) Prompt: Static/security checks
- "Run linters and security scanners (e.g., mypy/ruff/flake8, bandit). Confirm no new warnings related to these changes. Do not 'fix' unrelated warnings."

3) Prompt: Query count sampling (optional)
- "For the updated endpoints/commands, sample query counts (Django debug or logging) before/after to validate reduced round trips where applicable."

4) Prompt: Docs & help text nits
- "Update management command help strings where behavior changed (vendor guard messages, least‑privilege note). Keep docs short and precise; avoid verbose prose."

5) Prompt: API payload stability (contract)
- "For endpoints/views touched (reports totals, projects export streaming), verify response shapes and field names remain identical. Do not widen scope beyond touched paths."

---

## Phase 11 — Rollback & Safety

1) Prompt: Minimal rollback plan
- "Prepare a revert patch list for every file touched. Ensure each change is isolated so it can be reverted independently without cascading effects. Do not introduce feature flags."

2) Prompt: Production readiness checklist
- "Confirm Postgres vendor guards, safe identifier quoting, and least‑privilege schema grants are present in code. Validate that restore/backup flows succeed in staging with realistic data."

---

## Appendix — One‑Shot Prompts (If You Want To Run Per‑Item)

- "Implement vendor guards in the management commands (monitor_performance, restore_database, backup_database, repair_token_blacklist). Keep edits minimal and add a concise message for non‑Postgres vendors. For backup/restore, enforce DSN scheme (no ORM)."
- "In monitor_performance, safely quote table names for per‑table VACUUM using `connection.ops.quote_name`. Remove all manual escaping and wrap under a Postgres vendor guard."
- "In restore_database `_terminate_sessions`, stop interpolating the DB name; use `psql -v dbname=...` and `:\"dbname\"` in SQL. Keep `-v ON_ERROR_STOP=1` (and optionally `-X`). Apply the same pattern anywhere DB name is referenced in psql SQL."
- "Replace `GRANT ALL ON SCHEMA public TO PUBLIC` with least‑privilege statements and optionally grant CREATE to a `DB_APP_ROLE` env var if present."
- "In repair_token_blacklist, add `table_schema` filters (default 'public' via `DB_SCHEMA`) and bind with `%s` parameters. Whitelist schema value with a regex."
- "Prefer single `VACUUM (ANALYZE)`; on error try `VACUUM ANALYZE`; then fallback to `pg_class` enumeration of relkinds `('r','p')` in the validated schema, using safe quoting for each name."
- "Consolidate three report `.count()` calls into one `.aggregate()` and keep output unchanged."
- "Remove per‑chunk `.count()` in projects export progress; compute from known chunk size."
- "Cache `.count()` result in export commands for reuse across log messages."
- "Switch `queryset.count()==0` to `not queryset.exists()` in Excel handler."
- "Frontend contract check: verify no API shape changes in endpoints affected by these backend edits."
- "Run tests, security scans, and capture query counts for the touched endpoints/commands only."
